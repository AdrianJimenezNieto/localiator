# 09 · Cobro del ganador vía Stripe reutilizando el flujo de pedidos

**Checkbox del roadmap:** «Cobro del ganador vía Stripe reutilizando el flujo de pedidos».

## Objetivo
Cobrar al ganador de una subasta **reutilizando** el flujo de pago de la Fase 3 (Stripe,
webhook, facturación con IVA, recogida en almacén), en vez de montar un pago paralelo. Cierra
la Fase 5: una subasta ganada se convierte en un `Order` normal que sigue el mismo camino que
una venta directa.

## Qué se toca
- `apps/api/src/auctions/auctions.service.ts` — crear el pedido del ganador al cerrar (tarea 06)
  o en la segunda oportunidad (tarea 07).
- `apps/api/src/orders/` — reutilizar la creación de `Order`/`OrderLine` y el pago Stripe
  existentes; añadir un origen «subasta».
- Enlace en la notificación de «has ganado» (tarea 08) hacia el checkout de ese pedido.

## Cómo implementarlo
1. **Al fijar ganador** (tarea 06/07), crear un `Order` `PENDING` para él con una `OrderLine`
   sobre el artículo subastado y **precio = puja ganadora** (snapshot, como en Fase 3). Marcar
   el origen del pedido (campo `source`/`auctionId`) para conciliación.
2. **Reutilizar Stripe** (Payment Intents/Checkout de la Fase 3, tarea 04) y su **webhook**
   (tarea 06 de Fase 3) tal cual: al confirmarse el pago, el pedido pasa a `PAID` y la subasta
   a `PAID`. No duplicar la lógica de webhook.
3. **Plazo de pago**: el `paymentDueAt` de la tarea 07 gobierna el impago; si no paga a tiempo,
   ese flujo banea y reasigna. Si paga, se cancela el temporizador de impago.
4. **Sin reserva de stock** como en venta directa: el artículo ya está «reservado» por ser el
   ganador; no pasa por el carrito. Documentar esa diferencia respecto al flujo normal.
5. **Facturación con IVA y recogida en almacén**: heredadas del flujo de pedidos (tareas 09 y 11
   de Fase 3) sin cambios; el pedido de subasta es un pedido más.
6. **Tests**: ganador paga → `Order` y `Auction` a `PAID`, factura emitida; no paga en plazo →
   se dispara el impago (tarea 07); pago reintentado tras fallo → sin duplicar pedido.

## Decisiones / alternativas
- **Reutilizar el flujo de pedidos vs. pago propio de subastas:** reutilizar evita duplicar
  Stripe, webhook, facturación y conciliación, y hace que un pedido de subasta sea indistinguible
  de una venta directa aguas abajo. Es la razón de que las subastas fueran a la Fase 5 y no antes.
- **Crear el `Order` al cerrar vs. cuando el ganador pulsa «pagar»:** crearlo al cerrar ata el
  precio y el plazo de pago desde el minuto uno y permite el impago automático (tarea 07); dejarlo
  a que el usuario lo inicie complicaría el control del plazo.
- **Con vs. sin reserva de stock:** sin reserva, porque el ganador ya es el único con derecho al
  artículo; meterlo por el carrito sería reintroducir concurrencia que ya no existe.

## Conceptos que probablemente convenga repasar
- Cómo el **webhook idempotente de Stripe** (Fase 3) sirve igual para pedidos de subasta.
- **Conciliación** pago ↔ pedido ↔ subasta con el campo de origen.
- Por qué el pedido de subasta **no pasa por reserva de stock** y qué implica.

## Hecho cuando
- Al ganar, el ganador tiene un `Order` `PENDING` con el precio de su puja y un plazo de pago.
- Paga por el flujo Stripe existente → `Order` y `Auction` a `PAID`, con factura e IVA y recogida
  en almacén, sin código de pago nuevo.
- El impago se apoya en la tarea 07. Hay tests del camino feliz y del impago.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
