# 04 · Control de concurrencia en pujas casi simultáneas

**Checkbox del roadmap:** «Control de concurrencia (evitar condiciones de carrera en pujas
casi simultáneas)».

## Objetivo
Garantizar que, cuando **dos pujas llegan casi a la vez**, no se acepten ambas por encima de
la misma puja máxima: solo una gana y la otra se rechaza por «tu puja ya no supera la actual».
Cierra el `TODO(tarea 04)` que dejó la tarea 02 y es el corazón anti-condiciones-de-carrera de
la Fase 5 (análogo a la reserva de stock de la Fase 3).

## Qué se toca
- `apps/api/src/auctions/auctions.service.ts` — envolver el registro de puja en una
  transacción con el aislamiento/bloqueo adecuado.
- Tests de concurrencia del módulo de subastas.

## Cómo implementarlo
1. **Todo el «leer máxima → validar → insertar» dentro de una transacción Prisma**
   (`prisma.$transaction`). Sin transacción, dos peticiones leen la misma máxima y ambas creen
   ganar.
2. **Elegir mecanismo y documentarlo** (igual que en la reserva de stock, tarea 03 de Fase 3):
   - **Bloqueo de fila** sobre la subasta (`SELECT ... FOR UPDATE` vía `$queryRaw`) para
     serializar las pujas de esa subasta; o
   - **Escritura condicional**: insertar solo si sigue siendo la máxima (p. ej. guardar
     `highestBidCents` en `Auction` y hacer `updateMany ... where highestBidCents < :amount`),
     y rechazar si afectó 0 filas.
3. **Rechazo limpio del perdedor**: `409 Conflict` con motivo `OUTBID` para que el front lo
   muestre y el usuario pueda repujar.
4. **Mantener coherente `Auction.highestBidCents`** (si se añade ese campo) con la última puja
   ganadora, para lecturas rápidas y para la escritura condicional.
5. **Tests de carrera**: lanzar N pujas concurrentes sobre el mismo precio y comprobar que solo
   una queda registrada como máxima y el resto recibe `OUTBID`.

## Decisiones / alternativas
- **`FOR UPDATE` vs. escritura condicional:** el bloqueo de fila es explícito y fácil de
  razonar bajo alta concurrencia; la condicional es más ligera. Se elige la más legible y se
  justifica en el commit, como se hizo con el stock.
- **Bloquear la fila de `Auction` vs. la tabla de `Bid`:** bloquear la subasta serializa sus
  pujas sin frenar otras subastas; bloquear `Bid` sería más grueso.
- **Aislamiento `Serializable` vs. bloqueo puntual:** el bloqueo puntual sobre la subasta suele
  bastar y evita reintentos por fallos de serialización en toda la transacción.

## Conceptos que probablemente convenga repasar
- **Transacciones Prisma** y niveles de aislamiento (repaso del que ya salió con el stock).
- **`SELECT ... FOR UPDATE`** vs. **escritura condicional** (`updateMany ... where`) como dos
  formas de evitar carreras.
- Cómo **testear concurrencia** de verdad (lanzar promesas en paralelo, no en serie).

## Hecho cuando
- Dos pujas concurrentes sobre el mismo precio → una gana, la otra recibe `OUTBID`.
- Hay tests que reproducen la carrera y pasan de forma estable.
- El `TODO(tarea 04)` de la tarea 02 queda cerrado.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`fix(api): ...` o `feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
