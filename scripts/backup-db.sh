#!/usr/bin/env bash
#
# Copia de seguridad de la base de datos PostgreSQL de Localiator (Fase 4, tarea 07).
#
# Hace un volcado LÓGICO con pg_dump, lo comprime con gzip y (si hay passphrase) lo
# cifra con gpg. Aplica rotación: conserva las últimas N diarias y las últimas M
# semanales, borrando lo más antiguo para no llenar el disco.
#
# Uso (normalmente desde cron en el VPS, o dentro de un contenedor con el cliente
# de postgres):
#   DATABASE_URL=postgresql://user:pass@host:5432/db BACKUP_DIR=/backups ./scripts/backup-db.sh
#
# Variables:
#   DATABASE_URL       (obligatoria) cadena de conexión a la BD.
#   BACKUP_DIR         (por defecto ./backups) carpeta raíz de las copias.
#   BACKUP_PASSPHRASE  (opcional) si está, cifra el backup con gpg (AES256).
#   KEEP_DAILY         (por defecto 7)  cuántas copias diarias conservar.
#   KEEP_WEEKLY        (por defecto 4)  cuántas copias semanales conservar.
#
# NUNCA se commitea DATABASE_URL ni BACKUP_PASSPHRASE: vienen del entorno (.env del
# VPS), fuera del repo (CLAUDE.md / tasks/manual.md).

set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"

DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

stamp="$(date +%Y%m%d-%H%M)"
ext="sql.gz"
[ -n "${BACKUP_PASSPHRASE:-}" ] && ext="sql.gz.gpg"
outfile="${DAILY_DIR}/localiator-${stamp}.${ext}"

echo "[backup] Volcando la base de datos a ${outfile}"

# pg_dump → gzip → (opcional) gpg, todo por tuberías para no escribir el volcado sin
# comprimir/cifrar en disco en ningún momento.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  pg_dump "${DATABASE_URL}" \
    | gzip \
    | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase "${BACKUP_PASSPHRASE}" -o "${outfile}"
else
  echo "[backup] AVISO: sin BACKUP_PASSPHRASE; el backup NO va cifrado (solo para dev)."
  pg_dump "${DATABASE_URL}" | gzip > "${outfile}"
fi

echo "[backup] Copia creada: $(du -h "${outfile}" | cut -f1)"

# Copia semanal: los domingos (día 7) guardamos también una copia en weekly/.
if [ "$(date +%u)" = "7" ]; then
  cp "${outfile}" "${WEEKLY_DIR}/"
  echo "[backup] Copia semanal guardada en ${WEEKLY_DIR}"
fi

# Rotación: conserva las más recientes, borra el resto. `ls -1t` ordena por fecha
# descendente; nos saltamos las primeras N y borramos las siguientes.
prune() {
  local dir="$1" keep="$2"
  local old
  old="$(ls -1t "${dir}" 2>/dev/null | tail -n "+$((keep + 1))" || true)"
  if [ -n "${old}" ]; then
    echo "${old}" | while IFS= read -r f; do rm -f "${dir}/${f}"; done
    echo "[backup] Rotación en ${dir}: eliminadas $(echo "${old}" | wc -l) antiguas."
  fi
}

prune "${DAILY_DIR}" "${KEEP_DAILY}"
prune "${WEEKLY_DIR}" "${KEEP_WEEKLY}"

echo "[backup] Hecho."
