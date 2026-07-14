# 01 · Aviso legal y condiciones de venta

**Checkbox del roadmap:** «Aviso legal y condiciones de venta».

## Objetivo
Publicar en la web el **aviso legal** (identidad del titular, datos de contacto) y las
**condiciones de venta** (proceso de compra, precios/IVA, pago con Stripe, recogida en
almacén sin envíos, política de cancelación/reembolso mínima). Es la primera tarea de la
Fase 4 porque no se puede abrir al público sin estos textos, y las tareas 03 (cookies) y 04
(garantías) enlazan o amplían estas páginas.

## Qué se toca
- `apps/web/src/pages/LegalPage.tsx` — nueva página de aviso legal.
- `apps/web/src/pages/TermsPage.tsx` — nueva página de condiciones de venta.
- `apps/web/src/components/Footer.tsx` — nuevo footer con los enlaces legales (no existe aún).
- `apps/web/src/App.tsx` — rutas `/aviso-legal` y `/condiciones-venta`, y montar el footer.

## Cómo implementarlo
1. **Contenido como texto estático** en las páginas (o en `.md`/constantes importadas). No
   necesita backend: son documentos legales que cambian poco.
2. **Aviso legal**: titular y NIF/CIF, domicilio, email de contacto, y (si aplica) datos
   registrales. Dejar huecos `[PENDIENTE]` visibles donde falten datos reales, no inventarlos.
3. **Condiciones de venta**: cómo se compra, que los precios son en **euros con IVA
   incluido** (coherente con `CLAUDE.md` y la tarea 09 de Fase 3), pago único vía **Stripe**,
   **recogida en almacén** (sin envíos), y política de **reembolsos mínimos** por tratarse de
   productos de subasta.
4. **Footer** con enlaces a aviso legal, condiciones, privacidad (tarea 02) y cookies
   (tarea 03), visible en todas las páginas.
5. **Rutas** amigables en español, coherentes con lo que hará la tarea 06 (SEO).

## Decisiones / alternativas
- **Texto estático vs. CMS/BD:** estático porque son documentos que se revisan con abogado y
  cambian raramente; un CMS sería sobreingeniería para el MVP.
- **Huecos `[PENDIENTE]` vs. datos inventados:** nunca inventar datos legales; marcar lo que
  falta para que Adrián lo complete con la información real.
- **Página propia vs. modal:** página con URL propia porque debe ser enlazable e indexable
  (SEO, requisitos legales de accesibilidad del texto).

## Hecho cuando
- Existen las páginas de aviso legal y condiciones de venta con URL propia.
- El footer con los enlaces legales aparece en toda la web.
- Los datos pendientes están marcados, no inventados.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
2. Commit con mensaje semántico (`feat(web): ...` o `docs(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
