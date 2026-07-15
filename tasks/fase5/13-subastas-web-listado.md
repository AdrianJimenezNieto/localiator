# 13 · Web: listado de subastas y enlaces desde el catálogo

**Checkbox del roadmap:** «Listado de subastas en la web + enlaces desde el catálogo».

**Reparto:** lo pica **Claude** (UI, sin lógica de negocio nueva).

## Objetivo
Hacer las subastas **alcanzables**. La `AuctionPage` funciona y está ruteada en
`/subastas/:id` (`main.tsx:52`), pero no hay ni un enlace en toda la web que lleve a ella: hoy
solo entra quien conozca el cuid. Esta tarea consume el listado de la tarea 12 y conecta las
subastas con el resto del sitio.

## Qué se toca
- `apps/web/src/pages/AuctionsPage.tsx` (nueva) — listado público.
- `apps/web/src/main.tsx` — ruta `/subastas`.
- `apps/web/src/components/Footer.tsx` y la cabecera — enlace de navegación.
- `apps/web/src/pages/DetailPage.tsx` — aviso «este artículo está en subasta» con enlace.
- `apps/web/src/lib/useSeo.ts` — metadatos de las páginas nuevas.

## Cómo implementarlo
1. **Página `/subastas`**: rejilla de subastas reutilizando `ProductCard.tsx` y
   `Pagination.tsx` del catálogo, con `useApi.ts` para la carga. No inventar componentes nuevos
   si los del catálogo valen.
2. **En cada tarjeta**: precio actual, estado (`en directo` / `programada`) y cuenta atrás hasta
   `endsAt`. La cuenta atrás es solo cosmética — la verdad la impone el servidor, igual que el
   mínimo de puja en `AuctionPage.tsx:29-34`.
3. **Enlace de navegación** a `/subastas` en la cabecera, junto al catálogo, y en el footer.
4. **Desde la ficha** (`DetailPage.tsx`): si el artículo tiene una subasta viva, mostrar un
   aviso con enlace a ella. Depende de que la tarea 11 haya decidido qué pasa con la venta
   directa de un artículo subastado: si se retira del carrito, la ficha debe explicar por qué no
   se puede comprar.
5. **SEO** (Fase 4, tarea 06): metadatos con `useSeo.ts` en el listado y en la ficha de subasta,
   y meter `/subastas` en el sitemap (`apps/api/src/seo/`).
6. **Responsive** (Fase 2, tarea 12): la rejilla debe funcionar en móvil como la del catálogo.

## Decisiones / alternativas
- **Listado propio vs. mezclar subastas en el catálogo:** listado propio. Comprar y pujar son
  acciones distintas con reglas distintas (una tiene carrito, la otra plazo y ganador) y
  mezclarlas en la misma rejilla obliga a que cada tarjeta explique cuál de las dos es. Cuando
  haya volumen se puede añadir un filtro «subastas» dentro del catálogo.
- **Cuenta atrás en cliente vs. pedir el estado al servidor:** en cliente a partir de `endsAt`.
  Es cosmética; el antisniping (tarea 05) puede mover `endsAt`, y quien esté en la ficha lo
  recibe por WS (`auction:extended`). En el listado no hay WS, así que la cuenta atrás puede
  quedarse desfasada un momento: aceptable, porque pujar exige entrar en la ficha.
- **Reutilizar `ProductCard` vs. una tarjeta de subasta:** reutilizar si encaja sin retorcerlo.
  Si acaba lleno de condicionales, hacer `AuctionCard` aparte.

## Hecho cuando
- Se llega a una subasta navegando desde la home sin conocer su id.
- El listado pagina, es responsive y muestra precio actual, estado y cuenta atrás.
- La ficha de un artículo subastado enlaza a su subasta.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
