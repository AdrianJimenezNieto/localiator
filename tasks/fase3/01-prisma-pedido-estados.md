# 01 · Esquema Prisma: Pedido, líneas y estados

**Checkbox del roadmap:** «Esquema Prisma: Pedido + líneas de pedido + estados (pendiente /
pagado / listo para recoger / recogido / cancelado)».

## Objetivo
Modelar en Prisma el pedido con sus líneas y su máquina de estados, más la **reserva
temporal de stock** que sostendrá el checkout (tareas 03 y 06). Es la primera tarea de la
Fase 3 porque todo lo demás (carrito, pago, webhook, facturación) escribe sobre estas tablas.

## Qué se toca
- `apps/api/prisma/schema.prisma` — nuevos modelos `Order`, `OrderLine`, `StockReservation`
  y enums `OrderStatus`, `OrderItemType`.
- `apps/api/prisma/migrations/` — nueva migración.
- `apps/api/prisma/seed.ts` — opcional: un pedido de ejemplo para desarrollo.

## Cómo implementarlo
1. **`enum OrderStatus`**: `PENDING`, `PAID`, `READY_FOR_PICKUP`, `PICKED_UP`, `CANCELLED`.
   Reflejan el flujo de recogida en almacén (sin envíos) de `CLAUDE.md`.
2. **`model Order`**: `id`, `userId` (relación a `User`), `status` (default `PENDING`),
   `totalCents`, `currency` (`"eur"`), `stripePaymentIntentId String? @unique` (para
   conciliación y idempotencia del webhook, tarea 06), `createdAt`, `updatedAt`,
   `paidAt DateTime?`. Relación `lines OrderLine[]`.
3. **`model OrderLine`**: copia **desnormalizada** del artículo en el momento de la compra:
   `orderId`, `itemType` (`PRODUCT` | `LOT`), `itemId`, `nameSnapshot`, `unitPriceCents`,
   `quantity`, `lineTotalCents`. Se guarda snapshot del nombre y precio porque el producto
   puede cambiar o borrarse después y el pedido debe seguir siendo fiel a lo comprado.
4. **`model StockReservation`**: `id`, `itemType`, `itemId`, `quantity`, `orderId`,
   `expiresAt`, `createdAt`. Es lo que impide vender dos veces el mismo stock mientras un
   cliente paga (tarea 03).
5. **Sin descontar stock aquí.** El descuento efectivo de `Product.stock`/`Lot.stock` ocurre
   al confirmar el pago (tarea 06); mientras tanto solo hay reserva.
6. **Migración**: `pnpm --filter api prisma migrate dev --name pedidos-reservas`.

## Decisiones / alternativas
- **Líneas desnormalizadas (snapshot) vs. solo `itemId`:** el snapshot preserva el histórico
  aunque el catálogo cambie; referenciar solo el id dejaría pedidos «rotos» si se edita o
  borra el producto. Se elige snapshot.
- **`itemType` + `itemId` (polimórfico) vs. dos FKs opcionales:** producto y lote son
  entidades separadas (`CLAUDE.md`), así que una columna de tipo + id evita dos relaciones
  medio vacías. La contrapartida es que Prisma no fuerza la FK; se valida en servicio.
- **`StockReservation` como tabla propia vs. campos en `Order`:** tabla propia porque un
  pedido tiene varias líneas y cada una reserva stock distinto, y facilita expirar reservas
  por lotes (tarea 06).

## Hecho cuando
- Existen `Order`, `OrderLine`, `StockReservation` y los enums, con la migración aplicada.
- `pnpm --filter api prisma migrate dev` corre limpio y el seed sigue funcionando.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (`feat(db): ...`).
3. Con la **CI en verde**, abrir PR y hacer **squash and merge** a `main`. Borrar la rama.
