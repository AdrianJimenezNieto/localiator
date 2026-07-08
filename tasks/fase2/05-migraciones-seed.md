# 05 · Migraciones y seed de datos de prueba

**Checkbox del roadmap:** «Migraciones y seed de datos de prueba».

## Objetivo
Materializar en Postgres los modelos definidos (Usuario, Producto, Lote, Categoría,
Auditoría) mediante la primera migración de Prisma, y crear un seed reproducible con datos
de prueba para desarrollo.

## Qué se toca
- `apps/api/prisma/migrations/` — nueva migración generada por Prisma.
- `apps/api/prisma/seed.ts` (nuevo) — script de seed.
- `apps/api/package.json` — bloque `prisma.seed` y script `db:seed`.
- Requiere Postgres levantado vía `docker-compose.yml` (Fase 0) y `DATABASE_URL` en `.env`.

## Cómo implementarlo
1. **Prerrequisito:** los modelos de los archivos 01–04 deben estar ya en `schema.prisma` y
   validar. La migración se hace una vez, con el esquema base completo, para no acumular
   micro-migraciones en desarrollo temprano.
2. **Generar migración:** `pnpm --filter api exec prisma migrate dev --name init_fase2`.
   Esto crea la migración, la aplica a la BD local y regenera el cliente Prisma.
3. **Script de seed (`seed.ts`):**
   - Crear 2 usuarios: un `ADMIN` y un `BUYER` de prueba (contraseña hasheada — reutilizar
     el hashing de argon2 del archivo `07-login-password.md`; si aún no existe, dejar el
     hash como TODO y no commitear contraseñas en claro).
   - Crear unas cuantas `Category`.
   - Crear varios `Product` y `Lot` con precios en céntimos, estados variados y categorías.
   - Usar `upsert` por un campo único (email, slug) para que el seed sea **idempotente**
     (se puede correr varias veces sin duplicar).
4. **Registrar el seed** en `apps/api/package.json`:
   `"prisma": { "seed": "ts-node prisma/seed.ts" }` (o `tsx`), y un script
   `"db:seed": "prisma db seed"`.
5. **Documentar** en el README/onboarding el flujo dev: `migrate dev` + `db:seed`.

## Decisiones / alternativas
- **Una migración `init_fase2`** en vez de varias pequeñas: en desarrollo temprano, con la
  BD aún sin datos reales, agrupar es limpio. A partir de producción, cada cambio será su
  propia migración.
- **Seed idempotente con `upsert`** vs. borrar-y-recrear: `upsert` es más seguro y no
  depende del orden; alternativa (truncate) es más agresiva y se evita.
- Contraseñas del seed: **nunca** en texto plano en el repo; hashear con la misma función
  que el login.

## Conceptos a repasar (para tus notas)
- Diferencia entre `prisma migrate dev` (desarrollo) y `prisma migrate deploy` (producción).
- Qué es un seed idempotente y por qué `upsert` ayuda.
- Cómo Prisma regenera el cliente tras migrar y por qué hay que hacerlo.

## Hecho cuando
- Existe la carpeta de migración y la BD local tiene todas las tablas.
- `pnpm --filter api db:seed` puebla datos y es re-ejecutable sin duplicar.
- El flujo (`migrate dev` + `db:seed`) está documentado para el resto del equipo.
