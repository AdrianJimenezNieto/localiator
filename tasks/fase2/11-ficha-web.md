# 11 · Ficha de producto/lote (web)

**Checkbox del roadmap:** «Ficha de producto/lote (vista pública)» (parte de frontend).

## Objetivo
Página pública de detalle que consume el endpoint de `08` y muestra toda la información de un
producto o lote: galería de fotos, descripción, precio, estado y categoría. Es la pantalla a
la que se llega desde una tarjeta del catálogo (`09`).

## Qué se toca
- `apps/web/src/` — página de ficha, galería de imágenes, navegación desde la tarjeta.
- Router — rutas `/productos/:id` y `/lotes/:id` (o slug si `08` lo añadió).

## Cómo implementarlo
1. **Ruta de detalle** por tipo (`/productos/:id`, `/lotes/:id`). La tarjeta del catálogo
   enlaza aquí.
2. **Carga de datos** desde `GET /catalog/products/:id` (o lots). Estados de carga, error y
   **404** (si la API devuelve no encontrado, mostrar una página "no existe" limpia, no un
   crash).
3. **Galería de fotos.** Mostrar todas las `photos` con una principal + miniaturas. Si no hay
   fotos, un placeholder. Imágenes con `alt` (accesibilidad/SEO) y `max-width:100%`.
4. **Datos visibles.** Nombre, descripción, estado (`condition` legible en español), precio en
   euros con descuento tachado si aplica, disponibilidad, categoría enlazada al catálogo
   filtrado por esa categoría.
5. **Sin acciones de compra todavía.** El carrito/compra es Fase 3; aquí la ficha es
   informativa. Se puede dejar hueco/CTA deshabilitado, sin implementar el flujo.
6. **Reutilizar helpers** de formateo de precio y de etiquetas de estado del listado.

## Decisiones / alternativas
- **Galería propia simple vs. librería de carrusel:** empezar con una galería mínima (foto
  grande + miniaturas) sin dependencia; un carrusel con librería solo si hace falta.
- **Ruta por id vs. por slug:** seguir lo decidido en `08`. Si es por slug, mapear la ruta a
  slug; si por id, por id.
- **CTA de compra deshabilitado vs. ausente:** dejar un placeholder ayuda a validar el layout
  de Fase 3, pero no debe sugerir una función que aún no existe. Decidir según diseño.

## Hecho cuando
- Desde una tarjeta se navega a la ficha y se ve el detalle completo con galería.
- Id inexistente muestra una página 404 limpia; imágenes accesibles.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
   (Comparte checkbox con `08`.)
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
