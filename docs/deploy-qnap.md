# Deploying on the QNAP (epic 7)

The lightweight Supabase stack, the built front and (optionally) `account-admin` run in Docker on the QNAP, behind the
existing `nginx-proxy-manager` (NPM). Decisions: D-20 (self-hosted, with a load test), D-21 (only 80 and 443), D-22 (the
MCP stays on the DM's computer), D-23 (no backup). Architecture: AD-9, AD-10, AD-21.

Nothing in this folder holds a secret. Never put a host name, an address or a key in the repository or in a chat.

## What runs

| Service         | Image (pinned by digest)   | Memory cap | Published port                         |
| --------------- | -------------------------- | ---------- | -------------------------------------- |
| `db`            | supabase/postgres 17.11    | 512 MB     | none                                   |
| `auth`          | supabase/gotrue v2.197.0   | 128 MB     | none                                   |
| `rest`          | postgrest v14.8            | 128 MB     | none                                   |
| `storage`       | supabase/storage-api 1.84  | 192 MB     | none                                   |
| `gateway`       | nginx 1.27-alpine          | 48 MB      | `GATEWAY_BIND:GATEWAY_PORT` (loopback) |
| `account-admin` | node 22-alpine, one bundle | 96 MB      | none (profile `admin`)                 |

Not started, by design: Studio, realtime, pg-meta, analytics, vector, edge functions, imgproxy, Kong.
The `internal` network has no route to the Internet. The only way in is the `gateway` container, reached by NPM over the
`dnd-edge` network.

## 1. Install (story 7.2)

On the QNAP the Docker binaries are not in the default `PATH`:
`export PATH=$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin`.

1. **Copy** `deploy/qnap/`, `supabase/migrations/` and the built front to a folder of the data volume (for example under
   `/share/Container/dnd/`). Keep the layout (`deploy/qnap` and `supabase/migrations` side by side: the scripts `cd` to the
   folder that holds both). All commands below run from that folder. Files copied from Windows may carry share ACLs the containers cannot read: run
   `setfacl -R -m o::rX <folder>` and `tr -d '\r'` the shell scripts (Windows line endings break them).
2. **Generate the secrets**, outside the copied folder, with the same script the check uses (no Node on the QNAP, so use a
   container):

   ```bash
   mkdir -p ../dnd-secrets
   docker run --rm -v "$PWD/..:/p" -w /p/dnd node:22-alpine \
     node deploy/qnap/gen-secrets.mjs /p/dnd-secrets/.env https://<public-host> table
   docker run --rm -v "$PWD/..:/p" -w /p/dnd node:22-alpine node deploy/qnap/check-secrets.mjs /p/dnd-secrets/.env
   ```

   It writes the token-signing secret, the database password and the two keys (publishable and administration) with
   `openssl`-grade randomness, mode 600, and refuses to overwrite. `check-secrets.mjs` **fails** when a demonstration
   value is found (known JWT secrets, the demo keys, a weak or short database password, plain `http` outside localhost,
   keys not signed by this `JWT_SECRET`). Run it before every start, from a shell where none of these variables is exported (compose would let the shell win over the
   file; the check refuses that case). Changing `JWT_SECRET` later signs everybody out and
   invalidates the keys baked into a built front.

3. **Start the database first** and wait for it (the first start runs the image's init scripts and is slow on the Celeron:
   about a minute and a half), then the rest:

   ```bash
   export COMPOSE_PROJECT_NAME=dnd
   docker compose --env-file ../dnd-secrets/.env -f deploy/qnap/docker-compose.yml up -d db
   bash deploy/qnap/wait-db.sh ../dnd-secrets/.env   # NOT just "healthy": the health check also answers during init
   docker compose --env-file ../dnd-secrets/.env -f deploy/qnap/docker-compose.yml up -d
   ```

4. **Apply the migrations** to the new database (the `auth` and `storage` schemas must exist first: wait until `auth` and
   `storage` are `Up`):

   ```bash
   bash deploy/qnap/apply-migrations.sh ../dnd-secrets/.env
   ```

   For a database that already holds the DM's data use the single-transaction cutover instead (`docs/cutover.md`).

5. **Sign-in attempt lock** is already on (`GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_*` in the compose file). The
   migration must be applied first, otherwise every sign-in fails (fail closed).
6. **Create the DM account** once (`SETUP.md`, "Create the DM account"), from a terminal, typing the password.
7. **account-admin** (needed by the Players screen): on the development machine `bash deploy/qnap/build-account-admin.sh`,
   copy `deploy/qnap/account-admin/server.mjs` to the QNAP, then
   `docker compose --env-file ../dnd-secrets/.env -f deploy/qnap/docker-compose.yml --profile admin up -d --build account-admin`.
8. **Front**: build with `VITE_SUPABASE_URL=https://<public-host>` (same origin: the gateway routes `/auth/v1`, `/rest/v1`,
   `/storage/v1`) and `VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>` (public by design), then publish it with `bash deploy/qnap/publish-site.sh ../dnd-secrets/.env <folder holding the built front>` (it fills a Docker volume: a bind-mounted folder of a QNAP share is unreadable by the `nginx` user because of the share ACLs).

## 2. Network and HTTPS (story 7.3)

- Only the existing reverse proxy is published on 80 and 443. Never the proxy's admin port, QTS, SSH, NFS, SMB or
  portmap (D-21). The stack publishes nothing but the gateway, bound to loopback.
- Connect NPM to the edge network once: `docker network connect dnd-edge nginx-proxy-manager`. (It is lost if NPM's
  container is recreated: repeat it. This touches the owner's NPM, so it is done only with their go.)
- In NPM, a proxy host for the dedicated sub-domain: scheme `http`, forward host `dnd-gateway-1`, port `8080`, Let's
  Encrypt certificate, _Force SSL_, _HTTP/2_. Leave caching off for the whole host (the gateway sets the cache headers itself).
- The gateway sends HSTS (no `includeSubDomains`: the host belongs to a wildcard DynDNS domain), `nosniff`,
  `frame-ancestors 'none'` (and `X-Frame-Options: DENY`), a strict `Referrer-Policy` and the CSP below.
- **Real client address (per-address rate limits).** NPM sets `X-Real-IP` to the address it sees, but stock NPM also trusts
  an incoming `X-Real-IP` from private ranges and from CDN ranges (Cloudflare, CloudFront) it downloads. **Checked on NPM 2.14.0: it does.** (`real_ip_header X-Real-IP` and `real_ip_recursive on` in its `nginx.conf`, with the CDN ranges of `conf.d/include/ip_ranges.conf`.) A client that reaches NPM through one of those networks (a CloudFront distribution pointed at the host, for instance) can pick its own address and so dodge the per-address limits. The per-pseudo lock (`login_attempt_lock`) is not affected and is the main brake; to close the gap, empty `ip_ranges.conf` in the NPM container (mounted file) or accept this residual risk knowingly. Prove the behaviour with the two-client test below If NPM's port 443 reaches it through
  docker-proxy every client would look like a 172.x address: the test catches that too. The gateway trusts that header only from the `dnd-edge` subnet (fixed `172.29.77.0/24` in the compose file and in
  `nginx.conf`) and **rewrites** `X-Real-IP` and
  `X-Forwarded-For` (never appends). GoTrue reads `X-Real-IP` (`GOTRUE_RATE_LIMIT_HEADER`) and `account-admin` reads the same
  header (`TRUSTED_IP_HEADER`). To prove it, once published: from machine A send more than `sign_in_sign_ups` (30) failed
  sign-ins a minute, each with a different forged `X-Real-IP`: A is still limited (429); from machine B (another
  connection, for example a phone on mobile data) a sign-in still works.
- **Scan from outside** (a phone on mobile data, or an external scanner): only 80 and 443 answer; the database port
  (5432), Studio and the metadata port are not reachable (they are neither published nor started).

**Verified on the real install (2026-11-18).** Through the public name: `deploy/qnap/smoke.mjs` passes in full (headers,
OpenAPI refused, sign-up refused, admin refused, RLS-empty tables, storage); 40 failed sign-ins in a row, each with a
different forged `X-Real-IP` and `X-Forwarded-For`, give `400` x33 then `429`: the limit follows the real address; a TCP
scan of the public address shows 80 and 443 open and nothing else (SSH, proxy admin, database, gateway, API ports
closed). A phone on mobile data signed in while the test machine was rate-limited (the limit is per address). The CDN-range gap of NPM is a known, accepted residual risk (owner decision, 2026-11-18). The router must forward TCP 80 and 443 only, to a fixed LAN address of the NAS. Test from mobile data: a client
on the same LAN may not reach the public address (no hairpin NAT on some boxes).

## 3. Content-Security-Policy (story 7.4)

`gateway/security-headers.conf.template` carries the policy of AD-21 (no `unsafe-inline`, no `unsafe-eval`):

- the theme bootstrap is the static file `public/theme-init.js`, not an inline script;
- `sonner` injects one `<style>` at import: its SHA-256 is in `style-src`. After a `sonner` upgrade, if the unit test
  `deploy/qnap/csp.test.ts` fails, run `node scripts/sonner-csp-hash.mjs` and put the new value in the template;
- zod is switched to `jitless` (`src/lib/zod-config.ts`): its `new Function` probe is a CSP violation otherwise;
- Chromium reports the empty `<style>` that `sonner` appends before filling it (`style-src-elem`, harmless: the sheet is
  applied, which `e2e/fixtures.ts` checks). Expect that one console line.
- **Roll-out.** First set `CSP_HEADER_NAME=Content-Security-Policy-Report-Only` in the env file, walk the journeys of the
  player and of the DM on the test environment with the browser console open, then remove the variable (blocking mode) and
  restart `gateway`. Every Playwright test already runs under the blocking policy and fails on a violation.

**Known limit.** Secrets are passed to the containers as environment variables, so `docker compose config` and
`docker inspect` show them to anyone who can run Docker on the QNAP (an administrator, who owns the data anyway). Docker
`secrets:` files would hide them from `inspect`; judged not worth the complexity here.

## 4. Cutover and opening (story 7.5)

The app is never opened before it is locked (AD-13): stack up and **not published** (no NPM proxy host yet) → copy of the
data (`pg_dump`, mandatory, see `docs/cutover.md`) → migrations in one transaction → DM account → front published to
`publish-site.sh` → MCP reconnected (`DND_DM_PSEUDO`/`DND_DM_PASSWORD`, tools checked) → **only then** the NPM proxy host.

**There is no backup (D-23).** Only the RAID 5 protects the data, against a disk failure, not against a deletion, a
corruption or the loss of the QNAP. The owner confirms this again before the opening.

## 5. Operating notes

- Memory: `docs/qnap-load-test.md` holds the measure. The stack is capped per container, so a leak cannot take the QNAP down.
- Logs rotate (5 MB x 2 per container). `account-admin` logs method, path, status and duration, nothing else.
- Update the app: **apply the new migrations first** (`deploy/qnap/apply-migrations.sh`), then publish the front (`publish-site.sh`),
  then rebuild the MCP (`npm run build` in `dnd-maintainer-mcp`). The front and the MCP read columns the migration adds (for example
  `campaigns.ruleset`, story 9.1): published or built before the migration, they fail on almost every request.
- Update an image: change the digest in the compose file after reading its release notes, rebuild nothing else.
- Orphan authentication users (a creation that failed half-way): `account-admin` logs the id on stderr; delete by hand.
- Local rehearsal on a development machine, without touching `supabase start`: `deploy/qnap/localtest.sh up|down|ps|logs`
  (own compose project, own volumes, port 8081).
