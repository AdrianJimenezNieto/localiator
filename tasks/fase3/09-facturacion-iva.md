# 09 · Facturación automática con IVA tras el pago

**Checkbox del roadmap:** «Facturación automática con IVA tras el pago».

## Objetivo
Generar una factura con el IVA correcto para cada pedido pagado, de forma automática al
confirmarse el cobro (tarea 06), y ponerla a disposición del cliente.

## Qué se toca
- `apps/api/prisma/schema.prisma` — modelo `Invoice` (numeración, importes, IVA).
- `apps/api/src/invoicing/` (nuevo módulo): generación y numeración.
- Disparo desde el flujo del webhook (tarea 06), tras marcar el pedido `PAID`.

## Cómo implementarlo
1. **Modelo `Invoice`**: `id`, `orderId @unique`, `number` (serie legal correlativa, p. ej.
   `2026-000123`), `issuedAt`, `netCents`, `vatRateBps` (tipo de IVA en puntos básicos, p. ej.
   2100 = 21 %), `vatCents`, `grossCents`, datos fiscales mínimos del emisor y del cliente.
2. **Numeración correlativa sin huecos:** generar el número dentro de una transacción con un
   contador atómico por serie/año; las facturas no pueden saltarse números (requisito legal).
3. **Cálculo del IVA:** desglosar del `totalCents` del pedido. Definir el/los tipos aplicables
   (general 21 % por defecto; anotar si algún producto lleva tipo distinto). El precio del
   catálogo es IVA incluido o no → **decidir y documentar** (afecta al desglose).
4. **Documento de factura:** al menos un PDF o HTML descargable. Para el MVP puede ser una
   plantilla HTML→PDF simple; evitar SaaS de pago (`CLAUDE.md`).
5. **Entrega al cliente:** enlace de descarga en el detalle del pedido y adjunto/enlace en el
   email de confirmación (tarea 10).
6. **Tests:** numeración correlativa sin huecos bajo dos facturas seguidas; desglose de IVA
   cuadra (`net + vat = gross`).

## Decisiones / alternativas
- **Facturación propia vs. Stripe Invoicing/Tax:** Stripe Tax/Invoicing es cómodo pero puede
  tener coste y ata el desglose a su lógica; una factura propia es gratis y da control total
  sobre la numeración legal española. Se elige propia para el MVP; revisar con asesoría fiscal
  los requisitos formales (queda anotado como punto legal de la Fase 4).
- **`vatRateBps` como entero:** guardar el tipo en puntos básicos evita decimales flotantes en
  dinero e impuestos.
- **PDF propio (HTML→PDF) vs. servicio externo:** propio por coste; se puede mejorar después.

## Hecho cuando
- Al pagar, se genera una `Invoice` con número correlativo y desglose de IVA correcto.
- El cliente puede descargar su factura. Hay tests de numeración y desglose.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.

> Los datos fiscales del emisor (NIF, razón social, dirección) y el tipo de IVA aplicable son
> **decisiones tuyas / de asesoría**: ver `tasks/manual.md`.
