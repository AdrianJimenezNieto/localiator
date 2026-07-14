# 07 · Backups automáticos de la base de datos

**Checkbox del roadmap:** «Backups automáticos de la base de datos».

## Objetivo
Automatizar copias de seguridad de PostgreSQL en el VPS, con **rotación** y **restauración
probada**, para no perder pedidos/facturas ante un fallo. Prepara el terreno del despliegue
(tarea 09) y del cifrado en reposo (tarea 05).

## Qué se toca
- `scripts/backup-db.sh` — script de `pg_dump` con nombre por fecha.
- `docker-compose.yml` (o el de producción de la tarea 09) — servicio/cron de backup.
- Documentación (`docs/backups.md` o similar) — cómo restaurar.

## Cómo implementarlo
1. **Volcado:** `pg_dump` del contenedor de Postgres a un fichero comprimido con marca de
   fecha (`localiator-YYYYMMDD-HHmm.sql.gz`).
2. **Programación:** cron en el VPS (o un contenedor tipo *sidecar* con cron) que lance el
   script a diario en horario de bajo tráfico.
3. **Rotación (retención):** conservar p. ej. 7 diarias + 4 semanales; borrar las más
   antiguas para no llenar el disco.
4. **Almacenamiento:** guardar fuera del volumen de la BD (otro disco/carpeta del VPS) y, si
   es posible sin coste, una copia externa. **Cifrar** los backups (coherente con tarea 05).
5. **Restauración probada:** documentar y **ejecutar al menos una vez** un `restore` en un
   entorno de prueba; un backup sin restauración verificada no cuenta.
6. **Secretos:** credenciales de BD desde `.env`, nunca en el script commiteado.

## Decisiones / alternativas
- **`pg_dump` lógico vs. snapshot físico/PITR:** `pg_dump` es simple, portable y suficiente
  para el volumen del MVP; PITR (WAL archiving) se reserva para cuando el RPO deba ser de
  minutos.
- **Cron del host vs. contenedor con cron:** contenedor mantiene todo dentro de Docker
  (coherente con el stack); cron del host es más simple. Elegir según cómo quede la tarea 09.
- **Retención 7+4 vs. más:** equilibra espacio en el VPS y capacidad de volver atrás; es
  ajustable.

## Conceptos que probablemente convenga repasar
- Diferencia **backup lógico (`pg_dump`) vs. físico/PITR** y qué implica cada uno para RPO/RTO.

## Hecho cuando
- Hay backups automáticos diarios con rotación y almacenados fuera del volumen de la BD.
- Los backups están cifrados y la **restauración se ha probado** con éxito, documentada.
- **La CI (lint + build + test) está en verde.**

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`chore(repo): ...` / `feat(repo): ...`).
3. Con la **CI en verde**, abrir PR y **squash and merge** a `main`. Borrar la rama.
