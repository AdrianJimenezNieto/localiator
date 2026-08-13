# Plan: cerrar el sistema de subastas en tiempo real

Plan end-to-end para dejar terminada la puja en vivo entre usuarios de la web. El **pago
de la subasta queda fuera de alcance** (ver CLAUDE.md → Subastas propias): está
implementado y pendiente solo de validarse con claves reales de Stripe.

## Punto de partida (lo que YA funciona)

Conviene tenerlo claro para no reimplementar nada:

| Pieza | Estado |
|---|---|
| Puja por WebSocket + broadcast a la room | ✅ `auctions.gateway.ts` |
| Concurrencia (`SELECT … FOR UPDATE` en transacción) | ✅ `placeBid` fase 2 |
| Antisniping | ✅ a 5 min → **se baja a 3** |
| Cierre automático, apertura automática, impago + ban + 2ª oportunidad | ✅ crons de `auctions.lifecycle.service.ts` |
| Notificaciones WS (superado, ganado, a punto de cerrar) | ✅ rooms personales `user:<id>` |
| **Emails Resend (superado, ganado, cierre próximo, cancelada)** | ✅ `auction-mail.service.ts` — **solo falta la API key** |
| Cobro del ganador (pedido PENDING + reserva de stock) | ✅ fuera de alcance aquí |
| Andamiaje e2e (app real + Postgres + sockets reales) | ✅ `apps/api/test/e2e/` |

**Lo genuinamente nuevo es la puja proxy.** El resto son ajustes.

---

## Fase 0 — Ajustes sin riesgo

**0.1 Antisniping 5 → 3 min.** Cambiar `ANTISNIPE_WINDOW_MINUTES` en
`auctions.constants.ts` y actualizar los comentarios.

Cuidado con la invariante documentada ahí: `ENDING_SOON_WINDOW` (2 min) debe seguir siendo
**menor** que la del antisniping. Con 2 < 3 se cumple, pero el margen se estrecha: al
extender el cierre se reinicia el flag de "ya avisado", y si las ventanas se igualaran, cada
puja de último minuto reavisaría a todo el mundo en bucle. Hay tests que asumen 5 min y hay
que revisarlos.

**0.2 Activar Resend de verdad.** No es código: dar de alta el dominio en Resend, obtener la
clave y ponerla en `RESEND_API_KEY` (`.env` y `.env.production`). Sin ella `MailService`
registra en el log en vez de enviar — que es justo por lo que ahora mismo no te llegan los
correos de "te han superado" aunque el código esté completo. Ver los placeholders pendientes
del deploy.

---

## Fase 1 — Modelo de datos de la puja proxy

### La decisión de arquitectura (necesita tu OK)

Hoy el líder de una subasta se **deriva**: `highestBid()` hace
`ORDER BY amountCents DESC LIMIT 1`. Con proxy eso deja de valer, porque el líder ya no es
quien tiene el importe visible más alto, sino quien tiene el **máximo** más alto — y el
precio efectivo es función de los dos máximos más altos.

Dos formas de resolverlo:

**Opción A — seguir derivándolo de `Bid`.** Añadir `maxAmountCents` a `Bid` y ordenar por
`maxAmountCents DESC, createdAt ASC`. No desnormaliza nada, pero el precio efectivo hay que
recalcularlo en cada lectura, y los empates de máximo quedan a merced de la resolución de
milisegundos del reloj.

**Opción B (recomendada) — desnormalizar el estado del líder en `Auction`.** Tres columnas
nuevas: `currentPriceCents`, `leaderUserId`, `leaderMaxCents`. `Bid` pasa a ser historial y
auditoría.

Recomiendo **B**. El motivo de fondo: la fila de `Auction` **ya se bloquea** con
`SELECT … FOR UPDATE` en cada puja, así que el estado del líder queda protegido por el mismo
lock que ya tienes, sin añadir un solo mecanismo de concurrencia. El algoritmo se vuelve
"leo tres campos, calculo, escribo tres campos" en vez de una consulta con desempate sutil, y
el empate se resuelve por una **regla explícita** ("a un empate no se destrona al líder") en
vez de por comparación de timestamps. El coste es mantener la desnormalización sincronizada,
pero solo hay un sitio que la escribe: `placeBid`.

### Cambios de esquema

```prisma
model Auction {
  // Estado del proxy. Fuente de verdad del precio y del líder; se escribe solo
  // dentro del lock de placeBid.
  currentPriceCents Int?     // null mientras no haya ninguna puja.
  leaderUserId      String?
  leaderMaxCents    Int?     // PRIVADO: no sale nunca por el canal en vivo.
}

model Bid {
  maxAmountCents Int      // techo del pujador. PRIVADO.
  isAutomatic    Boolean  @default(false) // la generó el proxy, no una acción humana.
}
```

Migración con **backfill** de las subastas existentes (`currentPriceCents` y
`leaderUserId` desde la puja máxima actual; `maxAmountCents = amountCents`, que es
exactamente lo que significaba una puja antes del proxy).

---

## Fase 2 — El algoritmo de puja proxy

**Este es el núcleo que quieres picar tú.** Va dentro de la transacción y del lock que ya
existen en `placeBid` fase 2. El parámetro deja de ser "el importe que pujo" y pasa a ser
"mi máximo".

```
current = currentPriceCents      Lmax = leaderMaxCents
L       = leaderUserId           incr = minIncrementCents

mínimo válido = (current == null) ? startingPrice : current + incr
si maxCents < mínimo válido            → BID_TOO_LOW

1. No hay líder (primera puja)
   precio ← startingPrice;  líder ← yo;  Lmax ← maxCents

2. Ya soy el líder (subo mi propio techo)
   si maxCents <= Lmax → rechazo (no se puede bajar el máximo)
   precio no cambia;  Lmax ← maxCents        // nadie se entera: no hay evento

3. maxCents > Lmax  (le gano al líder)
   precio ← min(maxCents, Lmax + incr)
   líder ← yo;  Lmax ← maxCents
   → el líder anterior SÍ pierde: notificación "te han superado"

4. maxCents <= Lmax  (el líder aguanta; incluye el empate)
   precio ← min(Lmax, maxCents + incr)
   líder sin cambios
   → el que acaba de pujar queda superado AL INSTANTE: la notificación es para él
```

El caso 4 es el que cumple lo que pediste: si tienes 100 y alguien puja 25, el sistema sube
tu puja al mínimo necesario y **a ti no te notifica nada**, porque tu máximo sigue en pie. Solo
se notifica a quien ve su techo superado. El empate cae en el caso 4 por diseño: `<=`, no `<`,
así que quien puso su máximo primero conserva el liderato.

Puntos que hay que decidir al picarlo y que no son obvios:

- **Qué filas de `Bid` se escriben.** Propuesta: en el caso 3, una fila del retador con
  `amountCents = precio nuevo`; en el caso 4, una fila **automática** del líder
  (`isAutomatic = true`) con el precio nuevo, más la del retador. Así el historial visible
  cuenta una historia coherente y `winningBidId` sigue apuntando a algo real.
- **El antisniping lo dispara solo la puja HUMANA**, no la respuesta automática del proxy.
  Si no, una guerra de proxies extendería el cierre dos veces por cada puja.
- **`highestBid()` desaparece de los caminos críticos**: cierre, impago y estado pasan a
  leer `currentPriceCents` / `leaderUserId`.

### El punto que hay que rehacer: la segunda oportunidad

`handleUnpaidWinner` busca hoy "el siguiente pujador" como la siguiente puja por importe. Con
proxy eso es incorrecto: el siguiente en la fila es **el segundo `maxAmountCents` más alto
entre usuarios distintos del moroso**, y el precio que le corresponde no es su máximo, sino lo
que habría pagado. Es una consulta nueva sobre `Bid` y merece su propio test.

---

## Fase 3 — Notificaciones

Poco código, pero es donde se rompe la privacidad si se descuida:

- `notification:outbid` se emite **solo** en los casos 3 (al líder destronado) y 4 (al
  retador que nace superado). Nunca en las subidas automáticas dentro del techo.
- El email de Resend ya existe y se dispara en el mismo punto: cambia *cuándo* se llama, no
  el envío.
- **`leaderMaxCents` y `maxAmountCents` no salen jamás** por `bid:accepted`, `auction:state`
  ni el historial. Es el dato más sensible del sistema: quien lo conozca te gana por un
  céntimo. Va en el mismo saco que el enmascarado RGPD de `auctions.mask.ts`.
- `auction:state` sí debe incluir **tu propio** máximo (`myMaxCents`), calculado por socket
  a partir de la identidad autenticada del handshake. Solo el tuyo.

---

## Fase 4 — Frontend

- `AuctionPage`: el input pasa de "importe" a **"tu puja máxima"**, con un texto que explique
  el mecanismo (pujamos por ti lo mínimo necesario y subimos solo si hace falta). Sin esa
  explicación, un usuario que escribe 100 y ve que la puja marca 20 cree que hay un error.
- Mostrar "Tu máximo actual: X €" cuando lo tenga, y permitir subirlo.
- `useAuctionSocket`: añadir `myMaxCents` al estado y actualizarlo tras pujar.
- El historial marca las pujas automáticas para que se entienda por qué el precio sube solo.

---

## Fase 5 — Tests

Sobre el andamiaje e2e ya montado (`apps/api/test/e2e/`). Los casos que no pueden faltar:

1. Proxy sube solo: A máximo 100, B puja 25 → precio sube al mínimo necesario, **A no recibe
   `notification:outbid`**.
2. Retador superado al instante (caso 4): B recibe `outbid` sin haber liderado nunca.
3. Empate: A y B con máximo 100 → gana A, que llegó primero.
4. **El máximo no se filtra**: ningún evento del canal contiene `leaderMaxCents` ni
   `maxAmountCents`. Test de regresión de privacidad, en la línea del que ya existe para el
   aviso de superado.
5. Antisniping a 3 min, y que la respuesta automática del proxy **no** extienda el cierre.
6. Concurrencia: N pujas simultáneas sobre la misma subasta → un solo líder coherente.
7. Segunda oportunidad con proxy: el siguiente es el segundo máximo, no el segundo importe.

---

## Estado

Adrián pidió que lo picara Claude entero. Situación a 4 de agosto de 2026:

| Fase | Estado |
|---|---|
| 0.1 antisniping 3 min | ✅ `auctions.constants.ts` |
| **0.2 clave de Resend** | ⏳ **pendiente, es de Adrián**: dar de alta el dominio y poner `RESEND_API_KEY` |
| 1 esquema + migración con backfill | ✅ `20260804124132_puja_proxy_maximo` |
| 2 algoritmo proxy | ✅ `auctions.proxy.ts` (función pura) + `placeBid` |
| 2 segunda oportunidad con proxy | ✅ `handleUnpaidWinner` ordena por máximo |
| 3 notificaciones y privacidad de los máximos | ✅ |
| 4 frontend | ✅ `AuctionPage` + `useAuctionSocket` |
| 5 tests | ✅ 11 unitarios de la regla + 7 e2e |

Verificado: 229 tests unitarios y 11 e2e en verde, `tsc` y `eslint` limpios, build del
monorepo correcto.

## Fase 6 — Endurecido para producción (5 de agosto de 2026)

Repaso posterior con la pregunta "¿esto aguanta corriendo semanas sin que nadie lo mire?".
Tres arreglos y dos decisiones:

- **Rate limit del gateway por USUARIO, no por socket** (`auctions.gateway.ts`). Antes la
  clave era `client.id`, así que abrir dos pestañas duplicaba el cupo de pujas y el límite
  dejaba de significar nada. Cubierto con un e2e de dos pestañas del mismo usuario.
- **Fuga de memoria en ese mismo mapa**: no había `handleDisconnect`, así que cada socket
  que se conectaba dejaba una entrada para siempre. Ahora se poda de forma perezosa
  (`sweepRateLimit`), aprovechando el tráfico en vez de con un `setInterval` que habría que
  parar en los tests. El mapa queda acotado a quien está pujando ahora mismo.
- **Las pujas automáticas se marcan también EN VIVO**: `bid:accepted` no llevaba
  `isAutomatic`, así que la subida del proxy solo se distinguía al recargar la ficha. Quien
  miraba en directo veía el precio subir sin que nadie pujara. El front ya lo pintaba: solo
  faltaba el campo en el evento.
- **Decisión sobre la privacidad de los máximos.** El máximo de un pujador **ya batido** es
  público en el historial y se mantiene así: es el registro veraz y es lo único que explica
  la subida automática del líder (criterio de eBay). Lo que nunca sale es el máximo del
  **líder en pie**, que es el único explotable. Redacción de CLAUDE.md corregida para decir
  esto con precisión, y test e2e que fija las dos mitades.
- **Requisito de una sola instancia**, hasta ahora implícito: rooms de Socket.IO y rate
  limit viven en memoria. Documentado en CLAUDE.md → Despliegue con lo que haría falta
  (adaptador de Redis) si algún día se escala. Los crons ya son idempotentes y aguantarían.

## Pendientes conocidos

- **`RESEND_API_KEY`**: hasta que exista, el email de "te han superado" se escribe en el log
  en vez de enviarse. El código está y funciona. **Es lo único que impide considerar el
  sistema terminado de cara a usuarios reales**: sin él, el aviso no llega con la pestaña
  cerrada, que es justo el caso para el que existe.
- **Pago de la subasta**: fuera de alcance por decisión explícita (ver CLAUDE.md).
