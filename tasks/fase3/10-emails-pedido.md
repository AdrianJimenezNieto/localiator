# 10 · Emails transaccionales de pedido (Resend)

**Checkbox del roadmap:** «Emails transaccionales de pedido (confirmación, cambios de
estado)».

## Objetivo
Avisar al comprador por email en los hitos del pedido: confirmación tras el pago, y cambios
de estado (listo para recoger, recogido, cancelado). Se usa el `MailService` ya existente
sobre Resend.

## Qué se toca
- `apps/api/src/mail/mail.service.ts` — nuevos métodos de envío de pedido (o un
  `order-mail.service.ts` que lo use).
- `apps/api/src/mail/templates/` — plantillas de los correos de pedido.
- Disparos desde `orders.service.ts` (cambios de estado) y desde el webhook (tarea 06).

## Cómo implementarlo
1. **Reutilizar el `MailService`** (ya abstrae Resend; sin clave, registra en log en vez de
   enviar — útil en dev). No acoplar el dominio al SDK de Resend.
2. **Confirmación de pedido** al pasar a `PAID` (disparada desde el flujo del webhook, tarea
   06): resumen de líneas, total, IVA/factura (tarea 09) e instrucciones de recogida en
   almacén.
3. **Cambios de estado** (`READY_FOR_PICKUP`, `PICKED_UP`, `CANCELLED`, tarea 11): un email
   por transición relevante, con plantilla propia.
4. **Envío no bloqueante y tolerante a fallos:** que un fallo de email **no** revierta la
   confirmación del pedido (el pago ya ocurrió). Loguear el fallo; reintento simple opcional.
5. **Plantillas** sencillas y con los datos mínimos; branding sin prioridad (`CLAUDE.md`).
6. **Tests** con `MailService` mockeado: al confirmar pago se llama al envío de confirmación;
   cada transición dispara su email.

## Decisiones / alternativas
- **Disparar emails desde el servicio de dominio vs. desde el controller:** desde el servicio,
  junto a la transición de estado, para que cualquier vía que cambie el estado notifique.
- **Envío síncrono vs. cola:** síncrono pero aislado y tolerante a fallos basta para el MVP;
  una cola de reintentos se puede añadir luego sin cambiar los puntos de disparo.
- **Fallo de email no rompe el pedido:** el pago es la fuente de verdad; el email es
  secundario.

## Hecho cuando
- Al pagar, el comprador recibe (o se registra en log sin clave) el email de confirmación.
- Cada cambio de estado relevante dispara su email. Un fallo de envío no revierte el pedido.
- Hay tests con el mail mockeado. **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.

> Para enviar de verdad (no solo log) hace falta `RESEND_API_KEY` y un dominio verificado:
> ver `tasks/manual.md`.
