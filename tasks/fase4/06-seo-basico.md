# 06 · SEO básico

**Checkbox del roadmap:** «SEO básico (metadatos, sitemap, URLs amigables)».

## Objetivo
Hacer que el catálogo y las fichas sean **encontrables en buscadores**: metadatos por página,
`sitemap.xml`, `robots.txt` y **URLs amigables** (slug en vez de id). Se apoya en el catálogo
y la ficha públicos ya hechos en Fase 2.

## Qué se toca
- `apps/web/index.html` — metadatos base y Open Graph por defecto.
- `apps/web/src/pages/DetailPage.tsx` y `CatalogPage.tsx` — títulos/descripciones dinámicos
  por producto/categoría (p. ej. con `react-helmet-async`).
- `apps/web/src/App.tsx` — rutas por **slug** (`/producto/:slug`) además del id.
- `apps/api/src/` — endpoint que genere `sitemap.xml` con las URLs públicas; `robots.txt`.

## Cómo implementarlo
1. **Metadatos por página:** `title` y `meta description` únicos por ficha/categoría, más
   Open Graph (imagen, título) para que se vean bien al compartir. Usar una librería de
   `<head>` para React o inyectarlos según la ruta.
2. **URLs amigables:** servir las fichas por **slug** (ya hay `slug` en categorías desde Fase
   2; añadirlo o derivarlo para productos/lotes si falta). Mantener redirección del id viejo
   al slug para no romper enlaces.
3. **`sitemap.xml` dinámico:** generarlo desde la BD (productos/lotes/categorías publicados)
   vía un endpoint de la API o un job que lo escriba estático. Incluir solo contenido público.
4. **`robots.txt`:** permitir indexación del catálogo y **bloquear** rutas privadas
   (`/admin`, checkout, área de usuario). Enlazar el sitemap.
5. **SPA y SEO:** valorar si el prerender/SSR es necesario; para el MVP basta con metadatos
   correctos y sitemap. Anotar SSR como mejora futura si la indexación no es suficiente.

## Decisiones / alternativas
- **URLs por slug vs. por id:** slug mejora SEO y legibilidad; se mantiene el id como
  fallback/redirect para no romper enlaces existentes.
- **Sitemap dinámico (endpoint) vs. estático generado en build:** dinámico refleja el
  catálogo real sin recompilar; el estático sería más simple pero se queda desfasado al alta
  de productos.
- **Metadatos client-side vs. SSR/prerender:** empezar client-side (coste cero, encaja con la
  SPA actual); SSR queda como mejora si hace falta más ranking.

## Hecho cuando
- Cada ficha/categoría tiene título y descripción propios; existe `sitemap.xml` con las URLs
  públicas y `robots.txt` que bloquea lo privado.
- Las fichas son accesibles por URL amigable (slug), con redirect desde el id.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(web): ...` / `feat(api): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
