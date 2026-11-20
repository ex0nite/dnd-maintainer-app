#!/bin/bash
# Publishes a built front (the `dist/` folder) to the gateway, through a Docker volume.
#
#   deploy/qnap/publish-site.sh <env-file> <built-front-dir>
#
# Why a volume and not a bind mount of a folder: on a QNAP share the ACLs hide the files from the `nginx` user of the
# gateway (a 500 on every page), whatever the mode bits say. Files written inside a volume by a helper container are
# owned by root and world-readable, whatever the host does. Run it from the repository root with the same
# COMPOSE_PROJECT_NAME / EDGE_NETWORK exports as the compose commands. Safe to repeat: the volume is replaced.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE="${1:?usage: publish-site.sh <env-file> <built-front-dir>}"
SRC="${2:?usage: publish-site.sh <env-file> <built-front-dir>}"
[ -f "$SRC/index.html" ] || { echo "$SRC has no index.html: build the front first" >&2; exit 1; }

COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/qnap/docker-compose.yml)

# Creates the volume (with the labels compose expects) without starting anything.
"${COMPOSE[@]}" up --no-start gateway >/dev/null
VOLUME="${COMPOSE_PROJECT_NAME:-dnd}_site"

tar cf - -C "$SRC" . | docker run --rm -i -v "$VOLUME:/site" node:22-alpine \
  sh -c 'find /site -mindepth 1 -delete && tar xf - -C /site && chown -R 0:0 /site && chmod -R a+rX,go-w /site'
# `up --no-start` may have recreated the gateway container (changed image or configuration): make sure it runs.
"${COMPOSE[@]}" up -d gateway >/dev/null
echo "published $(find "$SRC" -type f | wc -l | tr -d ' ') files to the gateway"
