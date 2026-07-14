# Fase 5 — Notas de implementación (para revisión)

Documento vivo que explica **qué** se ha construido en cada tarea de la Fase 5 y,
sobre todo, **por qué** se decidió así. Pensado para que Adrián revise el código y
la arquitectura con contexto, sin tener que reconstruir las decisiones desde el
diff. Cada sección se corresponde con un `.md` de `tasks/fase5/` y con un PR.

Convención del proyecto: dinero siempre en **céntimos** (`Int`), nunca `Float`.
Cada tarea = una rama + un PR + squash-merge con CI en verde.

---

## Tarea 01 · Esquema Prisma: Subasta, Puja, ganador

**Qué**: modelos `Auction`, `Bid` y enum `AuctionStatus` en `schema.prisma`, más
una subasta de ejemplo en el seed.

**Decisiones clave**
- **`itemType`/`itemId` polimórfico** (reutiliza `OrderItemType`): la subasta
  apunta a un `Product` o `Lot`, que son entidades separadas sin FK común. Igual
  que `OrderLine`. Contrapartida: Prisma no fuerza la integridad de `itemId`; se
  valida en el servicio. Se reutiliza `OrderItemType` en vez de crear un enum
  nuevo porque los valores y el significado son idénticos.
- **`endsAt` mutable**: columna normal, no calculada, porque el antisniping
  (tarea 05) la moverá a `now + 5 min` ante pujas de último segundo.
- **Ganador desnormalizado** (`winnerUserId` + `winningBidId @unique`): se fija al
  cerrar (tarea 06) para no recalcular la puja máxima al cobrar (09) ni en el
  impago (07). `winningBidId` es `@unique`: una puja no gana dos subastas.
- **Historial de pujas = filas `Bid`** ordenadas por `createdAt`. Las pujas son
  inmutables, así que no hace falta una tabla de historial aparte.
- **Índice `[auctionId, amountCents]`** en `Bid` para leer la puja máxima rápido
  (`ORDER BY amountCents DESC LIMIT 1`).

**Ciclo de vida** (`AuctionStatus`): `SCHEDULED → LIVE → CLOSED → PAID`, más
`CANCELLED`. Las transiciones legales las valida el servicio, no el enum (mismo
criterio que `OrderStatus`).

---

## Tarea 02 · Reglas de puja

**Qué**: módulo `apps/api/src/auctions/` con la lógica de negocio que valida una
puja, aislada del tiempo real y de la concurrencia.

**Arquitectura**
- `AuctionsService.placeBid(auctionId, userId, dto)` es la **única puerta de
  entrada** de una puja. El gateway de tiempo real (tarea 03) la reutiliza en vez
  de duplicar la validación, para que HTTP y WS no diverjan nunca.
- DTO (`PlaceBidDto`) valida solo **forma** (`amountCents` entero acotado); la
  regla de negocio (comparar con la máxima, estado de la subasta) vive en el
  **servicio**, donde se puede testear con datos.

**Reglas aplicadas (en orden)**
1. Email verificado (se lee de BD; el flag no viaja en el JWT). Misma política que
   comprar.
2. Subasta `LIVE` y `now ∈ [startsAt, endsAt)`. Si no → `AUCTION_CLOSED`.
3. Importe `>= startingPriceCents` (primera puja) o `>= máxima + minIncrementCents`.
   Si no → `BID_TOO_LOW`.
4. El pujador no es ya el líder → `SELF_OUTBID` (no tiene sentido superarse a uno
   mismo; inflaría el precio sin competencia real).

**Errores con código estable**: `409 Conflict` con payload `{ code, message }`
(en vez del string suelto que usa `orders`) para que el front dé feedback sin
parsear el mensaje. Códigos en `BidRejectReason`.

**Deudas anotadas en el código** (TODOs en su sitio, como pide el enunciado):
- `TODO(tarea 04)`: envolver "leer máxima → validar → insertar" en una transacción
  con bloqueo de fila (concurrencia).
- `TODO(tarea 07)`: rechazar con `BANNED` (el campo `User.bannedAt` aún no existe).

---

## Tarea 03 · WebSockets para pujas en vivo

**Qué**: canal en tiempo real (Socket.IO) para que quien mira una subasta vea las
pujas al instante, más el hook y una página mínima en el front.

**Dependencias nuevas**: `@nestjs/websockets`, `@nestjs/platform-socket.io`,
`socket.io` (api); `socket.io-client` (web).

### Arquitectura y la decisión importante: emisión desde el servicio + `forwardRef`

El problema: una puja puede entrar por **HTTP** (endpoint de la tarea 02) **o** por
**WebSocket**, y en ambos casos los espectadores de esa subasta deben ver el nuevo
precio. Si solo emitiera el gateway al recibir el mensaje `bid`, las pujas hechas
por HTTP no llegarían a los que miran.

Solución: **el `AuctionsService` es el único punto de emisión**. Tras registrar el
`Bid`, `placeBid` llama al gateway para difundir a la room. Así HTTP y WS comparten
un único camino y un único punto de broadcast, que además reutilizarán el
antisniping (05, emite el nuevo `endsAt`), el cierre (06, emite `auction:closed`) y
las notificaciones (08, eventos por usuario).

Esto crea una **dependencia circular**: el gateway usa el servicio (para procesar
el mensaje `bid`) y el servicio usa el gateway (para emitir). Se resuelve con
**`forwardRef`** de NestJS en ambos lados de la inyección.

> **Concepto a repasar**: `forwardRef` y dependencias circulares en NestJS. NestJS
> construye el grafo de dependencias al arrancar; si A necesita B y B necesita A,
> no sabe cuál instanciar primero y falla. `forwardRef(() => X)` le dice "resuelve
> esta referencia más tarde", rompiendo el ciclo. Alternativa considerada:
> `@nestjs/event-emitter` (el servicio emite un evento con nombre string y el
> gateway lo escucha con `@OnEvent`), que desacopla del todo pero pierde el tipado
> de la llamada. Se eligió `forwardRef` por mantener llamadas tipadas y por
> consistencia con cómo el resto del proyecto inyecta servicios directos.

### Gateway (`auctions.gateway.ts`)

- `@WebSocketGateway({ namespace: '/auctions', cors })`, con el **mismo `APP_URL`**
  que el CORS HTTP de `main.ts`.
- **Autenticación del handshake con JWT**: en `handleConnection` se lee
  `client.handshake.auth.token` y se verifica con `JwtService` (mismo secreto que
  el auth HTTP; se registra `JwtModule` en `AuctionsModule`). Si es válido, se
  guarda `client.data.user`; si no, **se deja conectar igual**: el invitado puede
  mirar, pero no pujar (coherente con el rol invitado de `CLAUDE.md`).
  > Ojo: autenticar un WebSocket es distinto del guard HTTP. Los guards de Nest
  > (`JwtAuthGuard`) protegen rutas HTTP; el handshake de Socket.IO no pasa por
  > ellos, así que se verifica el token a mano en el gateway.
- **Rooms por subasta**: `auction:<id>`. El cliente entra con el mensaje `join` al
  abrir la ficha. Una room por subasta (en vez de un canal global) evita mandar a
  cada cliente pujas de subastas que no mira; escala mejor.
- **`join`** → une a la room y envía `auction:state` **solo a ese socket** con el
  estado actual (precio máximo, `endsAt`, pujas recientes enmascaradas). Así el
  front pinta el estado inicial sin un GET REST aparte.
- **`bid`** → exige `client.data.user`; **rate-limit propio en memoria** por socket
  (evita floods; el `ThrottlerGuard` global es HTTP y no cubre WS); delega en
  `placeBid`; al emisor le devuelve ack o `bid:rejected { code }`.

### Privacidad (RGPD)

Nunca se emite email ni nombre. Se manda `userMasked = "Postor " + últimos 4 del
id`, estable por usuario. Suficiente para distinguir postores en la UI sin revelar
identidad.

### Frontend

- `apps/web/src/lib/useAuctionSocket.ts`: hook que conecta al namespace con el
  token en memoria de `useAuth()`, se une a la subasta, mantiene el estado (precio,
  pujas, `endsAt`) reaccionando a los eventos, y expone `placeBid`. La reconexión
  automática la trae Socket.IO de fábrica.
- Página `/subastas/:id`: lista de pujas en vivo + formulario de puja. Mínima, para
  poder verificar que "todos ven el precio al instante".

### Eventos del canal (contrato)

| Evento (server→client) | Cuándo | Payload |
| --- | --- | --- |
| `auction:state` | al unirse (solo a ese socket) | estado inicial completo |
| `bid:accepted` | puja válida (a toda la room) | `{ amountCents, userMasked, endsAt }` |
| `bid:rejected` | puja inválida (solo al emisor) | `{ code, message }` |

| Evento (client→server) | Qué |
| --- | --- |
| `join` | `{ auctionId }` — entrar a la room |
| `bid` | `{ auctionId, amountCents }` — pujar |

---

## Tarea 04 · Control de concurrencia en pujas casi simultáneas

**Qué**: blindar `placeBid` para que dos pujas casi a la vez no ganen ambas sobre
la misma máxima. Cierra el `TODO(tarea 04)`.

**Mecanismo**: **bloqueo de fila** con `SELECT ... FOR UPDATE` sobre la fila de
`Auction`, dentro de una transacción Prisma. Serializa las pujas de *esa* subasta
(otras subastas no se ven afectadas) hasta el commit. Se elige sobre la escritura
condicional (`updateMany ... where`) por **consistencia con la reserva de stock**
de la Fase 3 (`OrdersService.lockItem`) y por ser más explícito de razonar.

**`placeBid` en dos fases**
1. **Fast path (sin lock)**: rechaza lo obvio —subasta cerrada, auto-superarse,
   puja por debajo de la máxima conocida (`BID_TOO_LOW`)— sin coger el lock, para
   no serializar pujas inválidas ni spam.
2. **Fase autoritativa (bajo lock)**: `lockAuction` hace el `FOR UPDATE`, se
   relee la máxima **bajo el lock** y se revalida. Si la máxima **avanzó** desde
   el fast path, es que otra puja ganó la carrera → se rechaza con **`OUTBID`**.
   Si no, se inserta el `Bid`. El broadcast se emite tras el commit.

**Distinción semántica** (un helper `assertBeats` con un `tooLowReason`
parametrizado la produce sin duplicar código):
- `BID_TOO_LOW`: pujaste por debajo a sabiendas de la máxima que veías.
- `OUTBID`: tu puja era válida al enviarla, pero alguien te adelantó entre medias.

**Helpers extraídos** (reutilizados por HTTP y por el lock, y de aquí en adelante
por 05/06): `lockAuction`, `highestBid`, `assertOpen`, `assertBeats`.

> **Concepto a repasar**: `SELECT ... FOR UPDATE` y transacciones Prisma
> interactivas (`$transaction(async (tx) => …)`). El lock se mantiene hasta el
> commit; una segunda transacción que quiera la misma fila espera. Es el mismo
> concepto que ya salió con la reserva de stock.

### Nota honesta sobre los tests (importante para la revisión)

El `.md` pide un test que "lance N pujas concurrentes". **No se ha hecho un test de
carrera contra BD real**, y es una decisión consciente, no un olvido:
- Todo el proyecto testea con `prismaMock` (mocks), no con Postgres real.
- La **CI no aplica migraciones** antes de los tests (solo `prisma generate`), así
  que un spec que tocara BD real fallaría (no hay tablas). La reserva de stock —su
  análoga— tampoco se testeó a nivel de BD por lo mismo.

Lo que **sí** se testea (determinista, sin hilos): que se **toma el lock**
(`$transaction` + `$queryRaw` invocados) y que el camino de carrera produce
`OUTBID` (simulando que la máxima avanzó entre el fast path y el lock con
`mockResolvedValueOnce`). La serialización real la da el `FOR UPDATE` a nivel de
Postgres, idéntico al patrón de stock ya en producción. Si más adelante se monta un
arnés de test con BD real (migraciones en CI), aquí encajaría un test de carrera de
verdad con `Promise.all`.

---

## Tarea 05 · Antisniping (extensión automática del cierre a 5 min)

**Qué**: si llega una puja válida cuando quedan menos de 5 min, el cierre se mueve
para dar tiempo a reaccionar y evitar el "sniping" (ganar en el último segundo).

**Dónde**: **dentro de la misma transacción y del mismo lock** que registra la puja
ganadora (tarea 04). Es lo importante: puja aceptada y cierre extendido son
**atómicos**. Un proceso aparte podría aceptar la puja pero perder la extensión por
una carrera.

**Regla**: si `endsAt - now < ANTISNIPE_WINDOW_MS` (5 min), se pone
`endsAt = now + 5 min`. Se elige **`now + 5 min`** (ventana de reacción constante)
en vez de *sumar* 5 min al `endsAt`, que dejaría ventanas raras si varias pujas
caen juntas. El umbral y la extensión son la **misma constante configurable**
(`auctions.constants.ts`), no un número mágico repartido.

**Propagación**: tras el commit, si hubo extensión, `broadcastExtended` emite
`auction:extended { endsAt }` a la room; el hook del front actualiza la cuenta
atrás. La **verdad del `endsAt` está en el servidor**; el front solo lo refleja.

**Coherencia con el cierre (tarea 06)**: el cierre releerá siempre el `endsAt`
actual bajo lock, así respeta las extensiones de última hora.

> **Concepto a repasar**: por qué la extensión debe ir en la MISMA transacción que
> la puja (atomicidad), y la sincronización de relojes cliente/servidor (el front
> cuenta atrás, pero el `endsAt` real vive en el servidor).

---

## Tarea 06 · Cierre automático de subasta y asignación de ganador

**Qué**: la subasta se cierra sola al vencer `endsAt`, fija el ganador (la puja
máxima) o la marca desierta, y deja los ganchos para notificaciones (08) y cobro (09).

**Disparo — cron, no timer** (`AuctionsCloserService`, `@Cron(EVERY_MINUTE)`): cada
minuto busca subastas `LIVE` con `endsAt <= now` (`findDueAuctions`) y las cierra.
Se elige cron frente a un timer por subasta porque **sobrevive a reinicios**: un
timer en memoria se perdería y la subasta no se cerraría nunca. Mismo criterio que
el barrido de reservas de la Fase 3.

**`closeAuction(id)` — transaccional y con lock**, por las mismas razones que una
puja:
- **Relee `endsAt` bajo el lock**: una puja de última hora pudo extenderlo
  (antisniping); si ahora `endsAt > now`, no se cierra (`not_due`).
- **Idempotente**: solo actúa si sigue `LIVE`. Un cron solapado o un reinicio que
  reprocese la misma subasta no reasigna ganador (`noop`).
- **Ganador desnormalizado**: fija `winnerUserId` + `winningBidId` (los campos que
  dejó la tarea 01), o los deja a null si no hubo pujas (desierta, `closed_empty`).

**Resultado tipado** (`CloseResult`): los outcomes de "no cierre"
(`not_found`/`noop`/`not_due`) hacen la idempotencia explícita y testeable, en vez
de un booleano opaco.

**Emisión y ganchos**: tras el commit, `broadcastClosed` emite `auction:closed`
(ganador enmascarado o null) a la room. Ahí quedan anotados los `TODO(tarea 08)`
(notificar ganado/no ganado) y `TODO(tarea 09)` (crear el `Order` del ganador).

> **Concepto a repasar**: `@nestjs/schedule` / `@Cron`, por qué un cron resiste
> reinicios mejor que un timer, e **idempotencia** de un cierre (evitar dobles
> cierres con cron solapado).

---

## Tarea 07 · Impago del ganador: segunda oportunidad + ban automático

**Qué**: si el ganador no paga en plazo, se le **banea** (no vuelve a pujar) y la
subasta pasa al **siguiente pujador** (segunda oportunidad). Si no queda nadie,
queda desierta. Cierra además el bucle del `BANNED` que ya anticipaban las reglas
de puja (tarea 02).

**Modelo**:
- `User.bannedAt` + `User.banReason`: **flag de ban global** (MVP). La propia fila
  es la **traza de auditoría** de la acción (cuándo y por qué), en vez de forzar un
  `AuditLog` pensado solo para precio/stock (`Int oldValue/newValue`). Si algún día
  hace falta granularidad (histórico, desbanes), se migra a una tabla de bans.
- `Auction.paymentDueAt`: plazo de pago del **ganador actual**. Se fija al cerrar
  con ganador (tarea 06) y se **reinicia** en cada segunda oportunidad.

**"No pagó" = sigue `CLOSED`**: el cobro (tarea 09) pasará la subasta a `PAID`. Así,
una subasta `CLOSED` con `winnerUserId` y `paymentDueAt <= now` es exactamente un
impago. `findUnpaidWinners()` las busca; el cron las procesa.

**Disparo — segundo cron** en `AuctionsCloserService` (`handleUnpaidWinners`,
`@Cron(EVERY_MINUTE)`), mismo criterio que el cierre: un cron **sobrevive a
reinicios** y `handleUnpaidWinner` es idempotente, así que solapes o reintentos no
rebanean ni reasignan dos veces.

**`handleUnpaidWinner(id)` — transaccional, con lock e idempotente**:
- **Lock de fila** (`SELECT ... FOR UPDATE`) leyendo los campos del *ciclo de vida*
  (`status`, `winnerUserId`, `paymentDueAt`), no los "biddables". Relee bajo el lock
  y **no actúa** si ya no está `CLOSED`, si no hay ganador (`noop`), o si el plazo no
  ha vencido / se reinició (`not_due`).
- **Banea al moroso** con `updateMany({ where: { id, bannedAt: null }, ... })`: el
  `bannedAt: null` en el `where` hace el ban **idempotente** (si ya estaba baneado,
  no reescribe fecha ni motivo).
- **Segunda oportunidad**: la puja más alta de un usuario **NO baneado**
  (`user: { bannedAt: null }`). Como el moroso queda baneado en **esta misma
  transacción**, sus pujas quedan excluidas automáticamente — y las de morosos
  anteriores en cadena — **sin llevar una lista manual de descartados**. Esa es la
  decisión de diseño clave: banear primero deja el "siguiente" bien definido con una
  sola consulta.
- Si hay siguiente → nuevo `winnerUserId`/`winningBidId` y `paymentDueAt` reiniciado;
  sigue `CLOSED`. Si no → `CANCELLED` (desierta), ganador a null.

**Resultado tipado** (`UnpaidResult`): `not_found`/`noop`/`not_due` (sin acción,
idempotencia explícita) y `reassigned`/`cancelled_empty` (con el `bannedUserId`).

**Cierre del bucle en `placeBid`**: `assertCanBid` sustituye a `assertEmailVerified`
y lee `emailVerifiedAt` + `bannedAt` de una sola consulta. Un baneado se rechaza con
`reject(BANNED)` → **409 con `code`**, el mismo mecanismo que los demás motivos de
puja, para que HTTP y WS lo muestren igual (el gateway solo sabe reenviar el `code`
de un `ConflictException`). El email sin verificar sigue siendo un 403 aparte.

**Emisión y ganchos**: tras el commit, `broadcastClosed` reemite `auction:closed`
(nuevo ganador enmascarado, o null si desierta) para mantener la room en sync.
Quedan los `TODO(tarea 08)` (notificar "segunda oportunidad" al nuevo ganador y
"baneado" al moroso) y `TODO(tarea 09)` (reabrir el cobro / liberar el artículo).

> **Conceptos a repasar**: cómo el flag de ban **cierra el bucle** con la validación
> de puja (tarea 02); diseño de un **job idempotente** (banear con `bannedAt: null`
> en el `where`, releer bajo lock); y por qué banear-antes-de-buscar-siguiente
> simplifica el "saltar todas las pujas del moroso" a una sola consulta.

---

## Tarea 08 · Notificaciones en tiempo real (superado, ganado, a punto de cerrar)

**Qué**: avisar a cada pujador de lo que le importa por **dos canales
complementarios**: WebSocket (instantáneo, tarea 03) y email de respaldo (Resend,
el mismo transporte de los pedidos). Tres eventos: **te superaron**, **has ganado**
(cierre normal y segunda oportunidad) y **a punto de cerrar**; más el email de
**baneado por impago** al moroso (tarea 07).

**Rooms por usuario** (`AuctionsGateway`): además de la room de la subasta
(`auction:<id>`), al autenticarse el socket entra a `user:<id>`. Los avisos
**personales** (superado, ganado) se emiten a esa room, no a la de la subasta: así
llegan a **todas las pestañas** del usuario y **nunca** exponen su identidad a los
demás espectadores (RGPD). El aviso "a punto de cerrar" sí va a la room de la
subasta: no es personal (la cuenta atrás la ve todo el mundo).

- `notifyOutbid(userId, ...)` / `notifyWon(userId, ...)` → room de usuario.
- `broadcastEndingSoon(auctionId, endsAt)` → room de la subasta.

**Superado (`outbid`)** en `placeBid`: la fase transaccional ahora devuelve
`previousLeaderId` (el `highest.userId` **antes** de crear la puja; `null` en la
primera puja). Tras el commit, si esa puja destronó a alguien, se le avisa **solo a
él** por WS + email. Una vez **por pérdida de liderato**, no en cada puja intermedia:
enterarse de las pujas que siguen no le aporta al que ya no es líder, y evita spam.

**Has ganado (`won`)**: enganchado al cierre (tarea 06, `secondChance=false`) y a la
segunda oportunidad (tarea 07, `secondChance=true`). Sustituye los `TODO(tarea 08)`
que dejaron esas tareas. WS a la room del ganador + email con el importe e (de
momento) enlace a la ficha; el enlace de pago real llega en la tarea 09. En la
segunda oportunidad, además, email de **ban** al moroso (que casi seguro no está
conectado, por eso el email es el canal fiable).

**A punto de cerrar (`ending-soon`)** — el punto con más chicha por los duplicados:
- **Guard `Auction.endingSoonNotifiedAt`** (nuevo campo + migración): marca que ya
  se avisó, para no repetir.
- **Segundo cron** en `AuctionsCloserService` (`handleEndingSoon`, cada minuto)
  busca subastas `LIVE` dentro de la ventana y sin avisar (`findEndingSoon`).
- **`notifyEndingSoon` reclama el aviso de forma atómica** con un `updateMany`
  condicional (marca `endingSoonNotifiedAt` solo si seguía a `null` y en ventana).
  Solo la pasada que "gana" la fila (`count === 1`) emite → **idempotente**, dos
  crons solapados no duplican. Reclamar **antes** de emitir evita el email doble si
  emitir tarda.
- **Interacción con el antisniping (clave)**: al extender `endsAt` (tarea 05),
  `placeBid` **reinicia `endingSoonNotifiedAt` a `null`**, para poder reavisar
  cuando la subasta se acerque a su **nuevo** cierre. Para que esto no genere spam,
  la ventana de aviso (`ENDING_SOON_WINDOW_MINUTES = 2`) es **deliberadamente más
  corta** que la del antisniping (5 min): tras extender a `now + 5 min` la subasta
  queda fuera de la ventana de 2 min y el aviso no rearma hasta que vuelva a decaer
  a 2 min de calma. Si fuese `>= 5`, cada puja de último minuto reavisaría.

**Tolerancia a fallos**: `AuctionMailService` (nuevo, espejo de `OrderMailService`)
**captura y registra** cualquier fallo de email en vez de propagarlo — un email
caído no debe romper la puja/cierre, que ya ocurrieron. Por eso los emails se
disparan con `void` (fire-and-forget) tras el commit.

**Frontend**: `useAuctionSocket` expone `endingSoon` (bool) y `notice`
(`{ kind: 'outbid' | 'won', ... }`); `AuctionPage` pinta un banner ámbar (superado),
verde (ganado) o naranja (a punto de cerrar).

**Tests** (`auctions.service.spec.ts`, 27 en verde): superar dispara `outbid` una
vez; primera puja no; extender reinicia el guard; cierre dispara `won`; segunda
oportunidad dispara `won(secondChance)` + ban; `notifyEndingSoon` emite al reclamar
y **no** emite si otra pasada ya reclamó (`count === 0`).

> **Conceptos a repasar**: rooms por usuario vs. por subasta en Socket.IO;
> **reclamar-antes-de-emitir** con `updateMany` condicional como guard idempotente;
> y por qué la ventana de "a punto de cerrar" debe ser **más corta** que la del
> antisniping para no reavisar en cada extensión.
