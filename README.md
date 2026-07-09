# Localiator

Monorepo (pnpm workspaces) de la tienda Localiator. Ver decisiones en `CLAUDE.md` y el
tracking en `ROADMAP.md`.

## Estructura

```
apps/
  api/       Backend NestJS + Prisma
  web/       Frontend React + Vite + Tailwind
packages/
  shared/    Tipos y constantes compartidos (@localiator/shared)
```

## Requisitos
- Node >= 22
- pnpm >= 11
- Docker + Docker Compose

## Puesta en marcha (desarrollo)

```bash
# 1. Instalar dependencias
pnpm install

# 2. Crear el .env a partir del ejemplo y ajustar valores
cp .env.example .env

# 3. Levantar PostgreSQL
docker compose up -d db

# 4. Aplicar migraciones (crea las tablas y regenera el cliente de Prisma)
pnpm --filter @localiator/api exec prisma migrate dev

# 5. Poblar la BD con datos de prueba (idempotente, se puede repetir)
pnpm --filter @localiator/api db:seed

# 6. Arrancar backend + frontend en paralelo
pnpm dev
```

- API: http://localhost:3000 (health check en `/health`)
- Web: http://localhost:5173

## Base de datos (Prisma)

### `migrate dev` vs `migrate deploy`
Son dos comandos con propósitos distintos; no son intercambiables.

- **`prisma migrate dev`** — solo en **desarrollo**, nunca en CI/producción:
  1. Compara `schema.prisma` contra el historial de migraciones ya aplicadas.
  2. Si hay diferencias, **genera un nuevo archivo SQL** de migración en
     `prisma/migrations/<timestamp>_<nombre>/`.
  3. Lo aplica a la BD local y regenera el cliente de Prisma.
  4. Si detecta que la BD ha divergido del historial de migraciones (*drift* —
     p. ej. alguien tocó tablas a mano), **puede pedir permiso para resetear la BD
     entera** (borrar y recrear) para dejarla en un estado consistente.
  - Requiere un TTY interactivo (pide confirmación); por eso no vale para CI.

- **`prisma migrate deploy`** — el que se usa en **CI y producción**:
  1. **No genera ninguna migración nueva.** Solo aplica, en orden, los archivos
     SQL de migración que ya existen en el repo (los que `migrate dev` generó
     antes en local y que quedaron commiteados).
  2. No pide confirmación ni resetea nada: si algo no cuadra, falla en vez de
     borrar datos. Pensado para ser seguro sobre una BD con datos reales.

En resumen: **`dev` escribe migraciones nuevas** (paso creativo, solo local);
**`deploy` solo las reproduce** (paso mecánico, seguro para datos reales). El
flujo normal es: tú cambias `schema.prisma` → `migrate dev` genera el SQL y lo
commiteas → CI/producción hace `migrate deploy` para aplicar ese mismo SQL.

### Seed
- `pnpm --filter @localiator/api db:seed` — ejecuta `apps/api/prisma/seed.ts`. Usa
  `upsert` en todos los modelos para ser **idempotente** (se puede correr varias
  veces sin duplicar datos).

## Scripts (raíz)
- `pnpm dev` — arranca api y web en paralelo
- `pnpm build` — compila ambas apps
- `pnpm lint` — lint de todo el workspace
- `pnpm test` — tests de todo el workspace
- `pnpm format` — formatea con Prettier

## Notas
- El backend y el frontend se ejecutan en local (HMR). El `docker-compose.yml` solo levanta
  PostgreSQL en desarrollo; los Dockerfile de despliegue llegan en la Fase 4.
- Nunca commitear `.env`. Los secretos van solo en local / en el servidor.
