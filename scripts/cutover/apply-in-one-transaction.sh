#!/usr/bin/env bash
# Apply every pending migration in ONE transaction (AD-13, story 1.8).
#
# `supabase db push` applies each migration on its own: a failure halfway leaves a half-locked, half-migrated
# database. The production cutover must be all or nothing, so this script concatenates the pending migrations
# (the ones not yet in supabase_migrations.schema_migrations) and runs them with psql --single-transaction
# and ON_ERROR_STOP: the first error rolls everything back.
#
# Some migrations carry their own `begin;` / `commit;` (needed when the CLI applies them one by one, for
# `lock table`). Inside the single transaction those lines would end it early, so they are stripped here.
#
# Usage:
#   DB_URL=postgresql://postgres:<password>@<host>:5432/postgres bash scripts/cutover/apply-in-one-transaction.sh
# Environment:
#   DB_URL          connection string (default: the local Supabase database). Never put a password in the repo.
#   MIGRATIONS_DIR  folder of *.sql migrations (default: supabase/migrations)
#   PSQL            command that runs psql against the target (default: psql "$DB_URL"); tests use it to go
#                   through `docker exec -i <db container> psql -U postgres`.
#   DRY_RUN=1       print the combined SQL instead of running it
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"
PSQL="${PSQL:-psql \"$DB_URL\"}"

run_psql() { eval "$PSQL \"\$@\""; }

applied="$(run_psql -At -c "select version from supabase_migrations.schema_migrations" | tr -d '\r')"

sql="$(mktemp)"
trap 'rm -f "$sql"' EXIT

pending=0
{
  for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    base="$(basename "$file" .sql)"
    version="${base%%_*}"
    name="${base#*_}"
    if printf '%s\n' "$applied" | grep -qx "$version"; then
      continue
    fi
    pending=$((pending + 1))
    printf -- '-- ==== %s ====\n' "$base"
    # Drop the migration's own transaction control (case-insensitive, alone on its line).
    grep -Eiv '^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$' "$file" | tr -d '\r'
    printf '\ninsert into supabase_migrations.schema_migrations (version, name) values (%s, %s);\n\n' \
      "'$version'" "'$name'"
  done
} > "$sql"

if [ "$pending" -eq 0 ]; then
  echo "No pending migration."
  exit 0
fi

if [ "${DRY_RUN:-}" = "1" ]; then
  cat "$sql"
  exit 0
fi

echo "Applying $pending migration(s) in one transaction..."
run_psql -v ON_ERROR_STOP=1 --single-transaction -q -f - < "$sql"
echo "Done: $pending migration(s) applied."
