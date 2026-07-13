# Imagen de producción de la API (NestJS). Build multi-stage: se compila con todas
# las dependencias y luego se ejecuta una imagen que solo lleva lo necesario.
# El contexto de build es la RAÍZ del monorepo (la API depende de @localiator/shared
# y del pnpm-lock.yaml de la raíz).

# ---- Stage build: instala deps, genera el cliente Prisma y compila ----
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Copiamos todo el repo (el .dockerignore excluye node_modules/dist del host) y hacemos
# una instalación limpia y reproducible desde el lockfile.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @localiator/api exec prisma generate
RUN pnpm --filter @localiator/api build

# ---- Stage runtime: solo lo necesario para ejecutar ----
FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo

# Copiamos el repo ya instalado/compilado desde el stage anterior. Se conserva el
# node_modules de pnpm (con sus symlinks relativos) y el cliente Prisma generado.
COPY --from=build /repo /repo
WORKDIR /repo/apps/api

EXPOSE 3000

# En el arranque: aplicamos las migraciones pendientes con `migrate deploy` (nunca
# `migrate dev` en producción: determinista, no genera ni borra) y luego arrancamos.
# El entrypoint (dist/src/main.js) es donde nest build deja el compilado.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main.js"]
