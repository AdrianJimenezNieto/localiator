# 12 · Diseño responsive del catálogo y la ficha

**Checkbox del roadmap:** «Diseño responsive del catálogo y ficha».

## Objetivo
Pulir la experiencia en móvil, tablet y escritorio de las pantallas construidas en `09`,
`10` y `11`. `CLAUDE.md` exige diseño **responsive 100%**. Es un commit de refinamiento
visual, no de nueva funcionalidad, por eso va al final del bloque de catálogo.

## Qué se toca
- `apps/web/src/` — estilos Tailwind de catálogo, panel de filtros y ficha.
- Componentes compartidos de layout (header/contenedor) si hacen falta.

## Cómo implementarlo
1. **Grid del catálogo adaptativo.** Nº de columnas según breakpoint (1 en móvil → varias en
   escritorio) con las utilidades responsive de Tailwind. Sin scroll horizontal en ningún
   ancho.
2. **Filtros en móvil.** Convertir el panel de filtros de `10` en un **drawer/acordeón**
   plegable en pantallas pequeñas, visible en línea en escritorio.
3. **Ficha adaptativa.** Galería + datos en una columna en móvil y a dos columnas en
   escritorio. Imágenes fluidas (`max-width:100%`), sin desbordes.
4. **Toques táctiles.** Áreas de pulsación cómodas (tamaño mínimo de botones/enlaces),
   tipografía legible sin zoom.
5. **Verificación real.** Revisar en anchos representativos (p. ej. 360, 768, 1280 px) que
   nada se rompe ni provoca scroll lateral. Apoyarse en las devtools responsive.
6. **Accesibilidad básica de paso.** Contraste suficiente, foco visible, `alt` en imágenes
   (si no se cubrió en `11`).

## Decisiones / alternativas
- **Mobile-first vs. desktop-first:** mobile-first (por defecto en Tailwind) — se estiliza el
  caso pequeño y se amplía con breakpoints. Es la práctica recomendada.
- **Drawer de filtros vs. filtros siempre visibles:** en móvil el espacio manda; un drawer
  evita empujar el catálogo hacia abajo. En escritorio se muestran en línea.
- **Ajuste manual vs. framework de componentes:** Tailwind directo basta; no añadir una
  librería de UI pesada solo para esto.

## Hecho cuando
- Catálogo, filtros y ficha se ven y funcionan bien en móvil, tablet y escritorio, sin scroll
  horizontal.
- Los filtros son usables en móvil (drawer/acordeón).
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
Cuando la tarea cumpla «Hecho cuando»:
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (Conventional Commits).
3. **La CI debe estar en verde (lint + build + test) para poder mergear.**
4. Con la CI en verde, abrir PR y mergear a `main` **sin pedir permiso**. Borrar la rama
   tras el merge.
