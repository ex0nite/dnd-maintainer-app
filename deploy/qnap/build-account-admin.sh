#!/bin/bash
# Bundles the account-admin service into one file for its container (story 7.2).
# Run from the repository root, then `docker compose --profile admin build account-admin`.
set -euo pipefail
cd "$(dirname "$0")/../.."
npx esbuild services/account-admin/src/server.ts \
  --bundle --platform=node --target=node22 --format=esm \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --outfile=deploy/qnap/account-admin/server.mjs
echo "Built deploy/qnap/account-admin/server.mjs"
