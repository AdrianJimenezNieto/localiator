# 08 · Conciliación pago recibido ↔ pedido registrado

**Checkbox del roadmap:** «Conciliación pago recibido ↔ pedido registrado».

## Objetivo
Poder afirmar que **cada cobro de Stripe se corresponde con un pedido nuestro y viceversa**,
y detectar descuadres (pagos sin pedido, pedidos «pagados» sin cobro, importes que no cuadran).

## Qué se toca
- `apps/api/src/payments/reconciliation.service.ts` — nuevo: lógica de cotejo.
- `apps/api/src/payments/reconciliation.controller.ts` — endpoint admin de informe.
- (Opcional) `apps/web/src/pages/admin/` — vista de conciliación en el backoffice.

## Cómo implementarlo
1. **Enlace fuerte pedido ↔ pago:** ya existe `Order.stripePaymentIntentId @unique` (tarea 01)
   y `metadata.orderId` en el intent (tarea 04). La conciliación se apoya en ese doble enlace.
2. **Informe (`GET /admin/reconciliation`, solo admin)** para un rango de fechas:
   - Listar `Order` en estado `PAID` con su `paidAt`, `totalCents` y `paymentIntentId`.
   - Consultar Stripe (`paymentIntents.list` / `charges.list`) en el mismo rango y cotejar.
   - Marcar discrepancias: **pago en Stripe sin pedido `PAID`**, **pedido `PAID` sin pago en
     Stripe**, **importes distintos**.
3. **Idempotencia y coste:** cachear/paginar las consultas a Stripe; no llamar en cada carga
   de página. Es una herramienta de admin, no un endpoint público.
4. **Registrar** los descuadres detectados (log de auditoría existente o tabla propia) para
   seguimiento.
5. **Tests** con Stripe mockeado: caso todo cuadra; caso pago sin pedido; caso importe
   distinto.

## Decisiones / alternativas
- **Conciliación bajo demanda (informe) vs. proceso nocturno automático:** para el MVP basta
  un informe que el admin lanza cuando quiera; un job nocturno con alertas se puede añadir
  luego sin rehacer la lógica de cotejo.
- **Fuente de verdad del cobro = Stripe:** ante duda, lo que diga Stripe manda; nuestro estado
  `PAID` debería ser siempre consecuencia del webhook (tarea 06).

## Hecho cuando
- Un admin obtiene un informe que cruza pedidos `PAID` con cobros de Stripe en un rango.
- Se detectan y listan los tres tipos de descuadre.
- Hay tests con Stripe mockeado. **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
