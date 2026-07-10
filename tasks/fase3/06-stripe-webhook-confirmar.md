# 06 · Webhook de Stripe: confirmar pedido al cobrar

**Checkbox del roadmap:** «Webhook de Stripe: confirmar pedido al cobrar».

## Objetivo
Recibir los eventos de Stripe y, cuando un pago se completa, **confirmar el pedido de forma
fiable**: pasarlo a `PAID`, descontar el stock real y consumir la reserva. Esta es la fuente
de verdad del pago, no el retorno del navegador (tarea 05).

## Qué se toca
- `apps/api/src/payments/webhook.controller.ts` — nuevo endpoint público del webhook.
- `apps/api/src/main.ts` — **raw body** para la ruta del webhook (necesario para verificar la
  firma).
- `apps/api/src/orders/orders.service.ts` — transición `PENDING → PAID`.

## Cómo implementarlo
1. **Endpoint `POST /payments/webhook`** marcado `@Public()` (Stripe no lleva nuestra sesión)
   y **excluido del rate limiting** de auth.
2. **Verificar la firma** con `stripe.webhooks.constructEvent(rawBody, sig,
   STRIPE_WEBHOOK_SECRET)`. Sin firma válida → `400`. Requiere el **body sin parsear**: en
   `main.ts` usar `express.raw` solo para esta ruta (el resto sigue con JSON).
3. **Manejar `checkout.session.completed`** (evento de la Checkout Session decidida en la
   tarea 04; su `payment_intent` y `metadata.orderId` enlazan con nuestro pedido). Dentro de
   una transacción Prisma:
   - Localizar el `Order` por `stripePaymentIntentId` (o `metadata.orderId`).
   - Si ya está `PAID`, **no hacer nada** (idempotencia: Stripe reintenta y puede duplicar).
   - Descontar `Product.stock`/`Lot.stock` según las líneas, borrar/consumir las
     `StockReservation` del pedido, marcar `status = PAID` y `paidAt = now`.
4. **Manejar `payment_intent.payment_failed`/`canceled`** (o dejarlo para la tarea 07):
   liberar la reserva y dejar el pedido cancelable.
5. **Responder `200` rápido**; el trabajo pesado (emails, factura) se dispara desde aquí pero
   sin bloquear la respuesta a Stripe.
6. **Tests:** firma inválida → `400`; evento duplicado no descuenta stock dos veces; éxito
   pasa a `PAID` y descuenta.

## Decisiones / alternativas
- **Idempotencia por `paymentIntentId` único + chequeo de estado:** Stripe entrega «al menos
  una vez», así que un mismo evento puede llegar varias veces; sin idempotencia se descontaría
  stock de más. Innegociable.
- **Confiar en el webhook, no en `success_url`:** el usuario puede cerrar la pestaña tras
  pagar; solo el webhook garantiza que nos enteramos del cobro.
- **Raw body solo en esta ruta:** verificar la firma exige los bytes originales; parsear a
  JSON antes rompería la verificación.

## Hecho cuando
- Un pago de test dispara el webhook, el pedido pasa a `PAID` y el stock se descuenta una vez.
- Firma inválida se rechaza; eventos duplicados no duplican efectos.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.

> Para probar el webhook en local hace falta la **Stripe CLI** (`stripe listen`): ver
> `tasks/manual.md`.
