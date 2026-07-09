# 04 · Registro de auditoría al cambiar precio/stock

**Checkbox del roadmap:** «Registro de auditoría al cambiar precio/stock».

## Objetivo
Registrar en `AuditLog` quién cambió el precio, el descuento o el stock de un producto o
lote, y cuándo. El modelo `AuditLog` ya existe (Fase 1); aquí se **conecta** a los `update`
de `02`/`03`. La inserción del log debe ser **atómica** con el cambio que registra.

## Qué se toca
- `apps/api/src/catalog/product.service.ts` y `lot.service.ts` — envolver el `update`.
- `apps/api/src/catalog/audit.service.ts` (o helper) — construir las entradas de `AuditLog`.

## Cómo implementarlo
1. **Detectar los campos auditables** que cambian: `priceCents` (`PRICE`), `discountCents`
   (`DISCOUNT`) y `stock` (`STOCK`). Antes de actualizar, leer los valores actuales para
   comparar `oldValue` → `newValue`. Solo se registra lo que **realmente** cambia.
2. **Transacción Prisma (`$transaction`).** El `update` de la entidad y el/los
   `AuditLog.create` van en la **misma** transacción: o se confirman ambos o falla todo.
   Esto es lo que impide un cambio sin traza (requisito de `CLAUDE.md`).
3. **Actor.** `actorId` = id del admin autenticado (viene de `req.user` vía el decorador
   `@CurrentUser`). Es nullable en el esquema (sobrevive al borrado del usuario / procesos
   automáticos), pero aquí siempre habrá actor humano.
4. **entityType/entityId.** `PRODUCT`/`LOT` + el id de la fila afectada.
5. **Una entrada por campo cambiado** (el esquema tiene un `field` por fila): si en un mismo
   `PATCH` cambian precio y stock, se crean dos `AuditLog`.
6. **Tests.** Cambiar precio → se crea 1 log con old/new correctos; cambiar precio+stock →
   2 logs; editar sin tocar campos auditables → 0 logs; si el `update` falla, no queda log
   huérfano (probar el rollback).

## Decisiones / alternativas
- **Auditar en el service vs. middleware/hook de Prisma:** hacerlo explícito en el service,
  dentro de la transacción, es más claro y controlable que un hook global implícito que
  esconde efectos.
- **Una fila por campo vs. una fila con JSON de cambios:** el esquema ya decidió una fila por
  `field` (más consultable). Se respeta.
- **Leer-antes-de-escribir vs. usar el retorno del update:** hace falta el valor viejo, que
  el `update` no devuelve; por eso se lee dentro de la transacción antes de escribir.

## Hecho cuando
- Todo cambio de precio/descuento/stock en producto o lote deja su `AuditLog` con actor,
  old y new correctos.
- El log y el cambio son atómicos (si uno falla, ninguno persiste), verificado con test.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
