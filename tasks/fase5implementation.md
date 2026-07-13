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
