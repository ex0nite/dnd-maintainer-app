#!/bin/bash
# Local rehearsal of the QNAP stack in an ISOLATED compose project (own network, own volumes, port 8081).
# It never touches the `supabase start` development stack.
#
#   deploy/qnap/localtest.sh up|down|ps|logs [service]
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR="${LOCALTEST_DIR:-$(pwd)/.localtest-stack}"   # git-ignored
export COMPOSE_PROJECT_NAME=dndqt EDGE_NETWORK=dndqt-edge GATEWAY_PORT=8081 SITE_DIR="$DIR/site"
COMPOSE=(docker compose --env-file "$DIR/.env" -f deploy/qnap/docker-compose.yml --profile admin)

case "${1:-}" in
  up)
    mkdir -p "$DIR/site"
    [ -f "$DIR/site/index.html" ] || echo '<!doctype html><title>ok</title>' > "$DIR/site/index.html"
    [ -f "$DIR/.env" ] || node deploy/qnap/gen-secrets.mjs "$DIR/.env" http://localhost:8081 table
    node deploy/qnap/check-secrets.mjs "$DIR/.env"
    [ -f deploy/qnap/account-admin/server.mjs ] || bash deploy/qnap/build-account-admin.sh
    "${COMPOSE[@]}" up -d db
    bash deploy/qnap/wait-db.sh "$DIR/.env"
    "${COMPOSE[@]}" up -d --build
    bash deploy/qnap/apply-migrations.sh "$DIR/.env"
    ;;
  down) "${COMPOSE[@]}" down -v; rm -rf "$DIR" ;;
  ps) "${COMPOSE[@]}" ps ;;
  logs) shift; "${COMPOSE[@]}" logs --tail=40 "$@" ;;
  *) echo "usage: localtest.sh up|down|ps|logs [service]"; exit 2 ;;
esac
