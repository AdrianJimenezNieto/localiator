# Despliegue en el VPS

Cómo corre Localiator en producción (Fase 4, tarea 09): imágenes Docker de API y web,
`docker-compose.prod.yml`, y **Nginx Proxy Manager** delante con SSL de Let's Encrypt.

## Arquitectura

```
Internet ──HTTPS──▶ Nginx Proxy Manager ──▶ web (nginx, estático)
                                        └──▶ api (NestJS) ──▶ db (Postgres)
```

- **`db`**: PostgreSQL con volumen persistente (`pgdata`).
- **`api`**: NestJS compilado; aplica `prisma migrate deploy` al arrancar; expone `/health`.
- **`web`**: build estático de Vite servido por nginx (con fallback SPA).
- **Nginx Proxy Manager** (fuera del compose): termina el TLS (Let's Encrypt), fuerza
  HTTPS/HSTS y hace proxy al dominio → `web` (y a la API en su subdominio/ruta).

## Requisitos en el VPS

- Docker y Docker Compose.
- Nginx Proxy Manager corriendo (su propio compose) con acceso a los puertos 80/443.
- El dominio apuntando por DNS a la IP del VPS.
- Un fichero **`.env.production`** (NO versionado) junto al `docker-compose.prod.yml`,
  con los valores de producción (ver `.env.example` y `tasks/manual.md`).

## Variables de entorno de producción

`.env.production` debe definir, como mínimo: `POSTGRES_USER/PASSWORD/DB`,
`DATABASE_URL` (apuntando al servicio `db`), `JWT_ACCESS_SECRET`, secretos de Stripe
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `RESEND_API_KEY`, `MAIL_FROM`,
`TURNSTILE_SECRET_KEY`, OAuth de Google, `APP_URL`/`PUBLIC_WEB_URL`, `API_PUBLIC_URL`
y `VITE_API_URL`. `NODE_ENV=production` (activa cookies `Secure`).

## Despliegue manual (primera vez)

```sh
# En el VPS, en la carpeta del proyecto (p. ej. /opt/localiator):
git clone <repo> . && cd /opt/localiator
# Crear .env.production con los secretos reales.
docker compose -f docker-compose.prod.yml up -d --build
# La API aplica las migraciones sola (migrate deploy) al arrancar.
docker compose -f docker-compose.prod.yml ps      # comprobar healthchecks
```

Luego, en **Nginx Proxy Manager**:

1. Crear un *Proxy Host* para el dominio → `web` (puerto 80 del contenedor, o
   `127.0.0.1:8080`).
2. Crear un *Proxy Host* para el subdominio de la API → `api` (`127.0.0.1:3000`).
   Exponer también `/sitemap.xml` y `/robots.txt` desde la raíz del dominio hacia la
   API (tarea 06).
3. Pedir certificado **Let's Encrypt** y activar *Force SSL* + **HSTS**.

## Comprobación

- Abrir el dominio por HTTPS, registrar/loguear.
- Hacer un pedido de prueba con Stripe (test) y ver factura + email + estado de recogida.
- `GET /health` responde `ok`.

## Separación de entornos

- **dev**: `docker-compose.yml` (solo Postgres) + apps en local con HMR.
- **producción**: `docker-compose.prod.yml` en el VPS, con su `.env.production` aislado.
- (Opcional) **staging**: mismo compose en otro VPS/carpeta con su propio `.env` y
  subdominio, para probar antes de producción.

## Notas

- El entrypoint de la API compilada es `dist/src/main.js` (lo que deja `nest build`).
- Imagen de la API: por simplicidad conserva el `node_modules` completo del build.
  Reducir su tamaño (deploy pruneado) queda como mejora futura.
## Despliegue continuo (CD) y rollback — tarea 10

El workflow `.github/workflows/deploy.yml` automatiza el despliegue:

1. **Disparo**: se ejecuta cuando el workflow **CI** termina en verde sobre `main`
   (`workflow_run` + `conclusion == success`). Nunca despliega una rama rota.
2. **Imágenes por SHA**: construye y publica en **GHCR** las imágenes de API y web
   etiquetadas con el **SHA** del commit (además de `latest`). El SHA es la clave del
   rollback determinista.
3. **Deploy por SSH**: entra al VPS, hace `git pull` del repo, `docker compose pull`
   de las imágenes nuevas y `up -d`. La API aplica `migrate deploy` al arrancar.
4. **Health-check + rollback**: tras arrancar, sondea `GET /health`. Si responde, guarda
   el tag en `.last_good_tag` (release estable). Si **falla**, vuelve a desplegar el tag
   anterior (`.last_good_tag`) automáticamente y marca el job como fallido.

### Rollback manual

Como cada release es una imagen etiquetada por SHA, volver atrás es redeploy del tag
anterior:

```sh
cd /opt/localiator
export IMAGE_TAG=<sha-anterior>          # o: cat .last_good_tag
docker compose -f docker-compose.prod.yml pull api web
docker compose -f docker-compose.prod.yml up -d
```

### Secretos necesarios (GitHub → Settings → Secrets/Variables)

- Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PROJECT_DIR`.
- Variables: `VITE_API_URL` (URL pública de la API para el build de la web).
- El `environment: production` del job permite exigir **aprobación manual** antes de
  desplegar.

### Migraciones y compatibilidad hacia atrás

Prisma no revierte migraciones de forma trivial. El rollback de **código** (imagen
anterior) es la primera línea; por eso las migraciones deben diseñarse **compatibles
hacia atrás** siempre que se pueda (p. ej. añadir columnas nullable antes de usarlas),
para que la versión anterior siga funcionando contra el esquema nuevo. Riesgo a vigilar.
