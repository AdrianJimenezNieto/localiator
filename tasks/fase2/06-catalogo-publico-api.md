# 06 · Listado público de catálogo con paginación (API)

**Checkbox del roadmap:** «Listado público de catálogo con paginación» (parte de backend).

## Objetivo
Ofrecer un endpoint **público** (rol `invitado`) que liste productos y lotes del catálogo
con paginación eficiente, base sobre la que el frontend (`09`) montará la vista. Búsqueda y
filtros llegan en `07`; aquí solo el listado paginado y ordenado.

## Qué se toca
- `apps/api/src/catalog/catalog.controller.ts` — endpoint(s) público(s).
- `apps/api/src/catalog/catalog.service.ts` — consulta paginada con Prisma.
- `apps/api/src/catalog/dto/list-catalog.dto.ts` — query params de paginación.
- `packages/shared/src/index.ts` — tipo de respuesta paginada compartido con el frontend.

## Cómo implementarlo
1. **Rutas públicas** con `@Public()` (el catálogo lo ve el invitado sin login):
   - `GET /catalog/products` y `GET /catalog/lots` (o un `GET /catalog` unificado; elegir y
     documentar). Empezar separado es más simple.
2. **Paginación.** Query params `page` (o `cursor`) y `pageSize` validados (`pageSize` con
   tope máximo para no permitir pedir 10.000 de golpe). Devolver `{ items, total, page,
   pageSize }` o el equivalente con cursor.
3. **Selección de campos.** Devolver solo lo que la tarjeta del catálogo necesita
   (`select`/`omit` de Prisma): id, name, priceCents, discountCents, condition, primera foto,
   categoría. No volcar todo el registro.
4. **Ordenación por defecto** estable (p. ej. `createdAt desc`) para que la paginación no
   baile entre páginas.
5. **Solo artículos vendibles.** Si en `02` se decidió soft delete / `active`, filtrar aquí
   los no visibles (p. ej. `stock > 0` o `active = true`). Documentar el criterio.
6. **Tipo compartido.** Definir el shape de la respuesta paginada en `packages/shared` para
   que frontend y backend no diverjan.
7. **Tests.** Página 1 devuelve N items y `total` correcto; `pageSize` por encima del tope se
   capa; ruta accesible sin autenticación (`@Public`).

## Decisiones / alternativas
- **Offset (`page`/`skip`) vs. cursor:** offset es más simple y suficiente para un catálogo
  moderado; cursor escala mejor con muchísimos registros. Recomendado empezar con offset y
  dejar la puerta a cursor si el volumen lo pide.
- **Endpoints separados productos/lotes vs. unificado:** separado es más simple de paginar y
  cachear; unificar complica el `total` y el orden mezclado. Empezar separado.
- **`select` explícito:** evita sobre-transferir datos y filtra sin querer campos internos.

## Hecho cuando
- El invitado (sin login) obtiene el catálogo paginado y ordenado de forma estable.
- El `pageSize` tiene tope y la respuesta incluye metadatos de paginación tipados en
  `packages/shared`.
- Tests en verde y **la CI (lint + build + test) en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Comparte checkbox con `09`: márcalo cuando API **y** web del listado estén hechas.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
