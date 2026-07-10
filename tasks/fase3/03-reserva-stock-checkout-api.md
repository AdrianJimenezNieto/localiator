# 03 · Crear pedido y reservar stock (API, transaccional)

**Checkbox del roadmap:** «Reserva temporal de stock con expiración durante el checkout».

## Objetivo
Endpoint que, dado el carrito del cliente, **crea un `Order` en estado `PENDING` y reserva el
stock** de cada línea de forma atómica y con expiración. Es el corazón anti-condiciones de
carrera de la Fase 3: dos clientes no pueden reservar el mismo stock a la vez.

## Qué se toca
- `apps/api/src/orders/` (nuevo módulo): `orders.module.ts`, `orders.controller.ts`,
  `orders.service.ts`, `dto/create-order.dto.ts`.
- `apps/api/src/app.module.ts` — registrar el módulo.

## Cómo implementarlo
1. **Endpoint `POST /orders`** (`@Roles(BUYER, ADMIN)`, requiere email verificado). Recibe
   solo `[{ itemType, itemId, quantity }]`; **el precio se ignora** y se lee de BD.
2. **Todo dentro de una transacción Prisma** (`prisma.$transaction`) con nivel de aislamiento
   suficiente. Por cada línea:
   - Leer el artículo y su `stock`.
   - Calcular el **stock disponible** = `stock` − reservas vivas (no expiradas) de ese
     artículo. Para evitar carreras, hacer el descuento con una escritura condicional
     (`updateMany ... where stock >= n`) o un bloqueo de fila (`SELECT ... FOR UPDATE` vía
     `$queryRaw`) — documentar cuál se usa.
   - Si no hay disponible, abortar la transacción y devolver `409 Conflict` con qué línea
     falló.
3. **Crear `Order` + `OrderLine`** con snapshot de nombre y precio actuales, y una
   `StockReservation` por línea con `expiresAt = now + N minutos` (p. ej. 15 min; constante
   configurable).
4. **Devolver el pedido** (id, líneas, total, `expiresAt`) para que el front arranque el pago
   (tarea 04/05).
5. **Idempotencia básica:** si el mismo usuario reintenta con un carrito idéntico y ya tiene
   un pedido `PENDING` sin expirar, decidir si se reutiliza o se crea otro. Documentar.
6. **Tests:** reserva OK descuenta disponible; dos reservas concurrentes sobre el último
   stock → una `409`; carrito con artículo inexistente → `404`.

## Decisiones / alternativas
- **Disponible = stock − reservas vivas** en vez de descontar `stock` directo: así una reserva
  que expira o un pago fallido (tarea 06) libera stock sin tener que «devolverlo», reduciendo
  estados inconsistentes.
- **Escritura condicional vs. `FOR UPDATE`:** la condicional (`where stock >= n`) es simple y
  suele bastar; el bloqueo de fila es más explícito bajo alta concurrencia. Se elige según lo
  que quede más legible y se justifica en el commit.
- **Reserva con expiración vs. sin ella:** sin expiración un pago abandonado dejaría el stock
  bloqueado para siempre. La expiración (tarea 06 la barre) es innegociable.

## Hecho cuando
- `POST /orders` crea pedido `PENDING` con líneas y reservas con `expiresAt`.
- Concurrencia sobre el último stock resuelve con una sola reserva ganadora (`409` a la otra).
- El total lo fija el servidor desde BD. Hay tests que lo cubren.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
