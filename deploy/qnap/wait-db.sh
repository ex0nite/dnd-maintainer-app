#!/bin/bash
# Waits until the database really accepts password connections on the network, as the service roles will use them.
#
# `pg_isready` (the container health check) also answers while the image runs its one-time init scripts on a temporary
# server, which is when the auth and storage services must NOT start yet: they would fail on their first connection.
# Here we connect to the container's own network address as `supabase_auth_admin` with the generated password: it works
# only once the init scripts (including the password one) are done and the final server is up.
#
#   deploy/qnap/wait-db.sh <env-file> [timeout-s]
#
# Run it from the repository root, with the same COMPOSE_PROJECT_NAME export as the compose commands.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE="${1:?usage: wait-db.sh <env-file> [timeout-s]}"
TIMEOUT="${2:-300}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/qnap/docker-compose.yml)

end=$(( $(date +%s) + TIMEOUT ))
until "${COMPOSE[@]}" exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$(hostname -i)" -U supabase_auth_admin -d postgres -Atc "select 1"' >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$end" ]; then
    echo "The database did not become ready within ${TIMEOUT}s" >&2
    exit 1
  fi
  sleep 3
done
echo "database ready"
