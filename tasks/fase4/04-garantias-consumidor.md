# 04 · Garantías legales al consumidor

**Checkbox del roadmap:** «Garantías legales al consumidor reflejadas en las condiciones».

## Objetivo
Reflejar en las condiciones de venta (tarea 01) las **garantías legales al consumidor** y las
particularidades de vender **productos de subasta usados/con desperfectos**: qué garantía
aplica, cómo se informa del estado real del artículo y qué límites hay en
desistimiento/devoluciones. Es texto legal, sin apenas código, pero condiciona cómo se
muestra el **estado del producto** en la ficha (Fase 2).

## Qué se toca
- `apps/web/src/pages/TermsPage.tsx` — sección de garantías dentro de las condiciones.
- `apps/web/src/pages/DetailPage.tsx` — asegurar que el **estado real** del artículo y su
  condición quedan bien visibles (enlazando el marco legal).

## Cómo implementarlo
1. **Garantía legal**: informar del plazo de garantía que aplica a bienes de segunda
   mano/subasta según la normativa de consumo española, y de cómo reclamar. Dejar
   `[PENDIENTE revisión legal]` donde haga falta criterio de abogado (plazos concretos).
2. **Estado del artículo**: dado que muchos productos tienen desperfectos (`CLAUDE.md`), el
   texto debe apoyarse en que el **estado real** se describe y fotografía en la ficha; así la
   descripción del defecto forma parte de lo acordado en la compra.
3. **Derecho de desistimiento**: explicar sus límites en subastas públicas/bienes específicos
   y la política de **reembolsos mínimos** ya declarada (coherente con Fase 3, tarea 11).
4. **Coherencia** con el aviso legal, condiciones y privacidad: mismos datos de contacto y
   vía de reclamación.

## Decisiones / alternativas
- **Incluir en condiciones vs. página separada:** integrarlo en las condiciones de venta
  (tarea 01), porque la garantía es parte del contrato de compra, no un documento aparte.
- **Apoyarse en el estado de la ficha vs. cláusula genérica:** vincular la garantía al estado
  descrito/fotografiado da más protección al vendedor y transparencia al comprador, encajando
  con el modelo de datos (estado real por artículo).

## Hecho cuando
- Las condiciones reflejan garantías, estado del artículo y límites de desistimiento, con los
  puntos que requieren abogado marcados como pendientes.
- La ficha deja claro el estado real del producto en coherencia con ese texto.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`docs(web): ...` o `feat(web): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
