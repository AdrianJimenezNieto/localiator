# 08 · Ficha pública de producto/lote (API)

**Checkbox del roadmap:** «Ficha de producto/lote (vista pública)» (parte de backend).

## Objetivo
Endpoint **público** que devuelva el detalle completo de un producto o lote concreto para
pintar su ficha (`11`). Complementa al listado (`06`): el listado da lo justo para la
tarjeta; la ficha da todos los datos visibles al público.

## Qué se toca
- `apps/api/src/catalog/catalog.controller.ts` — endpoints de detalle público.
- `apps/api/src/catalog/catalog.service.ts` — consulta por id (y/o slug).
- `packages/shared/src/index.ts` — tipo de la ficha compartido con el frontend.

## Cómo implementarlo
1. **Rutas públicas** (`@Public()`):
   - `GET /catalog/products/:id` y `GET /catalog/lots/:id`.
   - Valorar acceso por **slug** además del id para URLs amigables/SEO (Fase 4). Si se hace,
     necesitará un `slug` único en la entidad — decidir si entra ahora o se pospone.
2. **Datos de la ficha.** Devolver todos los campos públicos: name, description, condition,
   priceCents, discountCents, stock (o solo disponibilidad), todas las `photos` y la
   categoría (nombre + id para enlazar a "más de esta categoría").
3. **404 limpio.** Si no existe (o no es visible según el criterio de `06`), devolver `404`
   con mensaje claro, no un `500` de Prisma.
4. **No filtrar datos internos.** `select` explícito para no exponer campos que la ficha no
   necesita.
5. **Tipo compartido** del detalle en `packages/shared`, distinto del item de listado.
6. **Tests.** Ficha existente OK; id inexistente → `404`; artículo no visible → `404`;
   accesible sin login.

## Decisiones / alternativas
- **Acceso por slug vs. solo id:** el slug mejora SEO y URLs, pero requiere añadir/gestionar
  un slug único por artículo. Si complica esta tarea, dejar solo id ahora y añadir slug en la
  tarea de SEO (Fase 4); documentar la decisión.
- **Ficha unificada vs. endpoint por tipo:** por tipo (`/products/:id`, `/lots/:id`) es más
  claro y coherente con `06`.
- **Devolver `stock` exacto vs. solo disponibilidad:** para el público quizá baste "disponible
  / agotado"; decidir según lo que quiera mostrar la ficha (`11`).

## Hecho cuando
- El invitado obtiene el detalle completo de un producto/lote por su URL.
- Inexistente/no visible devuelve `404`; datos internos no se exponen.
- Tipo de ficha tipado en `packages/shared`, tests en verde y
  **la CI (lint + build + test) en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Comparte checkbox con `11`: márcalo cuando API **y** web de la ficha estén hechas.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
