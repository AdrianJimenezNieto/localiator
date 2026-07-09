# 01 · CRUD de categorías (API, solo admin)

**Checkbox del roadmap:** «Gestión de categorías» (parte de backend).

## Objetivo
Exponer por API el CRUD de `Category` para que un `administrador` pueda crear, listar,
editar y borrar categorías. Es el primer paso de la Fase 2 porque un `Product`/`Lot`
tiene `categoryId` **obligatorio**: sin categorías no se puede dar de alta nada.

## Qué se toca
- `apps/api/src/catalog/category.module.ts` — nuevo módulo (o `catalog` como módulo raíz).
- `apps/api/src/catalog/category.controller.ts` — endpoints admin.
- `apps/api/src/catalog/category.service.ts` — lógica sobre Prisma.
- `apps/api/src/catalog/dto/*.ts` — DTOs de creación/edición con `class-validator`.
- `apps/api/src/app.module.ts` — registrar el módulo.

## Cómo implementarlo
1. **Endpoints** (todos bajo `@Roles(ADMIN)`, apoyándose en el RBAC ya existente de Fase 1):
   - `POST /categories` — crear.
   - `GET /categories` — listar (esta lectura puede quedar `@Public()` porque el catálogo
     público la necesitará; decidir aquí y documentarlo).
   - `PATCH /categories/:id` — editar nombre/slug/parent.
   - `DELETE /categories/:id` — borrar.
2. **DTOs con validación estricta** (`class-validator`): `name` no vacío; `slug` opcional
   (si no viene, generarlo a partir del `name`) con formato `kebab-case` y único;
   `parentId` opcional y validando que exista.
3. **Slug único.** Capturar la colisión de `@unique` y devolver `409 Conflict` legible,
   no un error 500 de Prisma.
4. **Borrado seguro.** Si la categoría tiene productos/lotes asociados, decidir política:
   bloquear el borrado con `409` (recomendado) en vez de dejar huérfanos. Documentarlo.
5. **Tests.** Cubrir: crear OK, `403` sin rol admin, slug duplicado → `409`, borrado
   bloqueado si tiene artículos.

## Decisiones / alternativas
- **Slug autogenerado vs. obligatorio manual:** autogenerar desde `name` reduce fricción en
  el alta; permitir override manual para SEO. Se guarda siempre normalizado.
- **Bloquear borrado vs. borrado en cascada:** bloquear es más seguro (evita perder
  productos por accidente). La cascada se descarta por destructiva.
- **Módulo `catalog` único vs. módulo por entidad:** un módulo `catalog` que agrupe
  categorías, productos y lotes evita fragmentar; productos y lotes llegan en 02 y 03.

## Hecho cuando
- Un admin puede crear/listar/editar/borrar categorías vía API.
- Un no-admin recibe `403` en las rutas de escritura.
- Slug duplicado devuelve `409`; borrado con artículos asociados se bloquea con mensaje claro.
- Hay tests que cubren esos casos y **la CI (lint + build + test) está en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
