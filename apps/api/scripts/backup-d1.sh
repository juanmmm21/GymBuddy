#!/usr/bin/env bash
#
# Copia de seguridad de la D1 de producción: un volcado SQL completo (esquema y datos) fuera de
# Cloudflare. Es la red que sigue ahí cuando Time Travel ya no llega (sus 30 días) o cuando la
# base entera desaparece. El runbook está en docs/operations/copia-de-seguridad-de-la-d1.md.
#
# Uso:  ./scripts/backup-d1.sh [etiqueta]
#       ./scripts/backup-d1.sh before-0013     → prod-before-0013-2026-09-20T101500Z.sql
#
# La etiqueta es opcional y sirve para marcar por qué se hizo la copia; la convención es
# `before-<migración>` antes de aplicar una migración en producción.

set -euo pipefail

readonly DATABASE_NAME='gymbuddy'
readonly WRANGLER_ENV='production'

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
api_dir="$(dirname "$script_dir")"

label="${1:-}"
# La etiqueta entra en el nombre del fichero: se acota para que no pueda salirse del directorio
# de copias ni construir una ruta que no se vea venir.
if [[ -n "$label" && ! "$label" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "error: la etiqueta solo admite minúsculas, dígitos y guiones (recibido: '$label')" >&2
  exit 1
fi

backups_dir="$api_dir/.wrangler/backups"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
output="$backups_dir/prod-${label:+$label-}$stamp.sql"

mkdir -p "$backups_dir"

cd "$api_dir"
echo "Exportando la D1 '$DATABASE_NAME' de $WRANGLER_ENV a $output"
# -y: el export remoto pide confirmación por teclado y este script se ejecuta también encadenado
# a otros comandos, justo antes de una migración.
pnpm exec wrangler d1 export "$DATABASE_NAME" --remote --env "$WRANGLER_ENV" -y --output "$output"

if [[ ! -s "$output" ]]; then
  echo "error: el volcado salió vacío; la copia NO es válida" >&2
  exit 1
fi

# Una copia incompleta que parece buena es peor que un error: se comprueba que el volcado declara
# todas las tablas del esquema. La lista se deriva del propio esquema Drizzle (que es la única
# fuente) en lugar de repetirse aquí, así que una tabla nueva se vigila sin tocar este script.
schema_tables="$(tr '\n' ' ' < src/db/schema.ts | grep -oE "sqliteTable\( *'[a-z_]+'" | grep -oE "'[a-z_]+'" | tr -d "'" | sort -u)"
missing=''
for table in $schema_tables; do
  # El volcado reproduce el DDL tal como lo guarda SQLite, y no todas las tablas se crearon igual:
  # las que reconstruyó a mano una migración (set_entry en la 0008, auth_challenge) vuelven con
  # `IF NOT EXISTS` y comillas dobles, mientras que las generadas por drizzle-kit usan acentos
  # graves. Se admiten las dos formas.
  pattern='CREATE TABLE (IF NOT EXISTS )?[`"]'"$table"'[`"]'
  if ! grep -qE "$pattern" "$output"; then
    missing="$missing $table"
  fi
done

if [[ -n "$missing" ]]; then
  echo "error: el volcado no declara estas tablas del esquema:$missing" >&2
  echo "       el fichero se deja en $output para mirarlo, pero NO sirve como copia" >&2
  exit 1
fi

table_count="$(echo "$schema_tables" | wc -l | tr -d ' ')"
insert_count="$(grep -c '^INSERT INTO' "$output" || true)"
size="$(du -h "$output" | cut -f1 | tr -d ' ')"
echo "Copia lista: $output ($size, $table_count tablas, $insert_count sentencias INSERT)"
