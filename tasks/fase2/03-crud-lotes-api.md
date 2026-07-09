# 03 · CRUD de lotes (API, solo admin)

**Checkbox del roadmap:** «CRUD de productos y lotes (solo admin)» (parte de lotes).

## Objetivo
Exponer el CRUD de `Lot`, espejo del de productos (`02`). `Product` y `Lot` son entidades
**separadas e independientes** (misma forma, sin contención), así que este es un diff
pequeño que replica el patrón ya establecido y aprobado en `02`.

## Qué se toca
- `apps/api/src/catalog/lot.controller.ts` — endpoints admin.
- `apps/api/src/catalog/lot.service.ts` — lógica sobre Prisma.
- `apps/api/src/catalog/dto/create-lot.dto.ts` y `update-lot.dto.ts`.
- `apps/api/src/catalog/catalog.module.ts` — registrar controller/service.

## Cómo implementarlo
1. **Endpoints** (`@Roles(ADMIN)`): `POST /lots`, `GET /lots/:id`, `PATCH /lots/:id`,
   `DELETE /lots/:id`. Misma semántica que productos.
2. **DTOs** idénticos en reglas a los de `02` (name, description, condition, precios en
   céntimos con `discountCents ≤ priceCents`, stock ≥ 0, `categoryId` existente, photos).
3. **Reutilizar sin acoplar.** Se permite compartir helpers de validación/servicio comunes
   (p. ej. validación de categoría o de dinero) **sin** fusionar las tablas ni crear una
   jerarquía: la duplicación de esquema es deliberada. Extraer solo lo que sea claramente
   común y estable.
4. **Tests.** Reflejo de los de productos: crear OK, `403` sin admin, categoría inexistente,
   descuento mayor que precio.

## Decisiones / alternativas
- **Duplicar controller/service vs. genérico parametrizado:** con solo dos entidades casi
  iguales, un genérico ahorraría código pero acoplaría dos cosas que el dominio quiere
  independientes. Se replica a propósito; si en el futuro divergen (p. ej. un lote gana
  campos propios) no habrá que deshacer una abstracción.
- **Helpers compartidos:** extraer solo validaciones puras (dinero, existencia de
  categoría). No compartir estado ni lógica de negocio específica.

## Hecho cuando
- Un admin puede gestionar lotes vía API con las mismas garantías que productos.
- Un no-admin recibe `403` en escritura.
- Tests espejo en verde y **la CI (lint + build + test) está en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Este checkbox se comparte con `02`: márcalo cuando productos **y** lotes estén hechos.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
