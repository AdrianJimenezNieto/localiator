# 11 · Flujo de recogida en almacén (sin envíos)

**Checkbox del roadmap:** «Flujo de recogida en almacén (sin envíos)».

## Objetivo
Cerrar el ciclo del pedido con la recogida física: el admin marca el pedido como listo y como
recogido, el comprador ve el estado y las instrucciones. No hay envíos (`CLAUDE.md`).

## Qué se toca
- `apps/api/src/orders/orders.controller.ts` — transiciones de estado (admin).
- `apps/api/src/orders/orders.service.ts` — máquina de estados y validaciones.
- `apps/web/src/pages/admin/` — gestión de pedidos en el backoffice.
- `apps/web/src/pages/` — «Mis pedidos» / detalle de pedido para el comprador.

## Cómo implementarlo
1. **Transiciones admin** (`@Roles(ADMIN)`):
   - `PAID → READY_FOR_PICKUP` (preparado en almacén).
   - `READY_FOR_PICKUP → PICKED_UP` (entregado al cliente).
   - `PAID/READY_FOR_PICKUP → CANCELLED` como excepción (reembolsos mínimos, `CLAUDE.md`).
   Validar que la transición es legal (no saltar estados); rechazar las inválidas con `409`.
2. **Cada transición** dispara su email (tarea 10) y, si aplica, queda registrada para
   trazabilidad.
3. **Vista de admin**: lista de pedidos filtrable por estado, con botones para avanzar el
   estado y ver líneas/factura.
4. **Vista del comprador**: «Mis pedidos» con estado actual, instrucciones de recogida
   (dirección/horario del almacén) y enlace a la factura (tarea 09).
5. **Instrucciones de recogida** como texto configurable (constante o env), no hardcodeado en
   varios sitios.
6. **Tests:** transición legal OK; transición ilegal → `409`; no-admin no puede cambiar
   estado.

## Decisiones / alternativas
- **Máquina de estados explícita vs. `status` libre:** validar transiciones evita estados
  imposibles (p. ej. `CANCELLED → PICKED_UP`). Se centraliza en el servicio.
- **Sin envíos:** los estados se limitan al flujo de recogida; no hay tracking ni
  transportista (queda en el backlog del roadmap).
- **Reembolso al cancelar:** fuera del MVP más allá de marcar `CANCELLED`; los reembolsos son
  mínimos por política de subastas (`CLAUDE.md`).

## Hecho cuando
- El admin puede avanzar un pedido pagado hasta recogido, con validación de transiciones.
- El comprador ve el estado y las instrucciones de recogida, y accede a su factura.
- Transiciones ilegales y accesos no-admin se rechazan. Hay tests.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(...): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
4. Con esto se cierra la **Fase 3** (MVP de venta). Revisar el roadmap completo de la fase.
