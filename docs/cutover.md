# Production cutover (AD-13)

The app must never be reachable while it is half-locked. The lock-down (migrations `20261116…`) is therefore applied
**in one transaction**, on the database that already holds the DM's real data.

## Procedure

1. Stop publishing the app (the exposure of story 7.3 is only switched on at the very end, story 7.5).
2. Check that you have a copy of the data you can live without losing: there is no backup system (D-23), only the RAID.
   Export from the app (`/export`) and, if possible, a `pg_dump` taken by hand.
3. Apply every pending migration in one transaction:

   ```bash
   DB_URL='postgresql://postgres:<password>@<host>:5432/postgres' \
     bash scripts/cutover/apply-in-one-transaction.sh
   ```

   The first error rolls everything back; nothing is half applied. `DRY_RUN=1` prints the SQL without running it.
   The script records the versions in `supabase_migrations.schema_migrations`, so `supabase db push` later sees them.

4. Create the DM account (`SETUP.md`, "Create the DM account"), then start the MCP server with `DND_DM_PSEUDO` and
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
