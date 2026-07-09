# 09 · Listado de catálogo (web) con paginación

**Checkbox del roadmap:** «Listado público de catálogo con paginación» (parte de frontend).

## Objetivo
Primera pantalla pública real: una página que consume el endpoint paginado de `06` y muestra
las tarjetas de producto/lote con su paginación. El frontend hoy es casi vacío (solo
`App.tsx`), así que aquí se asienta también el andamiaje mínimo de datos y rutas.

## Qué se toca
- `apps/web/src/` — página de catálogo, componente de tarjeta, componente de paginación.
- Cliente HTTP / hook de datos (fetch al backend) y, si hace falta, router.
- `packages/shared` — reutilizar el tipo de respuesta paginada de `06`.

## Cómo implementarlo
1. **Andamiaje mínimo de datos.** Un cliente HTTP fino (fetch envuelto) apuntando a la API.
   Valorar un hook simple o una librería ligera de fetching; empezar simple.
2. **Routing.** Añadir router (p. ej. `react-router`) con la ruta del catálogo como home
   pública. Es la base para la ficha (`11`) y el backoffice (`13`).
3. **Página de catálogo.** Llama a `GET /catalog/products` (y/o lots), pinta una grid de
   **tarjetas**: foto, nombre, precio (con descuento si lo hay), estado. Convertir céntimos →
   euros en la UI.
4. **Paginación.** Controles de página apoyados en los metadatos (`total`, `page`,
   `pageSize`) que devuelve `06`. Reflejar la página en la URL (query param) para poder
   compartir/recargar.
5. **Estados de carga y error.** Skeleton/spinner mientras carga y mensaje claro si falla o
   no hay resultados. No dejar la pantalla en blanco.
6. **Precio y descuento.** Mostrar precio final y, si `discountCents > 0`, el tachado.
   Centralizar el formateo de euros en un helper para reutilizarlo.

## Decisiones / alternativas
- **Fetch propio vs. React Query/SWR:** una librería de fetching da caché/estados gratis y
  ayudará con filtros (`10`) y paginación. Recomendado, pero se puede empezar con fetch
  simple si se prefiere entender el flujo primero.
- **Página en la URL vs. estado local:** en la URL, para que recargar/compartir mantenga la
  página (mejor UX y base para SEO).
- **Responsive:** aquí se maquetará ya pensando en móvil, pero el ajuste fino y la ficha se
  cierran en `12`.

## Hecho cuando
- La home pública lista el catálogo real desde la API, paginado, con la página en la URL.
- Hay estados de carga/error/vacío y el precio se muestra en euros con descuento.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Comparte checkbox con `06`.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
