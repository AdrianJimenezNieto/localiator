# 04 · Integración de pago con Stripe (API)

**Checkbox del roadmap:** «Integración de pago con Stripe (Checkout / Payment Intents)».

## Objetivo
Que el backend genere, para un pedido `PENDING` ya creado (tarea 03), la sesión/intent de
pago de Stripe que el front usará para cobrar. Sin manejar datos de tarjeta (PCI se delega en
Stripe, `CLAUDE.md`).

## Qué se toca
- `apps/api/src/payments/` (nuevo módulo): `payments.module.ts`, `payments.service.ts`
  (cliente Stripe fino), `payments.controller.ts`.
- `apps/api/src/orders/orders.service.ts` — enlazar pedido ↔ `paymentIntentId`.
- `.env` / `.env.example` — ya existen `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.

## Cómo implementarlo
1. **Servicio Stripe aislado** que instancia el SDK con `STRIPE_SECRET_KEY`. Envolverlo para
   poder mockearlo en tests y no acoplar el dominio al SDK (igual que el `MailService`).
2. **Endpoint `POST /orders/:id/pay`** (dueño del pedido). Verifica que el pedido es del
   usuario, está `PENDING` y **su reserva no ha expirado**; si expiró, `409` y a rehacer.
3. **Crear el intent/sesión** con el `totalCents` del pedido (leído de BD, nunca del cliente)
   y `currency: "eur"`. Guardar `stripePaymentIntentId` en el `Order` (idempotencia del
   webhook, tarea 06). Incluir `metadata: { orderId }` para conciliar (tarea 07).
4. **Reutilizar intent** si el pedido ya tiene uno vivo, en vez de crear otro, para no dejar
   intents huérfanos.
5. **Devolver al front** la `url` de la Checkout Session (opción decidida abajo) para
   redirigir al cliente a la página de pago de Stripe.
6. **Tests** con el SDK mockeado: crea intent con el importe del pedido; rechaza pedido
   ajeno/`PAID`/expirado.

## Decisiones / alternativas
- **Checkout Session (hosted) — DECIDIDO.** Frente a Payment Intents + Elements (embebido),
  se elige la página alojada por Stripe: menos superficie PCI, menos UI que mantener y wallets
  (Apple/Google Pay) sin trabajo extra. Ambas opciones cuestan **solo comisión por
  transacción, sin cuota mensual**; el add-on de pago (Stripe Tax/Invoicing) se evita a
  propósito (factura propia en la tarea 09). Si se quisiera pago embebido en el futuro, se
  migra a Elements sin tocar el backend de pedidos.
- **Importe desde BD:** el importe se toma del `Order`, nunca de un valor que mande el
  cliente, para que no se pueda pagar de menos.

## Hecho cuando
- `POST /orders/:id/pay` devuelve datos de pago de Stripe para un pedido `PENDING` válido.
- El `Order` queda enlazado a su `stripePaymentIntentId`.
- Pedido ajeno/pagado/expirado se rechaza. Hay tests con Stripe mockeado.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar el checkbox en `ROADMAP.md` en el **mismo commit** (se marca aquí; el webhook de la
   tarea 06 lo completa funcionalmente, pero el checkbox de integración se cierra con esto).
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.

> Requiere claves reales de Stripe para probar de punta a punta: ver `tasks/manual.md`.
