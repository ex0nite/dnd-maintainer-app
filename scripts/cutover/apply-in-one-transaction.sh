#!/usr/bin/env bash
# Apply every pending migration in ONE transaction (AD-13, story 1.8).
#
# `supabase db push` applies each migration on its own: a failure halfway leaves a half-locked, half-migrated
# database. The production cutover must be all or nothing, so this script concatenates the pending migrations
# (the ones not yet in supabase_migrations.schema_migrations) and runs them with psql --single-transaction
# and ON_ERROR_STOP: the first error rolls everything back.
#
# Some migrations carry their own `begin;` / `commit;` (needed when the CLI applies them one by one, for
# `lock table`). Inside the single transaction those lines would end it early, so they are stripped here, and the
# script REFUSES any other transaction-control statement left in a migration (commit work, end, rollback,
# start transaction, a trailing comment after commit...): such a line could commit half of the cutover.
#
# The three tables whose columns are moved are locked first (exclusive), with a lock timeout: no write can slip
# between a copy and a `drop column`. Stop the app and the MCP server before running it (docs/cutover.md).
#
# Usage (the password never goes on the command line: use PGPASSWORD or ~/.pgpass):
#   read -rs PGPASSWORD; export PGPASSWORD
#   DB_URL='postgresql://postgres@<host>:5432/postgres' bash scripts/cutover/apply-in-one-transaction.sh
# Environment:
#   DB_URL          connection string (default: the local Supabase database)
#   MIGRATIONS_DIR  folder of *.sql migrations (default: <repo>/supabase/migrations)
#   PSQL            command that runs psql against the target; tests use it to go through
#                   `docker exec -i <db container> psql -U postgres`. Default: psql "$DB_URL"
#   DRY_RUN=1       print the combined SQL instead of running it
set -euo pipefail

cd "$(dirname "$0")/../.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"

# No eval: arguments reach psql untouched (a password with $ or ` can not be reinterpreted).
run_psql() {
  if [ -n "${PSQL:-}" ]; then
    # Custom command (tests): word-split on purpose, it is a trusted, developer-supplied prefix.
    # shellcheck disable=SC2086
    $PSQL "$@"
  else
    psql "$DB_URL" "$@"
  fi
}

[ -d "$MIGRATIONS_DIR" ] || { echo "Migrations folder not found: $MIGRATIONS_DIR" >&2; exit 1; }

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob
[ "${#files[@]}" -gt 0 ] || { echo "No migration found in $MIGRATIONS_DIR" >&2; exit 1; }

applied="$(run_psql -At -c "select version from supabase_migrations.schema_migrations" | tr -d '\r')"

sql="$(mktemp)"
trap 'rm -f "$sql"' EXIT

pending=0
body="$(mktemp)"
trap 'rm -f "$sql" "$body"' EXIT
while IFS= read -r file; do
  base="$(basename "$file" .sql)"
  if ! [[ "$base" =~ ^[0-9]+_[A-Za-z0-9_]+$ ]]; then
    echo "Refusing migration with an unexpected name: $base" >&2
    exit 1
  fi
  version="${base%%_*}"
  name="${base#*_}"
  if printf '%s\n' "$applied" | grep -qx "$version"; then
    continue
  fi
  pending=$((pending + 1))
  {
    printf -- '-- ==== %s ====\n' "$base"
    # Drop the migration's own simple transaction control (alone on its line, optional trailing comment).
    tr -d '\r' < "$file" | grep -Eiv '^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*(--.*)?$' || true
    printf '\ninsert into supabase_migrations.schema_migrations (version, name) values (%s, %s);\n\n' \
      "'$version'" "'$name'"
  } >> "$body"
done < <(printf '%s\n' "${files[@]}" | sort)

if [ "$pending" -eq 0 ]; then
  echo "No pending migration."
  exit 0
fi

# Any transaction control left (outside plpgsql blocks it would be a real statement; inside $$ ... $$ a plpgsql
# `begin` has no semicolon right after it) could end our transaction early: refuse.
if grep -Eiq '^[[:space:]]*(commit|rollback|abort|start[[:space:]]+transaction|begin[[:space:]]+(work|transaction))\b[^;]*;' "$body"; then
  echo "A migration contains transaction control that the cutover can not strip:" >&2
  grep -Ein '^[[:space:]]*(commit|rollback|abort|start[[:space:]]+transaction|begin[[:space:]]+(work|transaction))\b[^;]*;' "$body" >&2
  exit 1
fi

{
  printf '%s\n' "set lock_timeout = '10s';"
  printf '%s\n' "lock table public.campaigns, public.characters, public.sessions in access exclusive mode;"
  cat "$body"
} > "$sql"

if [ "${DRY_RUN:-}" = "1" ]; then
  cat "$sql"
  exit 0
fi

echo "Applying $pending migration(s) in one transaction..."
run_psql -v ON_ERROR_STOP=1 --single-transaction -q -f - < "$sql"
echo "Done: $pending migration(s) applied."
