# Copias de seguridad de la base de datos

Backups automáticos de PostgreSQL para no perder pedidos/facturas ante un fallo
(Fase 4, tarea 07). Estrategia: **volcado lógico** con `pg_dump`, comprimido, cifrado
y con rotación. Suficiente y portable para el volumen del MVP; PITR (WAL archiving)
se reserva para cuando el RPO deba ser de minutos.

## Scripts

- `scripts/backup-db.sh` — vuelca, comprime (gzip), cifra (gpg AES256 si hay
  `BACKUP_PASSPHRASE`) y rota (7 diarias + 4 semanales por defecto).
- `scripts/restore-db.sh` — descifra/descomprime y aplica un backup con `psql`.

Ambos leen la conexión de `DATABASE_URL` y los secretos del entorno; **nada se
commitea** (ver `tasks/manual.md`).

## Variables

| Variable            | Por defecto | Descripción                                  |
|---------------------|-------------|----------------------------------------------|
| `DATABASE_URL`      | (obligat.)  | Cadena de conexión a la BD.                  |
| `BACKUP_DIR`        | `./backups` | Carpeta raíz (subcarpetas `daily/`, `weekly/`). |
| `BACKUP_PASSPHRASE` | —           | Si está, cifra el backup con gpg (AES256).   |
| `KEEP_DAILY`        | `7`         | Copias diarias a conservar.                  |
| `KEEP_WEEKLY`       | `4`         | Copias semanales a conservar (domingos).     |

## Programación (cron en el VPS)

Ejecutar a diario en horario de bajo tráfico. Ejemplo de crontab (03:30):

```cron
30 3 * * *  cd /opt/localiator && \
  DATABASE_URL="$DATABASE_URL" BACKUP_DIR=/var/backups/localiator \
  BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" \
  /opt/localiator/scripts/backup-db.sh >> /var/log/localiator-backup.log 2>&1
```

`pg_dump`/`psql`/`gpg` deben estar disponibles donde se ejecute. Si Postgres corre en
Docker (tarea 09), lanza el script en un contenedor con el cliente de postgres (misma
imagen `postgres:17-alpine`) o instala `postgresql-client` + `gnupg` en el host.

## Almacenamiento y cifrado en reposo

- Guardar los backups **fuera del volumen de la BD** (otro disco/carpeta del VPS) para
  que un fallo del volumen no se lleve también las copias.
- Cifrado en reposo: los backups se cifran con `BACKUP_PASSPHRASE` (gpg AES256), además
  del cifrado de disco/volumen del VPS (coherente con la tarea 05). Guarda la passphrase
  en un gestor de secretos, **no** junto a los backups.
- (Opcional, sin coste) sincronizar una copia a almacenamiento externo.

## Restauración (¡probada!)

Un backup sin restauración probada no cuenta. Procedimiento verificado en un entorno
de prueba (dump cifrado → restore en BD nueva → recuento de filas idéntico al origen):

```sh
# 1. Crear/usar una BD de prueba (NO restaurar sobre producción a la ligera).
createdb -U localiator restore_test

# 2. Restaurar el backup elegido.
DATABASE_URL="postgresql://localiator:PASS@localhost:5432/restore_test" \
  BACKUP_PASSPHRASE="…" \
  ./scripts/restore-db.sh /var/backups/localiator/daily/localiator-YYYYMMDD-HHMM.sql.gz.gpg

# 3. Verificar (p. ej. recuento de tablas clave) y descartar la BD de prueba.
psql -U localiator -d restore_test -c 'SELECT count(*) FROM "Order";'
dropdb -U localiator restore_test
```

Antes del lanzamiento (tarea 12) hay que hacer una **copia previa** y confirmar que la
restauración funciona.
