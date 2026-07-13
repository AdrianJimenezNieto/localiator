# 02 · Reglas de puja (incremento mínimo, precio de salida, cierre)

**Checkbox del roadmap:** «Reglas de puja (incremento mínimo, precio de salida, cierre)».

## Objetivo
Implementar en la API la **lógica de negocio** que valida una puja: respeta el precio de
salida, supera la puja máxima actual por al menos el incremento mínimo, y solo se acepta
mientras la subasta está **abierta**. Es la base que luego el endpoint/gateway de pujas
(tareas 03 y 04) invocará; aquí se aísla la regla, sin tiempo real todavía.

## Qué se toca
- `apps/api/src/auctions/` (nuevo módulo): `auctions.module.ts`, `auctions.service.ts`,
  `auctions.controller.ts`, `dto/place-bid.dto.ts`.
- `apps/api/src/app.module.ts` — registrar el módulo.

## Cómo implementarlo
1. **Endpoint `POST /auctions/:id/bids`** (`@Roles(BUYER, ADMIN)`, requiere email verificado).
   Recibe solo `{ amountCents }`.
2. **Validaciones de negocio** (en el servicio, no en el controlador):
   - La subasta existe y su `status` es `LIVE` y `now` está entre `startsAt` y `endsAt`.
   - `amountCents >= startingPriceCents` si no hay pujas; si las hay,
     `amountCents >= maxBid.amountCents + minIncrementCents`.
   - El pujador **no es** quien ya tiene la puja máxima (no tiene sentido superarse a sí mismo).
   - El usuario **no está baneado** (ver tarea 07).
3. **Errores claros**: `409 Conflict` con motivo (`AUCTION_CLOSED`, `BID_TOO_LOW`, `BANNED`…)
   para que el front dé feedback útil.
4. **Registrar la puja**: crear la fila `Bid`. Aquí **todavía sin blindaje de concurrencia**
   pesado; la carrera de pujas casi simultáneas se resuelve en la tarea 04 (transacción).
   Dejarlo anotado con un `// TODO(tarea 04)` para no olvidarlo.
5. **Tests unitarios** de la regla: puja por debajo del incremento → rechazada; primera puja
   igual al precio de salida → aceptada; puja tras `endsAt` → rechazada.

## Decisiones / alternativas
- **Incremento mínimo fijo por subasta vs. escalonado por tramos:** fijo (`minIncrementCents`
  en `Auction`) para el MVP de subastas; el escalonado (incrementos que crecen con el precio)
  se puede añadir después sin romper el esquema.
- **Validar en servicio vs. en DTO:** el DTO valida forma (`amountCents` entero positivo); la
  regla de negocio (comparar con la puja máxima, estado de la subasta) vive en el servicio,
  que es donde se puede testear con datos.
- **Rechazar auto-superarse vs. permitirlo:** rechazarlo evita inflar el precio sin competencia
  real y es el comportamiento habitual en subastas.

## Conceptos que probablemente convenga repasar
- Separación **DTO (forma) vs. servicio (reglas de negocio)** en NestJS.
- Por qué la validación de concurrencia se pospone a la tarea 04 (y qué agujero deja mientras).

## Hecho cuando
- `POST /auctions/:id/bids` acepta pujas válidas y rechaza las que violan precio de salida,
  incremento mínimo o ventana de tiempo, con motivos claros.
- Hay tests unitarios que cubren los casos límite.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
