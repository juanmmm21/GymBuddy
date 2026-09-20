#!/usr/bin/env bash
#
# Restaura una copia de `backup-d1.sh` en una base D1 de la cuenta.
#
# Uso:  ./scripts/restore-d1.sh <fichero.sql> <base-destino> [-y]
#       ./scripts/restore-d1.sh .wrangler/backups/prod-2026-09-20T101500Z.sql gymbuddy-restore-drill
#
# POR QUÉ NO BASTA `wrangler d1 execute --file <la copia>`: el volcado declara las tablas en el
# orden en que las tiene SQLite, no por dependencias, así que sus `INSERT` de una tabla hija llegan
# antes de que exista la tabla padre. D1 aplica **siempre** las claves ajenas y el
# `PRAGMA defer_foreign_keys=TRUE` que el propio volcado trae en la primera línea no sobrevive al
# troceado del import (se procesa en varias transacciones). Comprobado el 2026-09-20 contra una D1
# de verdad: falla con `no such table: main.user`, y con el esquema ya creado, con
# `FOREIGN KEY constraint failed`. Por eso aquí se aplica el esquema primero y los datos después,
# reordenados por dependencias.
#
# El runbook, con el resto de la maniobra, está en docs/operations/copia-de-seguridad-de-la-d1.md.

set -euo pipefail

# Orden de dependencias: cada tabla va después de aquellas a las que apunta. Se escribe a mano
# porque es una decisión sobre el esquema y se lee de un tirón; el script se niega a seguir si el
# volcado trae una tabla que no está en esta lista, así que una tabla nueva no puede colarse sin
# decidir su sitio.
readonly TABLE_ORDER=(
  # Las dos primeras no son del dominio: `d1_migrations` es el registro de migraciones de wrangler
  # (el volcado lo trae, así que la base restaurada queda ya marcada como migrada) y
  # `sqlite_sequence` es la tabla interna con el contador de su AUTOINCREMENT, que va detrás.
  d1_migrations
  sqlite_sequence
  user
  catalog_exercise
  catalog_sync_state
  media_upload_month
  invitation
  passkey_credential
  device_link
  push_subscription
  routine
  workout_session
  tracked_exercise
  auth_challenge
  routine_item
  set_entry
  exercise_media
  personal_record
)

if [[ $# -lt 2 ]]; then
  echo "uso: $(basename "$0") <fichero.sql> <base-destino> [-y]" >&2
  exit 1
fi

backup_file="$1"
target_database="$2"
assume_yes="${3:-}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
api_dir="$(dirname "$script_dir")"

if [[ ! -s "$backup_file" ]]; then
  echo "error: '$backup_file' no existe o está vacío" >&2
  exit 1
fi
backup_file="$(cd "$(dirname "$backup_file")" && pwd)/$(basename "$backup_file")"

# Reordenar por líneas solo vale si cada INSERT ocupa una línea entera, que es como los escribe
# `wrangler d1 export`. Uno partido en varias se reconoce porque su primera línea no cierra con
# punto y coma; si apareciera, mejor parar que trocear una sentencia por la mitad.
if grep '^INSERT INTO' "$backup_file" | grep -qv ';$'; then
  echo "error: el volcado trae algún INSERT repartido en varias líneas y este script lo partiría" >&2
  exit 1
fi

# Toda tabla del volcado tiene que tener un sitio en el orden de dependencias.
volcado_tables="$(grep -oE 'CREATE TABLE (IF NOT EXISTS )?[`"][a-z0-9_]+[`"]' "$backup_file" | grep -oE '[`"][a-z0-9_]+[`"]' | tr -d '`"' | sort -u)"
for table in $volcado_tables; do
  found=''
  for known in "${TABLE_ORDER[@]}"; do
    [[ "$known" == "$table" ]] && found='yes'
  done
  if [[ -z "$found" ]]; then
    echo "error: el volcado trae la tabla '$table', que no está en TABLE_ORDER de este script" >&2
    echo "       añádela en su sitio (después de las tablas a las que apunta) y repite" >&2
    exit 1
  fi
done

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
schema_file="$work_dir/schema.sql"
data_file="$work_dir/data.sql"

# El esquema es todo lo que no es un INSERT: los CREATE TABLE ocupan varias líneas y los CREATE
# INDEX van al final del volcado.
grep -v '^INSERT INTO' "$backup_file" > "$schema_file"

echo 'PRAGMA defer_foreign_keys=TRUE;' > "$data_file"
inserts_written=0
for table in "${TABLE_ORDER[@]}"; do
  # El nombre va entrecomillado en el volcado, así que un prefijo no puede confundir dos tablas.
  written="$(grep -c "^INSERT INTO \"$table\"" "$backup_file" || true)"
  if [[ "$written" -gt 0 ]]; then
    grep "^INSERT INTO \"$table\"" "$backup_file" >> "$data_file"
    inserts_written=$((inserts_written + written))
  fi
done

inserts_total="$(grep -c '^INSERT INTO' "$backup_file" || true)"
if [[ "$inserts_written" -ne "$inserts_total" ]]; then
  echo "error: se reordenaron $inserts_written de $inserts_total INSERT; hay filas de una tabla" >&2
  echo "       que este script no reconoce y restaurar así dejaría datos fuera" >&2
  exit 1
fi

cd "$api_dir"

# Se restaura sobre una base VACÍA: el volcado crea las tablas, así que si alguna ya está el
# esquema falla a medias y deja la base en un estado que no es ni el de antes ni el de la copia.
# Una D1 recién creada solo trae su tabla interna, así que basta con mirar las del volcado.
existing_list=''
for table in "${TABLE_ORDER[@]}"; do
  [[ -n "$existing_list" ]] && existing_list="$existing_list,"
  existing_list="$existing_list'$table'"
done
existing_count="$(pnpm exec wrangler d1 execute "$target_database" --remote --yes --json \
  --command "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ($existing_list)" |
  grep -oE '"n": *[0-9]+' | grep -oE '[0-9]+')"

if [[ "$existing_count" != '0' ]]; then
  echo "error: la base '$target_database' ya tiene $existing_count tablas de GymBuddy" >&2
  echo "       una copia se restaura sobre una base vacía (\`wrangler d1 create\`); para volver" >&2
  echo "       una base a un punto anterior sin recrearla está Time Travel (ver el runbook)" >&2
  exit 1
fi

echo "Copia:   $backup_file"
echo "Destino: D1 '$target_database' (remota)"
echo "Se aplicarán $inserts_total sentencias INSERT sobre el esquema del volcado."

if [[ "$assume_yes" != '-y' ]]; then
  # Lo que se teclea es el nombre de la base: así no se restaura encima de producción de un enter.
  printf "Escribe el nombre de la base para confirmar: "
  read -r typed
  if [[ "$typed" != "$target_database" ]]; then
    echo 'cancelado' >&2
    exit 1
  fi
fi

echo '── Esquema'
pnpm exec wrangler d1 execute "$target_database" --remote --yes --file="$schema_file"
echo '── Datos'
pnpm exec wrangler d1 execute "$target_database" --remote --yes --file="$data_file"

# Lo que hay que mirar al terminar: los recuentos de lo que duele perder. Se comparan con los de la
# base de origen (el runbook explica de dónde salen). Van como subconsultas y no como UNION ALL:
# D1 corta los compound SELECT con demasiados términos («too many terms in compound SELECT»).
counts_query='SELECT'
for table in user tracked_exercise workout_session set_entry routine routine_item personal_record exercise_media passkey_credential; do
  [[ "$counts_query" != 'SELECT' ]] && counts_query="$counts_query,"
  counts_query="$counts_query (SELECT COUNT(*) FROM \"$table\") AS \"$table\""
done
echo '── Recuentos de la base restaurada'
pnpm exec wrangler d1 execute "$target_database" --remote --yes --command "$counts_query"
