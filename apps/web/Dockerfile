# Imagen de producción de la web (React + Vite). Se compila a estático y se sirve con
# nginx. Contexto de build: la RAÍZ del monorepo (depende de @localiator/shared).

# ---- Stage build: compila el estático ----
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

# Vite inyecta las variables VITE_* en tiempo de BUILD (no en runtime), así que la
# URL de la API se pasa como build-arg. En producción apunta al dominio de la API.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @localiator/web build

# ---- Stage runtime: nginx sirviendo el estático ----
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
