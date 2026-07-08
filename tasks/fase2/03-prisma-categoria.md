# 03 · Esquema Prisma: Categoría

**Checkbox del roadmap:** «Esquema Prisma: Categoría».

## Objetivo
Modelar categorías como base de la búsqueda y el filtrado del catálogo. Tanto `Product`
como `Lot` se categorizan. Estructura simple (posiblemente jerárquica) pero sin
sobreingeniería para el MVP.

## Qué se toca
- `apps/api/prisma/schema.prisma` — modelo `Category` + relaciones con `Product` y `Lot`.

## Cómo implementarlo
1. **Modelo `Category`.** Campos:
   - `id` (`cuid`), `name` (`String`), `slug` (`String @unique` — para URLs amigables y SEO,
     ver Fase 5).
   - `parentId` (`String?`) + auto-relación `parent`/`children` para permitir subcategorías.
     Es opcional: si al final las categorías son planas, `parentId` queda siempre null y no
     estorba.
   - `createdAt` / `updatedAt`.
2. **Relación con `Product` y `Lot`.** En cada uno añadir `categoryId` (`String`) y la
   relación `category Category @relation(...)`. En `Category`, los inversos `products` y
   `lots`.
3. **Decidir obligatoriedad.** Recomendado: categoría **obligatoria** (`categoryId String`,
   no nullable) para que todo artículo sea filtrable. Si se quiere permitir artículos sin
   clasificar al darlos de alta, hacerlo nullable; anotarlo aquí si se cambia.
4. **Índice** en `categoryId` de `Product`/`Lot`: Prisma crea índice para la FK
   automáticamente en la mayoría de casos, pero conviene un `@@index([categoryId])`
   explícito pensando en el filtrado del catálogo.

## Decisiones / alternativas
- **Auto-relación jerárquica** (categoría con `parent`) vs. categorías planas: se deja la
  puerta abierta a jerarquía con coste casi nulo. Alternativa plana sería más simple pero
  limita el árbol de navegación del catálogo.
- **`slug` único** desde ya: barato de añadir y necesario para SEO/URLs limpias en Fase 5;
  evita una migración futura.

## Conceptos a repasar (para tus notas)
- Auto-relaciones en Prisma (un modelo que se referencia a sí mismo).
- Diferencia entre índice de FK automático y `@@index` explícito, y cuándo añadirlo.
- Qué es un `slug` y por qué importa para SEO.

## Hecho cuando
- `prisma validate` pasa con `Category` y sus relaciones con `Product` y `Lot`.
- Está decidida y anotada la obligatoriedad de categoría en los artículos.

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
