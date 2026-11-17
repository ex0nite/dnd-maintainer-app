#!/bin/bash
# Applies the app migrations to a NEW database of the stack, one transaction per file, and records them in
# supabase_migrations.schema_migrations so `supabase db push` later sees them.
#
# For an EXISTING database that holds data (the cutover) use scripts/cutover/apply-in-one-transaction.sh instead.
#
#   deploy/qnap/apply-migrations.sh <env-file>
#
# The `auth` and `storage` schemas are created by the auth and storage containers when they start, so start the stack
# first and wait until both are healthy. The password never appears on a command line: psql runs INSIDE the db container.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE="${1:?usage: apply-migrations.sh <env-file>}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/qnap/docker-compose.yml)
PSQL=("${COMPOSE[@]}" exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q)

# The auth and storage containers create their schemas on first start: wait for them (up to 3 minutes).
for _ in $(seq 1 60); do
  ready="$("${PSQL[@]}" -At -c "select to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null" 2>/dev/null || true)"
  [ "$ready" = "t" ] && break
  sleep 3
done
[ "$ready" = "t" ] || { echo "auth/storage schemas not created: are the auth and storage containers running?" >&2; exit 1; }

"${PSQL[@]}" -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);" >/dev/null

for f in supabase/migrations/*.sql; do
  base="$(basename "$f")"
  version="${base%%_*}"
  name="${base#*_}"; name="${name%.sql}"
  already="$("${PSQL[@]}" -At -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")"
  if [ -n "$already" ]; then
    echo "skip   $base"
    continue
  fi
  {
    echo "begin;"
    # Some migrations carry their own begin/commit (for the CLI); inside ours they would end the transaction early.
    tr -d '\r' < "$f" | grep -Eiv '^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*(--.*)?$' || true
    echo
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"
    echo "commit;"
  } | "${PSQL[@]}" >/dev/null
  echo "applied $base"
done
