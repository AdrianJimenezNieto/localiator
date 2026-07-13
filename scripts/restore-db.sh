#!/usr/bin/env bash
#
# Restauración de una copia de seguridad de Localiator (Fase 4, tarea 07).
#
# Toma un fichero de backup (.sql.gz o .sql.gz.gpg), lo descifra/descomprime y lo
# aplica sobre la base de datos indicada por DATABASE_URL. Un backup sin restauración
# probada no cuenta: este script es el que se usa para probarla y para recuperar.
#
# Uso:
#   DATABASE_URL=postgresql://user:pass@host:5432/db \
#     [BACKUP_PASSPHRASE=...] ./scripts/restore-db.sh <fichero-backup>
#
# ¡CUIDADO! Restaurar sobrescribe datos. Hazlo sobre una BD de prueba o tras una
# copia previa (la tarea 12 exige backup previo al lanzamiento).

set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
file="${1:?Uso: restore-db.sh <fichero-backup>}"
[ -f "${file}" ] || { echo "No existe el fichero: ${file}" >&2; exit 1; }

echo "[restore] Restaurando ${file} en la base de datos destino…"

# Según la extensión: descifrar (gpg) o no, y descomprimir (gunzip), y aplicar con psql.
case "${file}" in
  *.sql.gz.gpg)
    : "${BACKUP_PASSPHRASE:?El backup está cifrado: falta BACKUP_PASSPHRASE}"
    gpg --batch --yes --quiet --decrypt --passphrase "${BACKUP_PASSPHRASE}" "${file}" \
      | gunzip \
      | psql "${DATABASE_URL}"
    ;;
  *.sql.gz)
    gunzip -c "${file}" | psql "${DATABASE_URL}"
    ;;
  *)
    echo "Extensión no reconocida (esperaba .sql.gz o .sql.gz.gpg): ${file}" >&2
    exit 1
    ;;
esac

echo "[restore] Restauración completada."
