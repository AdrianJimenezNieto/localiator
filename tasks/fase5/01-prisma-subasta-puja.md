# 01 · Esquema Prisma: Subasta, Puja, historial y ganador

**Checkbox del roadmap:** «Esquema Prisma: Subasta, Puja, historial y ganador».

## Objetivo
Modelar en Prisma la **subasta** sobre un producto o lote, sus **pujas**, y el **ganador**.
Es la primera tarea de la Fase 5 porque todo lo demás (reglas de puja, WebSockets, cierre,
impago, cobro) escribe sobre estas tablas. La subasta reutiliza el catálogo existente
(producto/lote como entidades separadas, ver `CLAUDE.md`).

## Qué se toca
- `apps/api/prisma/schema.prisma` — nuevos modelos `Auction`, `Bid` y enum `AuctionStatus`.
- `apps/api/prisma/migrations/` — nueva migración.
- `apps/api/prisma/seed.ts` — opcional: una subasta de ejemplo para desarrollo.

## Cómo implementarlo
1. **`enum AuctionStatus`**: `SCHEDULED`, `LIVE`, `CLOSED`, `PAID`, `CANCELLED`. Reflejan el
   ciclo de vida: programada → en curso → cerrada → cobrada (o cancelada).
2. **`model Auction`**: `id`, `itemType` (`PRODUCT` | `LOT`, reutilizando el patrón polimórfico
   de `OrderLine`), `itemId`, `startingPriceCents`, `minIncrementCents`, `startsAt`, `endsAt`,
   `status` (default `SCHEDULED`), `winnerUserId String?`, `winningBidId String? @unique`,
   `createdAt`, `updatedAt`. Relación `bids Bid[]`.
3. **`model Bid`**: `id`, `auctionId` (relación a `Auction`), `userId` (relación a `User`),
   `amountCents`, `createdAt`. El **historial de pujas** es simplemente todas las filas `Bid`
   de una subasta ordenadas por `createdAt` — no hace falta tabla aparte.
4. **`endsAt` mutable**: es el campo que moverá el antisniping (tarea 05); dejarlo como columna
   normal, no calculada.
5. **Ganador desnormalizado**: `winnerUserId` + `winningBidId` en `Auction` para no recalcular
   el máximo en cada lectura; se fijan al cerrar (tarea 06).
6. **Migración**: `pnpm --filter api prisma migrate dev --name subastas-pujas`.

## Decisiones / alternativas
- **`itemType` + `itemId` polimórfico vs. dos FKs opcionales:** coherente con `OrderLine`;
  producto y lote son entidades separadas, así una columna de tipo + id evita dos relaciones
  medio vacías. La contrapartida es que Prisma no fuerza la FK; se valida en servicio.
- **Historial como filas `Bid` vs. tabla de historial aparte:** las pujas ya son inmutables y
  ordenables por fecha; una tabla extra sería redundante.
- **Ganador desnormalizado vs. calcularlo siempre:** desnormalizar simplifica el cobro (tarea
  09) y el impago/segunda oportunidad (tarea 07), a cambio de fijarlo con cuidado al cerrar.

## Conceptos que probablemente convenga repasar
- **Relaciones y campos `@unique` opcionales en Prisma** (el `winningBidId`).
- Por qué el patrón **polimórfico `itemType`/`itemId`** sacrifica la FK a cambio de
  flexibilidad.

## Hecho cuando
- Existen `Auction`, `Bid` y `AuctionStatus`, con la migración aplicada.
- `pnpm --filter api prisma migrate dev` corre limpio y el seed sigue funcionando.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (`feat(db): ...`).
3. Con la **CI en verde**, abrir PR y hacer **squash and merge** a `main`. Borrar la rama.
