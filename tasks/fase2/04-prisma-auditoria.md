# 04 · Esquema Prisma: auditoría de precio y stock

**Checkbox del roadmap:** «Esquema Prisma: tablas de auditoría (cambios de precio y stock)».

## Objetivo
Registrar **quién cambió qué y cuándo** en precios y stock de productos/lotes, como exige
`CLAUDE.md` (auditoría de acciones sensibles). No es el histórico de precios como
funcionalidad de negocio (eso está descartado) — es una traza de auditoría.

## Qué se toca
- `apps/api/prisma/schema.prisma` — modelo(s) de auditoría.

## Cómo implementarlo
1. **Enfoque: una tabla genérica de cambios** en lugar de una por atributo. Modelo
   `AuditLog` con:
   - `id` (`cuid`), `createdAt` (`@default(now())`).
   - `actorId` (`String?`) + relación opcional a `User` (nullable por si el cambio lo hace
     un proceso automático o el actor se borra por RGPD).
   - `entityType` (enum `AuditEntity { PRODUCT LOT }`) y `entityId` (`String`) para señalar
     el artículo afectado sin FK polimórfica dura.
   - `field` (enum `AuditField { PRICE STOCK DISCOUNT }`) — qué se cambió.
   - `oldValue` / `newValue` (`String` o `Int`; usar `String` para no atarse al tipo del
     campo, o dos `Int?` si solo se auditan valores numéricos). Recomendado: `Int?` por
     ahora, ya que precio (céntimos) y stock son enteros.
2. **Índice** `@@index([entityType, entityId])` para consultar el historial de un artículo.
3. **Quién escribe aquí:** la *escritura* de estos registros es lógica de Fase 3 (al hacer
   el CRUD de admin). Aquí solo se define el esquema; se anota que el CRUD deberá insertar
   un `AuditLog` dentro de la **misma transacción** que el cambio de precio/stock.

## Decisiones / alternativas
- **Tabla genérica (`AuditLog`)** vs. tabla por entidad (`ProductPriceHistory`, …): la
  genérica es más flexible y evita multiplicar tablas; a cambio pierde algo de integridad
  referencial fuerte (el `entityId` no es FK real). Aceptable para auditoría.
- **`actorId` nullable:** permite cambios de sistema y sobrevive al borrado de usuario
  (RGPD). Alternativa (obligatorio) rompería el derecho al olvido.
- **Valores como `Int?`** vs `String`/JSON: `Int?` encaja con precio y stock; si en el
  futuro se auditan campos no numéricos, migrar a `String`/`Json`.

## Conceptos a repasar (para tus notas)
- Patrón de tabla de auditoría genérica vs. específica.
- FK polimórfica (`entityType` + `entityId`) y por qué se pierde integridad referencial.
- Importancia de escribir la auditoría **en la misma transacción** que el cambio (atomicidad).

## Hecho cuando
- `prisma validate` pasa con `AuditLog` y sus enums.
- Está anotado explícitamente que la inserción de auditoría se hará transaccional en Fase 3.

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
