#!/usr/bin/env bash
# End-to-end test of the production cutover (AD-13, story 1.8), on a LOCAL Supabase database:
#   1. rebuild the database as it was before the lock-down (schema up to 20260607000000) and fill it
#      with realistic data (supabase/cutover/fixture-pre-lock.sql);
#   2. a cutover that FAILS halfway must change nothing (all or nothing);
#   3. the real cutover applies every pending migration in one transaction;
#   4. every fixture value is still there, in its new home (assert-post-cutover.sql);
#   5. running it again finds nothing to do.
#
# Never point it at a real project: it runs `supabase db reset --local`, which wipes the local database.
#   bash scripts/cutover/test-cutover.sh
# Environment: CUTOVER_TEST_CONTAINER (optional, see below). Everything else from the environment is ignored.
set -euo pipefail

cd "$(dirname "$0")/../.."
# SAFETY: this test wipes and rebuilds the database (`supabase db reset --local`). It must never reach a real
# project, so DB_URL and PSQL from the environment are IGNORED: only the local database is targeted. To go through
# a docker container instead of a local psql, set CUTOVER_TEST_CONTAINER=<local supabase db container name>.
unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE PGSERVICE
export DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if [ -n "${CUTOVER_TEST_CONTAINER:-}" ]; then
  case "$CUTOVER_TEST_CONTAINER" in
    supabase_db_*) ;;
    *) echo "CUTOVER_TEST_CONTAINER must be a local supabase_db_* container" >&2; exit 1 ;;
  esac
  export PSQL="docker exec -i $CUTOVER_TEST_CONTAINER psql -U postgres"
else
  unset PSQL
fi
run_psql() {
  if [ -n "${PSQL:-}" ]; then
    # shellcheck disable=SC2086
    $PSQL "$@"
  else
    psql "$DB_URL" "$@"
  fi
}

BEFORE_LOCK=20260607000000

echo "== 1. database as before the lock-down, with data"
npx supabase db reset --local --version "$BEFORE_LOCK" > /dev/null
run_psql -v ON_ERROR_STOP=1 -q -f - < supabase/cutover/fixture-pre-lock.sql

echo "== 2. a cutover that fails halfway changes nothing"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp supabase/migrations/*.sql "$tmp"/
printf 'select 1/0; -- deliberate failure after every real migration\n' > "$tmp/99999999999999_deliberate_failure.sql"
if MIGRATIONS_DIR="$tmp" bash scripts/cutover/apply-in-one-transaction.sh; then
  echo "FAIL: the failing cutover reported success" >&2
  exit 1
fi
left="$(run_psql -At -c "select (to_regclass('public.profiles') is not null)::int + (to_regclass('public.campaign_dm') is not null)::int + (to_regclass('public.character_private') is not null)::int + (not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaigns' and column_name = 'dm_notes'))::int" | tr -d '')"
if [ "$left" != "0" ]; then
  echo "FAIL: the failed cutover left a partial state (check value: $left)" >&2
  exit 1
fi
newer="$(run_psql -At -c "select count(*) from supabase_migrations.schema_migrations where version > '$BEFORE_LOCK'" | tr -d '\r')"
if [ "$newer" != "0" ]; then
  echo "FAIL: the failed cutover recorded $newer migration(s)" >&2
  exit 1
fi
echo "   rolled back cleanly"

echo "== 3. the real cutover"
bash scripts/cutover/apply-in-one-transaction.sh

echo "== 4. no data lost"
run_psql -v ON_ERROR_STOP=1 -At -q -f - < supabase/cutover/assert-post-cutover.sql

echo "== 5. nothing left to do"
bash scripts/cutover/apply-in-one-transaction.sh

echo "Cutover test passed."
