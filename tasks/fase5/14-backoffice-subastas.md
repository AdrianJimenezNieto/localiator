# 14 · Backoffice: gestión de subastas

**Checkbox del roadmap:** «Backoffice de subastas (alta, listado, cancelación)».

**Reparto:** lo pica **Claude** (UI de admin sobre la API de la tarea 11).

## Objetivo
Dar al admin una pantalla para **programar y gestionar subastas**, consumiendo la API de la
tarea 11. Cierra la Fase 5: es lo que convierte el motor de subastas en algo operable sin tocar
la base de datos. El `AdminLayout` de hoy solo tiene productos, lotes, categorías y pedidos.

## Qué se toca
- `apps/web/src/pages/admin/AuctionsAdminPage.tsx` (nueva) — listado y acciones.
- `apps/web/src/pages/admin/AuctionFormPage.tsx` (nueva) — alta y edición.
- `apps/web/src/pages/admin/AdminLayout.tsx` — nueva entrada en el `NAV`.
- `apps/web/src/main.tsx` — rutas bajo `/admin`.
- `apps/web/src/lib/adminTypes.ts` — tipos de la API de subastas.

## Cómo implementarlo
1. **Listado** (`/admin/subastas`) al estilo de `ItemsAdminPage.tsx`: artículo, estado, precio de
   salida, precio actual, `startsAt`/`endsAt` y ganador si lo hay. Filtro por estado.
2. **Formulario** (`/admin/subastas/nueva`, `/admin/subastas/:id`) siguiendo el patrón de
   `ItemFormPage.tsx`: seleccionar artículo (producto o lote), precio de salida, incremento
   mínimo y fechas. Los importes se introducen en euros y viajan en **céntimos** (convención del
   proyecto).
3. **Reflejar las reglas de la tarea 11 en la UI**: si una subasta está `LIVE` con pujas, los
   campos congelados (precio de salida, incremento) van deshabilitados y se explica por qué. La
   UI **no** es la que valida — el servidor manda — pero no debe ofrecer acciones que sabemos
   que van a fallar.
4. **Cancelar** con confirmación, y advertencia explícita si la subasta está `LIVE` con pujas
   (hay gente con pujas puestas y se les va a avisar).
5. **Estados vacíos y errores**: mostrar el motivo que devuelve la API (`ITEM_NOT_FOUND`,
   `AUCTION_ALREADY_ACTIVE`…) en lenguaje humano, no el código a pelo.
6. **Protección de ruta**: colgar de `ProtectedAdmin.tsx` como el resto del backoffice.

## Decisiones / alternativas
- **Sección propia vs. una pestaña dentro de productos/lotes:** sección propia. Una subasta no
  es un artículo: tiene ciclo de vida, pujas y ganador, y su listado se mira por estado y por
  fecha de cierre, no por categoría.
- **Selector de artículo con buscador vs. desplegable simple:** desplegable simple si el
  catálogo es pequeño; en cuanto crezca hace falta buscador. Empezar por lo simple y anotarlo.
- **Deshabilitar campos congelados vs. dejar que falle el servidor:** deshabilitar. El servidor
  sigue siendo la autoridad, pero ofrecer un campo que siempre va a devolver `INVALID_TRANSITION`
  es una trampa para el admin.

## Hecho cuando
- Un admin programa una subasta desde el backoffice y, al llegar su `startsAt`, se abre sola
  (tarea 10), aparece en `/subastas` (tarea 13) y acepta pujas.
- El listado muestra estado, precio actual y ganador; cancelar pide confirmación.
- Los campos congelados de una `LIVE` con pujas están deshabilitados y explicados.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
4. Con esto la Fase 5 queda cerrada de punta a punta: **verificar el flujo completo**
   (programar → abrir → pujar → cerrar → cobrar) antes de darla por buena.
