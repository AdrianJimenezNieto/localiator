# 10 · CD con estrategia de rollback

**Checkbox del roadmap:** «CD con estrategia de rollback».

## Objetivo
Automatizar el **despliegue continuo** a producción tras mergear a `main` (con CI en verde) y
tener una **estrategia de rollback** clara si un deploy sale mal. Se apoya en el despliegue
manual ya montado en la tarea 09 y en la CI existente (`.github/workflows/ci.yml`).

## Qué se toca
- `.github/workflows/deploy.yml` — nuevo workflow de CD (solo tras CI verde en `main`).
- `docker-compose.prod.yml` — versionado de imágenes por tag/SHA para poder volver atrás.
- Documentación (`docs/deploy.md`) — pasos de deploy y de rollback.

## Cómo implementarlo
1. **Disparo:** el CD se ejecuta al hacer merge a `main` **solo si la CI (lint+build+test)
   está en verde**; nunca despliega una rama rota (regla del repo).
2. **Build y publicación de imágenes:** construir las imágenes de API y web etiquetadas con
   el **SHA del commit** (además de `latest`) y subirlas a un registro (GHCR gratuito encaja
   con el principio de coste mínimo).
3. **Deploy al VPS:** por SSH (secreto en GitHub Actions), hacer `pull` de las imágenes nuevas
   y `up -d`, aplicando `prisma migrate deploy` antes de arrancar la API.
4. **Rollback:** como cada release es una imagen etiquetada por SHA, volver atrás = redeploy
   de la etiqueta anterior. Documentar el comando exacto y probarlo una vez.
5. **Salud tras deploy:** comprobar `/health` (y un endpoint público) tras arrancar; si falla,
   abortar/rollback automático o alertar.
6. **Secretos:** claves del VPS y del registro en **GitHub Secrets**, nunca en el repo.

## Decisiones / alternativas
- **Imágenes etiquetadas por SHA vs. solo `latest`:** el SHA permite rollback determinista a
  una versión concreta; `latest` solo no deja volver atrás con seguridad.
- **Migraciones hacia atrás:** Prisma no revierte migraciones de forma trivial; el rollback
  de **código** (imagen anterior) es la primera línea, y las migraciones se diseñan para ser
  compatibles hacia atrás siempre que se pueda. Anotarlo como riesgo a vigilar.
- **CD por SSH + compose vs. orquestador (k8s):** SSH + `docker compose` es proporcionado al
  VPS único del proyecto; Kubernetes sería sobreingeniería y coste.

## Conceptos que probablemente convenga repasar
- **Estrategia de rollback con migraciones de BD** (por qué el esquema debe ser compatible
  hacia atrás).
- **GitHub Actions**: jobs dependientes, `environments` y secretos.

## Hecho cuando
- Un merge a `main` con CI verde despliega solo a producción con imágenes etiquetadas por SHA.
- Existe y está **probado** un procedimiento de rollback a la release anterior.
- Se comprueba la salud tras el deploy. **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`ci(repo): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
