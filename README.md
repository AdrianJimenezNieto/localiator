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
- `prisma migrate dev` — uso en **desarrollo**: crea y aplica una nueva migración a
  partir de los cambios en `schema.prisma`, y regenera el cliente. Pide confirmación
  y puede resetear la BD si detecta drift.
- `prisma migrate deploy` — uso en **CI/producción**: aplica las migraciones ya
  existentes sin generar ninguna nueva ni pedir confirmación.
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
