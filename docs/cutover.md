# Production cutover (AD-13)

The app must never be reachable while it is half-locked. The lock-down (migrations `20261116…`) is therefore applied
**in one transaction**, on the database that already holds the DM's real data.

## Procedure

1. **Stop everything that writes**: the front (not published), the MCP server, any open session of the app. The script
   locks `campaigns`, `characters` and `sessions` for the duration (10 s lock timeout), but a stray write just before it
   would be lost with the old columns.
2. **Take a copy of the data (mandatory).** There is no backup system (D-23), only the RAID, and the cutover drops
   columns: it can not be undone once committed. Take a `pg_dump` by hand and keep it until the new state is checked.

   ```bash
   read -rs PGPASSWORD; export PGPASSWORD   # the password is typed, nothing is echoed or stored in the history
   pg_dump -Fc -h <host> -U postgres -d postgres -f dnd-before-cutover.dump
   ```

   Restore it with `pg_restore` into an empty database if anything goes wrong.

3. **Read what will be applied**, then apply it in one transaction:

   ```bash
   DB_URL='postgresql://postgres@<host>:5432/postgres' DRY_RUN=1 bash scripts/cutover/apply-in-one-transaction.sh | less
   DB_URL='postgresql://postgres@<host>:5432/postgres' bash scripts/cutover/apply-in-one-transaction.sh
   ```

   The first error rolls everything back; nothing is half applied. The script stops if
   `supabase_migrations.schema_migrations` is missing (it must list what the database already has) or if a migration
   holds transaction control it can not strip. It records the applied versions in that table, so `supabase db push`
   later sees them. Never put the password in the URL (it would show in `ps` and in the shell history).

4. Create the DM account (`SETUP.md`, "Create the DM account"), then restart the MCP server with `DND_DM_PSEUDO` and
   `DND_DM_PASSWORD`: its tools work again.
5. Check what the DM sees: campaigns, characters (their `player_name` is still free text, no owner yet), sessions (notes,
   loot, XP), notes. Portraits are shown through signed URLs.
6. Only then publish (story 7.5).

## What the test proves (`scripts/cutover/test-cutover.sh`, CI job `cutover`)

It rebuilds the database as it was before the lock-down, fills it with realistic data
(`supabase/cutover/fixture-pre-lock.sql`), then:

- runs a cutover whose last migration fails on purpose: no new table, no dropped column, no recorded version;
- runs the real cutover;
- checks (`supabase/cutover/assert-post-cutover.sql`) that every value moved to its new table without loss: DM notes of
  campaigns, backstory and notes of characters, notes / loot / XP of sessions, portrait paths, free-text `player_name`;
- runs it again: nothing left to do.

The MCP end-to-end suite (`npm run smoke` in `dnd-maintainer-mcp`, private repository) is run by hand against the
migrated database; it passed on the fixture data after the cutover.
