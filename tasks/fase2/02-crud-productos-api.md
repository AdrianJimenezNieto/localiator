# 02 · CRUD de productos (API, solo admin)

**Checkbox del roadmap:** «CRUD de productos y lotes (solo admin)» (parte de productos).

## Objetivo
Exponer por API el CRUD de `Product` para que un `administrador` dé de alta, edite y
retire productos individuales. La auditoría de precio/stock llega en `04` y la subida de
fotos en `05`; aquí las fotos se aceptan como array de URLs ya existente en el esquema.

## Qué se toca
- `apps/api/src/catalog/product.controller.ts` — endpoints admin.
- `apps/api/src/catalog/product.service.ts` — lógica sobre Prisma.
- `apps/api/src/catalog/dto/create-product.dto.ts` y `update-product.dto.ts`.
- `apps/api/src/catalog/catalog.module.ts` — registrar controller/service.

## Cómo implementarlo
1. **Endpoints** (todos `@Roles(ADMIN)`):
   - `POST /products` — crear.
   - `GET /products/:id` — leer (útil para el formulario de edición del backoffice).
   - `PATCH /products/:id` — editar.
   - `DELETE /products/:id` — retirar. Valorar borrado lógico vs. físico (ver decisiones).
2. **DTO de creación** con validación estricta (`class-validator`):
   - `name`, `description` no vacíos.
   - `condition` ∈ `ItemCondition` (`@IsEnum`).
   - `priceCents` y `discountCents` enteros ≥ 0; `discountCents ≤ priceCents`.
   - `stock` entero ≥ 0.
   - `categoryId` obligatorio y **validado que la categoría exista** (si no, `400`/`404`).
   - `photos` opcional (`string[]` de URLs); la subida real es `05`.
3. **DTO de edición**: todos los campos opcionales (`PartialType` del de creación).
4. **Dinero en céntimos.** Reforzar en la validación que llegan enteros (no euros con
   decimales); la conversión euros↔céntimos es responsabilidad del frontend.
5. **Tests.** Cubrir: crear OK, `403` sin admin, `categoryId` inexistente → error,
   `discountCents > priceCents` → `400`.

## Decisiones / alternativas
- **Borrado físico vs. lógico (soft delete):** un producto ya vendido/reservado en Fase 3
  no debería desaparecer sin más. Recomendado dejar preparado un borrado lógico (p. ej.
  marcar `stock = 0` o un flag `active`), pero si se hace físico ahora, documentarlo para
  revisarlo en Fase 3. Elegir lo más simple que no bloquee el futuro.
- **Validar `categoryId` en el service vs. FK de Prisma:** validar explícitamente da un
  error legible (`400`) en vez de un `P2003` opaco de la FK.
- **`PartialType` para el update:** reutiliza las reglas del create sin duplicar validación.

## Hecho cuando
- Un admin puede crear/leer/editar/retirar productos vía API con validación estricta.
- Un no-admin recibe `403` en escritura.
- Los casos límite de dinero y categoría inexistente están cubiertos por tests y
  **la CI (lint + build + test) está en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
