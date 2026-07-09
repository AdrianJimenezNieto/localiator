# 07 · Búsqueda y filtros (API)

**Checkbox del roadmap:** «Búsqueda y filtros (categoría, precio, estado)» (parte de backend).

## Objetivo
Ampliar el endpoint de catálogo (`06`) para aceptar búsqueda por texto y filtros por
categoría, rango de precio y estado del artículo, manteniendo la paginación. Es la base de
datos de la barra de filtros del frontend (`10`).

## Qué se toca
- `apps/api/src/catalog/catalog.controller.ts` — nuevos query params.
- `apps/api/src/catalog/catalog.service.ts` — construir el `where` de Prisma.
- `apps/api/src/catalog/dto/list-catalog.dto.ts` — extender con filtros validados.

## Cómo implementarlo
1. **Query params** (todos opcionales, combinables) sobre el listado de `06`:
   - `q` — texto libre; buscar en `name`/`description` (`contains`, `mode: insensitive`).
   - `categoryId` — filtrar por categoría (validar formato).
   - `minPriceCents` / `maxPriceCents` — rango sobre `priceCents` (enteros ≥ 0, min ≤ max).
   - `condition` — uno o varios valores de `ItemCondition` (`@IsEnum`, admitir array).
2. **Construir el `where` dinámicamente** sin romper la paginación ni la ordenación de `06`.
   Cada filtro presente añade una condición; ausente, no filtra.
3. **Saneamiento.** Validar y acotar todo con `class-validator`/`ParseIntPipe`; nunca
   interpolar el texto crudo en SQL (Prisma parametriza, pero validar el shape igualmente).
   Recortar longitud de `q` para evitar consultas absurdas.
4. **Índices.** Comprobar si los filtros frecuentes (categoría, precio) necesitan índice para
   rendir con muchos productos. `categoryId` ya está indexado; valorar índice de precio si
   hace falta (puede quedar como nota para optimizar más tarde).
5. **Tests.** Filtro por categoría devuelve solo esa; rango de precio acota bien; `q` case
   -insensitive; combinación de filtros + paginación coherente; `min > max` → `400`.

## Decisiones / alternativas
- **`contains` de Postgres vs. full-text search:** `contains`/`ilike` basta para el MVP y es
  cero-configuración. El full-text (`tsvector`) o un motor externo se valoran solo si la
  búsqueda por relevancia se queda corta; sería sobreingeniería ahora.
- **Filtros en el mismo endpoint vs. endpoint aparte:** en el mismo `GET /catalog/...`;
  buscar y filtrar son la misma operación de listado con `where` distinto.
- **Precio en céntimos en los filtros:** coherente con el resto; el frontend convierte
  euros↔céntimos.

## Hecho cuando
- El catálogo se puede buscar por texto y filtrar por categoría, precio y estado, combinables
  y con la paginación de `06` intacta.
- Entrada validada/saneada y casos límite cubiertos por tests, con
  **la CI (lint + build + test) en verde**.

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Comparte checkbox con `10`: márcalo cuando API **y** web de filtros estén hechas.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
