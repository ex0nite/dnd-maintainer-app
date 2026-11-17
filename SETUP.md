# D&D Keeper - Setup Guide

## Prerequisites

- Docker Desktop (running, with WSL2 integration enabled)
- WSL2/Ubuntu with Supabase CLI installed
- Node.js 18+ (in WSL2)

## Quick Start

All commands run from **WSL2/Ubuntu**. Navigate to the project folder:

```bash
cd /path/to/dnd-maintainer
```

### 1. Install Node dependencies

```bash
npm install
```

### 2. Start Supabase (local)

```bash
supabase start
```

This pulls Docker images on first run (may take a few minutes). Once running, it prints out your local API URL and keys. The defaults in `.env.local` should match, but verify:

- API URL: `http://127.0.0.1:54321`
- Anon key: the `anon key` value from `supabase start` output

If the anon key differs, update `.env.local`.

### 3. Apply migrations and seed data

Migrations run automatically with `supabase start`. To re-run or reset:

```bash
npx supabase db reset
```

This drops and recreates the database, applies all migrations, and runs `seed.sql` (sample "Lost Mines of Phandelver" campaign with characters).

### 4. Start the dev server

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

## Create the DM account (once)

The app is closed: there is no sign-up. The single DM account is created from a terminal, by the owner, with the shared
account module (`services/account-admin/`, AD-2 / AD-15). Secrets come from the environment only, never from the repo.

```bash
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY   # paste the admin key, nothing is echoed
SUPABASE_URL=<api url> ACCOUNT_DOMAIN=<label> npm run bootstrap:dm -- <pseudo>
```

The password (12 characters minimum) is typed twice in the terminal and is never stored. The pseudo must match
`^[a-z0-9_-]{3,20}$`. The authentication address is derived as `<pseudo>@<ACCOUNT_DOMAIN>.invalid` and is never shown or
used as a mailbox. A second DM is refused by the database. Never put the admin key on the command line (shell history). `ACCOUNT_DOMAIN` defaults to `table`.

## Player accounts: the account-admin service

Players never sign up. The DM creates their account from the **Players** screen of the app (pseudo + campaign): a
temporary password is generated, shown once, and the player must choose their own on first sign-in. The screen calls
the `account-admin` service (`services/account-admin/`, AD-2), the only component that holds the administration key.

```bash
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL=<internal api url> SUPABASE_PUBLISHABLE_KEY=<publishable key> ACCOUNT_DOMAIN=<label> \
  TRUSTED_IP_HEADER=x-real-ip npm run account-admin      # listens on 127.0.0.1:8787
```

- Reached by the app at `/admin-api/` (the Vite dev server proxies it to port 8787; in production the reverse proxy does).
- Every call needs the DM's access token. The service refuses `service_role`/`anon` tokens, asks the authentication server
  to validate the token and its session, then re-reads `profiles` (role `dm`, not archived). Nothing is trusted from the
  token content. Calls are throttled per address (before any network call) and per DM.
- `TRUSTED_IP_HEADER` must name a header the reverse proxy **overwrites** with the real client address; if it is unset
  the socket address is used (all traffic then looks like the proxy). Never let the client choose that header.
- The administration key is read from the environment only: it is not in the repository, not in the front bundle and
  not in the logs (the service logs method, path, status and duration, nothing else).
- **First sign-in:** the player lands on the password page and can reach nothing else (the front redirects, and the
  database refuses every data read: `is_active_user()` is false while `must_change_password` is true). The password
  must have 12 characters at least (the authentication server's minimum, stricter than the 10 planned in AD-11).
  When the password really changes, a trigger on `auth.users` lowers `must_change_password`; the player cannot touch
  that flag, and the temporary password stops working at once. Any signed-in user can change their password later
  from the sidebar.
- The sign-in address cannot be changed by users: a trigger on `auth.users` refuses it (the authentication server has
  no switch for this, see `docs/auth-spike.md`). Delete accounts with a hard delete only.
- If a future authentication-server upgrade ever needs to rewrite `auth.users.email`, disable the guard for that
  maintenance only (`alter table auth.users disable trigger refuse_address_change;`, as the database owner) and enable
  it again right after.
- **Password reset (FR4):** the Players screen lists the accounts (status: active, temporary password, archived) and
  gives each non-archived player a "Reset password" action. The service raises `must_change_password` and
  `password_reset_pending` first (so the account reads nothing from that moment), changes the password (the trigger
  keeps the flag up and consumes the marker), then ends every session of the player through
  `public.revoke_user_sessions` (callable by `service_role` only). The DM account is never a valid target. An access
  token issued before the reset still passes the authentication server's signature check for up to an hour, but the
  database refuses its data reads at once (the flag).
- **Members, archiving (FR5, FR6, D-30):** from the same screen the DM adds a player to other campaigns and removes
  them from one (straight through the database, policy `campaign_members_dm_all`; a player cannot add anyone).
  _Archive_ calls `public.archive_player` (one transaction: `archived_at`, sessions ended, the player's characters
  disabled and marked `archived_with_owner`) and then bans the authentication account; the policy `access_active`
  cuts data access at once, even with a token still valid. _Reactivate_ clears the stamp, re-enables only the
  characters marked `archived_with_owner` (one disabled by hand stays disabled), then lifts the ban. Both are
  idempotent: if the ban step fails the service answers 500 and the DM simply retries. The DM account is refused.
- Free sign-up stays closed (`enable_signup = false`): calling the sign-up API with the public key is refused.
- Deployment: reach the service only over the internal container network (no published port). If it listens on a
  non-loopback `HOST`, the service refuses to start without `TRUSTED_IP_HEADER`, because otherwise every visitor would
  share the proxy's address and 30 junk requests a minute would lock the DM out of the screen.
- If a creation fails half-way and the automatic cleanup also fails, the service logs the id of the leftover
  authentication user (stderr): delete it by hand before retrying the pseudo.
- Health check without authentication: `GET /admin-api/health`.

## Signing in

Open the app: you are sent to the sign-in page. Type the pseudo and password of the account (the derived address is never shown). The app must use the same `ACCOUNT_DOMAIN` as the account creation: set `VITE_ACCOUNT_DOMAIN` in `.env.local` if it is not `table`. The MCP server signs in the same way with `DND_DM_PSEUDO` / `DND_DM_PASSWORD` (see its README).

## Supabase Dashboard

Access the local Supabase dashboard at **http://127.0.0.1:54323** to browse tables, run SQL, and manage data directly.

## Project Structure

```
dnd-maintainer/
  src/
    components/       # Shared UI components
      ui/             # Button, Card, Input, Modal, etc.
      Layout.tsx      # App shell with sidebar
      Sidebar.tsx     # Navigation sidebar
    hooks/            # TanStack Query data hooks
    lib/              # Supabase client, query client, D&D helpers
    pages/            # Route pages
    types/            # TypeScript type definitions
  supabase/
    config.toml       # Local Supabase configuration
    migrations/       # Database schema migrations
    seed.sql          # Sample data
```

## Useful Commands

```bash
npx supabase status          # Check running services
npx supabase stop            # Stop all containers
npx supabase db reset        # Reset DB + re-seed
npx supabase migration new   # Create a new migration
npm run build                # Production build
```
