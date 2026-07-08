# 02 · Esquema Prisma: Producto y Lote

**Checkbox del roadmap:** «Esquema Prisma: Producto y Lote (entidades separadas, mismos
atributos)».

## Objetivo
Modelar producto individual y lote como **entidades separadas e independientes**, sin
relación de contención (un lote NO contiene productos). Comparten forma (mismos atributos)
pero son tablas distintas. Ver decisión de modelado en `CLAUDE.md`.

## Qué se toca
- `apps/api/prisma/schema.prisma` — modelos `Product` y `Lot` (+ enum de estado).
- `packages/shared/src/index.ts` — ya existe `ItemKind` (`product`/`lot`); sirve para que
  el frontend distinga el tipo sin acoplarse a la BD.

## Cómo implementarlo
1. **Atributos comunes** (según `CLAUDE.md`): nombre, descripción, precio, descuento,
   fotos, categoría, estado del artículo y stock.
2. **Enum de estado del artículo.** `enum ItemCondition { NEW LIKE_NEW GOOD FAIR DAMAGED }`
   (muchos artículos vienen con desperfectos; el estado es clave para el filtrado). Ajustar
   los valores si el diseño de catálogo define otra escala.
3. **Modelo `Product`.** Campos:
   - `id` (`cuid`), `name`, `description` (`String`), `condition` (`ItemCondition`).
   - `priceCents` (`Int`) y `discountCents` (`Int @default(0)`) — dinero en **céntimos**,
     nunca `Float`, para evitar errores de coma flotante en euros.
   - `stock` (`Int @default(0)`).
   - `photos` (`String[]` — URLs; la subida real es Fase 3).
   - relación a categoría (se completa en `03-prisma-categoria.md`).
   - `createdAt` / `updatedAt`.
4. **Modelo `Lot`.** Mismos campos que `Product`. Se duplica la forma a propósito: son
   entidades independientes. No crear tabla intermedia ni herencia.
5. **No** modelar contención lote→producto. Si algún día un lote necesitara detalle de
   contenido, sería un campo descriptivo, no una FK.

## Decisiones / alternativas
- **Dos tablas duplicadas vs. una tabla con `kind`:** el roadmap y `CLAUDE.md` piden
  entidades separadas, así que dos tablas. Alternativa (tabla única con discriminador
  `kind`) se descarta para respetar la decisión de dominio y permitir que diverjan en el
  futuro sin migración dolorosa.
- **Precio en céntimos (`Int`)** vs `Decimal`: `Int` en céntimos es lo más simple y seguro
  para euros. `Decimal` de Prisma también valdría; se evita por comodidad en el frontend
  (aritmética con enteros).
- **`photos` como `String[]`** vs tabla `Photo`: array basta para el MVP; una tabla aparte
  se valorará en Fase 3 si hay que ordenar/etiquetar fotos.

## Conceptos a repasar (para tus notas)
- Por qué el dinero se guarda en enteros (céntimos) y no en `float`.
- Arrays escalares en Postgres vía Prisma (`String[]`).
- Duplicación deliberada de esquema cuando dos entidades son independientes por dominio.

## Hecho cuando
- `prisma validate` pasa con `Product`, `Lot` y el enum `ItemCondition`.
- Ningún vínculo de contención entre `Lot` y `Product` en el esquema.

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
