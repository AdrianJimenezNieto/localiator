# 09 · Despliegue en VPS (Docker + Nginx Proxy Manager + SSL + dominio)

**Checkbox del roadmap:** «Despliegue en VPS: Docker + Nginx Proxy Manager + SSL Let's
Encrypt + dominio».

## Objetivo
Dejar la app **corriendo en producción** en el VPS: imágenes Docker de API y web, un
`docker-compose` de producción, **Nginx Proxy Manager** como reverse proxy con **SSL de
Let's Encrypt** y el **dominio propio** apuntando. Es el paso que convierte el proyecto en
algo público; consume backups (07), logs (08) y seguridad (05).

## Qué se toca
- `apps/api/Dockerfile` y `apps/web/Dockerfile` — nuevos (hoy no existen).
- `docker-compose.prod.yml` — Postgres + API + web para producción (el actual es de dev).
- `.env.production` (fuera del repo) y `.env.example` — variables de producción.
- Configuración de **Nginx Proxy Manager** (en el VPS, no necesariamente en el repo).

## Cómo implementarlo
1. **Dockerfiles de producción:** build multi-stage para API (NestJS compilado) y web
   (build estático servido por Nginx o similar). Imágenes pequeñas, sin dev-deps.
2. **`docker-compose.prod.yml`:** servicios `db` (Postgres con volumen persistente), `api` y
   `web`, con `restart: unless-stopped`, healthchecks y variables desde `.env.production`.
   Reutiliza el `/health` ya existente en la API.
3. **Migraciones Prisma:** aplicar `prisma migrate deploy` en el arranque/deploy, no
   `migrate dev`.
4. **Reverse proxy + SSL:** Nginx Proxy Manager delante, con el **dominio** apuntando por DNS
   al VPS y **certificado Let's Encrypt** (renovación automática). Forzar HTTPS/HSTS
   (coherente con tarea 05).
5. **Separación de entornos:** dejar claro dev/staging/producción (el roadmap Fase 0 lo dejó
   pendiente para aquí). Como mínimo, producción aislada con sus propios secretos.
6. **Comprobación:** desplegar, abrir el dominio por HTTPS, registrar/loguear, hacer un
   pedido de prueba con Stripe en modo test y ver la factura/email.

## Decisiones / alternativas
- **Nginx Proxy Manager vs. Traefik/Nginx a mano:** NPM ya está decidido en `CLAUDE.md`
   (UI sencilla para certificados y hosts), evita escribir config de Nginx a mano.
- **Web como estático servido por Nginx vs. Node:** estático es más ligero y seguro para una
  SPA; el Node solo hace falta si se añade SSR (tarea 06, futuro).
- **`migrate deploy` vs. `migrate dev`:** en producción nunca `dev` (genera/borra); `deploy`
  aplica migraciones ya existentes de forma determinista.

## Conceptos que probablemente convenga repasar
- **Build multi-stage** en Docker y por qué reduce tamaño/superficie.
- **`prisma migrate deploy`** y el flujo de migraciones en producción.

## Hecho cuando
- API y web corren en el VPS vía `docker-compose.prod.yml`, con Postgres persistente y
  migraciones aplicadas con `migrate deploy`.
- El dominio propio sirve la web por **HTTPS** con Let's Encrypt vía Nginx Proxy Manager.
- Un flujo de compra de prueba (Stripe test) funciona de extremo a extremo en producción.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`build(repo): ...` / `chore(repo): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
