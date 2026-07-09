# 10 · Búsqueda y filtros (web)

**Checkbox del roadmap:** «Búsqueda y filtros (categoría, precio, estado)» (parte de frontend).

## Objetivo
Añadir a la página de catálogo (`09`) la barra de búsqueda y los filtros que consumen el
endpoint de `07`: texto, categoría, rango de precio y estado del artículo.

## Qué se toca
- `apps/web/src/` — barra de búsqueda, panel de filtros, integración con el listado.
- Hook/cliente de datos — pasar los filtros como query params a la API.

## Cómo implementarlo
1. **Controles de filtro:**
   - Campo de **búsqueda** por texto (`q`) con *debounce* para no llamar en cada tecla.
   - **Categoría**: selector poblado desde `GET /categories` (listado de `01`).
   - **Precio**: min/max en euros (convertidos a céntimos al llamar a la API).
   - **Estado**: selección (múltiple) de `ItemCondition`.
2. **Estado de filtros en la URL.** Reflejar los filtros activos como query params (junto a
   la página de `09`) para que la búsqueda sea compartible y sobreviva a recargas. Cambiar un
   filtro **resetea a la página 1**.
3. **Un único flujo de datos.** Los filtros alimentan la misma consulta que el listado; al
   cambiar, se re-pide el catálogo. Si se usa React Query/SWR, la key incluye los filtros.
4. **UX.** Botón de "limpiar filtros"; indicar cuántos resultados hay; estado "sin resultados"
   claro. En móvil, filtros en un panel/drawer plegable (ajuste fino en `12`).
5. **Validación en cliente.** min ≤ max en precio antes de llamar; recortar/normalizar `q`.
   La validación real la hace el backend (`07`), esto es solo UX.

## Decisiones / alternativas
- **Filtros en URL vs. estado local:** en URL (compartible, recargable, base de SEO). Añade
  algo de complejidad de sincronización que compensa.
- **Debounce vs. buscar al pulsar Enter/botón:** debounce da sensación de inmediatez;
  alternativa con botón explícito reduce llamadas. Recomendado debounce con un margen
  razonable.
- **Selector de categoría plano vs. jerárquico:** empezar plano; si las categorías usan
  `parentId`, se puede anidar más tarde.

## Hecho cuando
- Se puede buscar por texto y filtrar por categoría, precio y estado, combinables, con los
  filtros reflejados en la URL y res+paginación coherentes.
- Cambiar un filtro resetea a página 1 y hay estado "sin resultados".
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Comparte checkbox con `07`.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
