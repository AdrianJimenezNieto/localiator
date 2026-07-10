# 07 · Pago fallido/abandonado: liberar reserva de stock

**Checkbox del roadmap:** «Manejo de pago fallido / abandonado (liberar reserva de stock)».

## Objetivo
Que el stock reservado no quede bloqueado para siempre cuando un pago falla o el cliente
abandona el checkout. Las reservas caducadas se liberan y el pedido se cancela.

## Qué se toca
- `apps/api/src/orders/reservation-cleanup.service.ts` — nuevo: tarea programada de barrido.
- `apps/api/src/payments/webhook.controller.ts` — manejar eventos de fallo (si no se hizo
  en 06).
- `apps/api/src/app.module.ts` — habilitar `@nestjs/schedule` si no está.

## Cómo implementarlo
1. **Barrido periódico** con `@Cron` (cada 1–2 min): buscar `StockReservation` con
   `expiresAt < now` cuyo pedido siga `PENDING`. Por cada una, en transacción: borrar la
   reserva y pasar el pedido a `CANCELLED` (o dejarlo `PENDING` sin reserva y que el cliente
   reintente — documentar la política elegida).
2. **Evento de fallo de Stripe** (`payment_intent.payment_failed`/`canceled`): liberar la
   reserva del pedido de inmediato en vez de esperar a que expire.
3. **Idempotencia:** liberar una reserva ya liberada no debe romper nada (comprobar
   existencia antes de borrar).
4. **Coherencia con el webhook de éxito (06):** un pago que llega **justo al expirar** no debe
   descontar stock si la reserva ya se liberó. La transacción del webhook debe verificar que
   la reserva sigue viva / el pedido sigue `PENDING` antes de confirmar; si no, tratarlo como
   caso de conflicto (reembolso manual queda fuera del MVP, ver `CLAUDE.md`).
5. **Tests:** reserva expirada se libera y el stock vuelve a estar disponible; evento de fallo
   libera al instante; barrido es idempotente.

## Decisiones / alternativas
- **Cron interno (`@nestjs/schedule`) vs. cola/worker externo:** el cron interno es gratis y
  suficiente para el volumen del MVP; una cola (BullMQ/Redis) añade infra y coste sin
  necesidad ahora. Se elige el cron.
- **Cancelar el pedido vs. dejarlo `PENDING` sin reserva:** cancelarlo es más limpio para la
  conciliación (tarea 08) y para el cliente («este pedido caducó, vuelve a intentarlo»).
- **Disponible = stock − reservas vivas** (tarea 03) hace que liberar una reserva ya
  «devuelva» stock sin escrituras extra sobre `stock`.

## Hecho cuando
- Una reserva que expira libera su stock y el pedido queda cancelado.
- Un pago fallido libera la reserva sin esperar a la expiración.
- La carrera «pago justo al expirar» no descuenta stock indebidamente. Hay tests.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
