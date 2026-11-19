# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

D&D 5.5e (2024 PHB) Campaign Manager — a React SPA for managing campaigns, characters, sessions, encounters, and DM notes. The target ruleset is the 2024 D&D Player's Handbook. Authentication (GoTrue, closed: no self-signup) is enabled and the `profiles` table exists (story 1.2); the access rules (RLS) are being locked down story by story (see `_bmad-output/planning-artifacts/epics.md`, epic 1).

## Commands

- `npm run dev` — start Vite dev server on port 5173
- `npm run build` — typecheck with `tsc -b` then build with Vite
- `npm run typecheck` — typecheck only, no build (`tsc -b --noEmit`)
- `npm run lint` — ESLint with `--max-warnings 0`
- `npm run preview` — preview production build
- `npx supabase <command>` — always run Supabase CLI via `npx` (not bare `supabase`)
- `npm run supabase:reset` — reset the local Supabase database (runs migrations fresh)
- `npm run start` — start local Supabase, regenerate types, and launch Vite dev server
- `npm run stop` — stop the local Supabase instance
- `npm run supabase:types` — regenerate `src/types/supabase.ts` from current schema. Always run after migration changes and before `typecheck`.
- `npm run test` — run Vitest unit tests
- `npm run test:watch` — run tests in watch mode
- `npm run test:coverage` — run tests with v8 coverage report
- `npm run test:bdd` — run the Cucumber BDD suite (default profile, stays green). See `docs/bdd.md`.
- `npm run test:e2e` — Playwright checks at 360 px (no horizontal scroll) and WCAG AA contrast on the 3 themes in light and dark, against a stubbed backend (`e2e/`). Add each new screen to `PAGES` in `e2e/layout-a11y.e2e.ts`. First run: `npx playwright install chromium`.
- `npm run account-admin` — start the account-admin service (creates player accounts, AD-2; env vars in `SETUP.md`). The Players screen calls it at `/admin-api/` (Vite proxies it to port 8787).
- `npm run test:sql` — run the pgTAP SQL tests in `supabase/tests/database/` against the running local Supabase (see CONVENTION-CODE.md)
- BDD on Windows: `npm run test:bdd` fails locally (esmock/paths). Run it on Linux in Docker instead: `docker run --rm -v <repo>:/src:ro -e VITE_SUPABASE_URL=http://127.0.0.1:54321 -e VITE_SUPABASE_PUBLISHABLE_KEY=x node:24 bash -c "mkdir /work && cd /src && tar --exclude=node_modules --exclude=.git --exclude=dist -cf - . | tar -xf - -C /work && cd /work && npm ci && npm run test:bdd"`
- `npm run test:bdd:future` — run spec-ahead BDD scenarios (`@future` profile, expected to fail). See `docs/bdd.md`.
- `npm run coverage:matrix` — regenerate `docs/coverage-matrix.md` from `src/lib/sources/coverage-matrix.ts`
- `npm run srd:generate` — regenerate the 2014 SRD layer from the committed snapshot (`-- --fetch` refreshes the snapshot from the pinned upstream commit, `-- --check` only compares). See `docs/rules-as-data.md` section 10.
- `npm run uat:checklist` — generate a manual UAT checklist (one row per BDD scenario) from `features/` into `docs/uat-checklist.csv`. Add `-- --format md` (or `both`) for a printable Markdown checklist. See `scripts/gen-uat-checklist.ts`.

### Formatting

Prettier + `eslint --fix` run automatically on every file Claude writes or edits (see `.claude/settings.json` and `scripts/claude-format-on-save.sh`). Don't hand-format — let the hook normalize style. Manual formatting: `npm run format`. CI check: `npm run format:check`.

## Tech Stack

- **React 19** with TypeScript (strict mode), Vite 8, React Router v7
- **Supabase** for backend (Postgres DB, client in `src/lib/supabase.ts`)
- **TanStack React Query v5** for server state (client in `src/lib/query-client.ts`)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no tailwind.config — uses CSS-first config in `src/index.css`)
- **Lucide React** for icons
- **Sonner** for toast notifications
- **react-i18next** for internationalization (config in `src/lib/i18n.ts`)
- **ESLint 9** flat config with `eslint-plugin-i18next` to catch untranslated literal strings
- **Zod** (`zod` v4) for runtime schema validation
- **Vitest** with jsdom and `@testing-library/react` for unit and hook tests
- **Cucumber.js** (with `tsx`) for spec-first BDD acceptance tests in `features/` (see `docs/bdd.md`)

## Architecture

### Path Alias

`@/*` maps to `src/*` (configured in both `tsconfig.json` and `vite.config.ts`). Always use `@/` imports.

### Data Flow

1. **Types**: `src/types/database.ts` — TypeScript interfaces for all domain models (Campaign, Character, Session, Encounter, Note, etc.). These are frontend types; the DB schema lives in `supabase/migrations/`.
2. **Hooks**: `src/hooks/use*.ts` — CQRS-inspired separation: query hooks for reads (`useCampaigns()`, `useCampaign(id)`), mutation hooks for writes. Campaigns and Characters use grouped mutations (`useCampaignMutations()` → `{ create, update, archive }`, `useCharacterMutations()` → `{ create, update, remove }`). Sessions, Encounters, and Notes use individual mutation hooks (`useCreateSession()`, `useUpdateSession()`, `useDeleteSession()`, etc.). `useBuilderAutosave()` handles character builder draft/finalize.
3. **Pages**: `src/pages/` — route-level components. All routes are campaign-scoped (`/campaign/:id/...`).
4. **Components**: `src/components/ui/` — shadcn/ui primitives (Badge, Button, Card, Checkbox, Dialog, Input, Label, Select, Skeleton, Sonner, Switch, Tabs, Textarea, Toggle, ToggleGroup) plus custom AutocompleteInput, GenderToggle, and ValidationError. `src/components/` — layout components (Layout, Sidebar).

### Routing

All routes are defined in `src/App.tsx`. Layout wraps all routes and provides a sidebar with campaign selection. Routes follow `/campaign/:id/<section>` pattern. Global routes (`/settings/theme`, `/export`) exist outside the campaign scope. The character builder lives at `/campaign/:id/character/new` with a 7-step flow (Basics → Abilities → Skills → Class Features → Proficiencies → Equipment → Backstory), autosave via `useBuilderAutosave()`, and dedicated step components in `src/components/character-builder/`. There is no dedicated Spells step in the builder, but spellcasting is resolved: `src/lib/resolver/spellcasting.ts` (`resolveSpellcasting()`) builds a spellcasting profile from `spellcasting` grants, returning `null` only when the build has none.

### Internationalization (i18n)

All user-facing strings must use `react-i18next` translation keys — never hardcode English text in components. `eslint-plugin-i18next` enforces this.

- **Config**: `src/lib/i18n.ts` initializes i18next with bundled JSON resources (no async loading).
- **Namespaces**: `common` (UI strings — buttons, labels, errors) and `gamedata` (D&D reference data — race names, class names, skills, etc.).
- **Translation files**: `src/locales/en/common.json` and `src/locales/en/gamedata.json`.
- **Type safety**: `src/@types/i18next.d.ts` maps `resources` to the JSON files, giving compile-time key checking. Invalid `t('nonexistent.key')` calls fail typecheck.
- **Usage pattern**: `const { t } = useTranslation('common')` for UI strings, `const { t } = useTranslation('gamedata')` for game data. When both are needed in one component, alias one: `const { t: tc } = useTranslation('common')`.
- **Dynamic keys**: Domain ID types (`SpeciesId`, `ClassId`, `AlignmentId`) are narrow enough that template literals like ``t(`species.${speciesId}`)`` typecheck without casts. If a variable is wider than the key union (e.g., `string` from `Object.entries()`), narrow it first rather than using `as never`.
- **ID-based data model**: Species, class, background, alignment, and skill values are stored as lowercase IDs in the database (e.g., `dwarf`, `wizard`, `acolyte`). Always translate IDs to display names via `t()` from the `gamedata` namespace — never display raw IDs to users.

- **Languages**: French (default on a new device) and English, chosen with `LanguageSwitcher` and remembered in `localStorage`. `src/locales/fr/common.json` must keep exactly the keys and `{{placeholders}}` of `en/common.json` (`locales.test.ts` enforces it): add every new string to BOTH files. `gamedata` stays English. Unit tests and e2e run in English.

### D&D Game Data

`src/lib/dnd-helpers.ts` contains D&D 5.5e (2024) reference data (species, classes, skills, backgrounds, alignments, conditions) and utility functions (ability modifier calculation, proficiency bonus, spell slot tables). Species/class/background data uses ID-based keys that correspond to translation keys in `gamedata.json`. See `docs/dnd-2024.md` for the contributor data-shape reference.

`src/lib/sources/` implements the **Source → Grant → Resolver pipeline**:

- `classes.ts` / `subclasses.ts` / `species.ts` / `backgrounds.ts` / `feats.ts` — define `*Source` objects with per-level `Grant[]` arrays
- `index.ts` — `collectBundles(build)` assembles `GrantBundle[]` from all active sources for a character build
- `src/lib/resolver/` — `resolveCharacter(bundles, choices)` resolves bundles into a `ResolvedCharacter` (proficiencies, features, pending choices, etc.)
- All 12 classes have `ClassSource` entries and all 48 subclasses have populated (non-empty) `features` arrays — there are no empty `features: []` stubs. Coverage is **partial, not rules-as-written complete**: subclass feature levels follow each class's own 2024 PHB table (not a uniform progression), and most subclasses are missing their higher-level milestones (only the 3 Fighter subclasses currently cover the full 3/7/10/15/18 set). Fighter and Rogue class tables are also incomplete past ~level 10 (missing ASIs at 12/16/19). Run `npm run coverage:matrix` to regenerate `docs/coverage-matrix.md` — the live per-entry status report (`src/lib/sources/coverage-matrix.ts`). Note: `complete` there means _structurally shaped correctly_, not _verified against the PHB_
- Subclass selection is uniformly at class level 3 for all 12 classes (array index 2 of `ClassSource.levels`), matching the 2024 PHB rule
- Weapon masteries are defined in `src/types/items.ts` as `WEAPON_MASTERIES` and granted via `weapon-mastery-choice` grants in `ClassSource.levels`; Barbarian, Fighter, Paladin, Ranger, and Rogue receive mastery choices at various levels

### Rules edition per campaign (epic 9)

`campaigns.ruleset` is `'2014'` or `'2024'` (default `'2024'`; `src/lib/ruleset.ts`). The DM picks it at creation or on the dashboard (`RulesetPicker`); a database trigger refuses a change once a character is `ready`. The 2024 engine is the only sheet engine that exists: `canBuildCharacters('2014')` is false, so the builder shows a notice and the MCP character tools (create, generate NPC, set choices, level up, finalize) refuse in a 2014 campaign, until stories 9.5 to 9.8 land. The database enforces it too (`characters_check_ruleset`): a character can not be finalized in a campaign whose edition has no engine (`ruleset_has_engine()`, to extend with each engine), and a finalized one only moves between campaigns of the same edition. Drafts stay editable data: switching a campaign from 2024 to 2014 leaves its drafts in place, the builder shows the notice until the engine exists.

### Rules as data (story 9.3)

Architecture in `docs/rules-as-data.md` (section 9 for what 9.3 implemented), entry shapes in `docs/dnd-2024.md` ("Rule entries").

- The engine reads a `RuleSet` (`src/lib/rules/`): built-in 2024 sources (`src/lib/sources/*`, unchanged objects) + SRD 2014 layer (`srd-2014.ts`, generated JSON since 9.5) + the DM's library (table `rule_entries`, one library **per edition**, not per campaign). Last layer wins; an entry with a built-in id replaces it and is flagged `overrides`.
- `collectBundles(build, rules?)`, `resolveCharacter({ ..., rules? })`, `reconstructBuild(..., rules?)` default to `builtin2024RuleSet()`: code that passes nothing behaves as before (the MCP engine included). In React, never read `SPECIES_SOURCES` & co. from a screen: use `useActiveRuleSet()` (from `RuleSetProvider`, mounted by `CharacterBuilder` and `CharacterSheet`, which waits for the campaign and the library and shows an error instead of a sheet computed without them; `useRuleSet()` returns `{ rules, status }`), `useGameData()`, and `useRuleName()` or `useRuleAwareT()` for names (an entry shows its own `name.fr`/`name.en`, a built-in entity its `gamedata` key). Never pass text written by the DM to `t()` (not even as `defaultValue`, which i18next interpolates).
- **SRD 2014 layer (story 9.5).** `npm run srd:generate` (`scripts/generate-srd-2014.ts`, converters in `scripts/srd-2014/`) converts the committed snapshot of the SRD 5.1 data set into `src/lib/rules/srd-2014/*.json` (9 species, 4 subspecies, the acolyte; attribution in `ATTRIBUTION.md`, shown in Settings > Licenses). Never edit the JSON by hand; `scripts/srd-2014/convert.test.ts` fails when it differs from the generator output. A subspecies is offered as a lineage choice of its parent (`subspeciesChoice`), its grants added to the species'. `rule_entries.overrides_builtin` (written by the MCP) lets the DM delete an override characters use. Details in `docs/rules-as-data.md` section 10.
- **2014 classes (story 9.6).** The same generator converts the 12 SRD 5.1 classes and their 12 subclasses (`class.json`, `subclass.json`; snapshot files `classes`, `levels`, `subclasses`, `features`). The subclass is a `subclass` grant at the class level of the SRD feature that opens it (1 for cleric, sorcerer, warlock; 2 for druid, wizard; 3 for the others), Ability Score Improvements are `asi` grants at the levels of the SRD tables (fighter 7, rogue 6, others 5; no feat choice), there is no weapon mastery. Feature text is kept as `feature` grants; saves, skills, armor, weapons, tools, unarmored defense, expertise, fighting styles, Jack of All Trades, Diamond Soul, Draconic Resilience, Hunter and draconic options are computed. Spellcasting, resource pools, invocations and starting-equipment items stay text until 9.7 and 9.8. Details in `docs/rules-as-data.md` section 11.
- Entity ids (species, subclass, background, feat, spell, item) are open kebab-case strings at the engine boundary (`CharacterBuild`, `SourceTag`, decisions); the closed unions stay for the built-in data. Class ids and the mechanical vocabulary (abilities, skills, damage types, sizes, proficiencies, languages, tools, schools) stay closed: a new value is a code change.
- Every entry is validated by the strict Zod schema `parseRuleEntry` (`src/lib/rules/schemas.ts`) on write (MCP) and **on read** (`buildRuleSet`): an invalid entry is ignored and listed in `RuleSet.invalid`, an entry with `needsReview` notes is listed in `RuleSet.unverified` and not usable. The database guards it too (`validate_rule_entry`, size, quota, revision, delete refused while `rule_entry_users` returns characters). Rule text is plain text, never markup. Test fixtures are invented (`src/test/rule-fixtures.ts`): nothing outside the SRD 5.1 enters the repository.

### Database Schema

`supabase/migrations/` defines tables: campaigns, characters, sessions, encounters, notes. Complex data (abilities, equipment, spells, combatants, loot) stored as JSONB columns. All tables cascade-delete from campaigns. Campaigns support soft-delete via `archived_at`. The DB has both `character_type` (source column) and `is_npc` (generated/computed column). Sessions store loot items as JSONB with add/delete/upsert support in `SessionDetail`.

### Styling

Three color themes (Default/gold, Sylvan/green, Arcane/purple) with light and dark mode. Theme is set via `data-theme` attribute on `<html>`, dark mode via `.dark` class. Theme state managed by `ThemeProvider` in `src/components/ThemeProvider.tsx`. CSS variables for each theme defined in `src/index.css`. Per-campaign theme overrides stored in the `campaigns.theme` DB column. Reusable Tailwind component classes: `.page-container`, `.page-title`, `.hover-lift`, `.grid-2`/`.grid-3`/`.grid-4`.

- Prefer `size-*` over `w-* h-*` for square elements (icons, avatars, etc.) to signal intent that width and height should stay equal.

### Testing

- **Framework**: Vitest with jsdom, globals enabled, `restoreMocks: true`
- **Test location**: Co-located with source files (`src/lib/foo.test.ts`, `src/hooks/useHook.test.ts`)
- **Test infrastructure**: `src/test/` — `setup.ts` (global setup), `wrapper.tsx` (`createWrapper()` for QueryClient), `mocks/supabase.ts` (Supabase mock), `hook-test-helpers.ts` (shared CRUD helpers)
- **Supabase mock**: `vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'))` — chainable builder; configure response via `mockQueryResult.data` / `mockQueryResult.error`
- **Hook tests**: Use `createWrapper()` from `src/test/wrapper.tsx` as the `renderHook` wrapper. Call `setupMockReset()` at the top of each describe block to reset mock state between tests.
- **Shared CRUD helpers** (`src/test/hook-test-helpers.ts`): `describeListQuery`, `describeSingleQuery`, `describeCreateMutation`, `describeUpdateMutation`, `describeDeleteMutation` — cover standard success/error/disabled cases. Write inline tests for behavior unique to a hook.
- **Lib function tests**: Co-locate test file; use `it.each` for pure input/output functions; mock `Math.random` via `vi.spyOn` for random-dependent functions.
- **Coverage**: v8 provider; includes `src/lib/**` and `src/hooks/**`; excludes `query-client.ts`, `i18n.ts`.

#### BDD (Cucumber)

Spec-first acceptance tests live in `features/`, run via `npm run test:bdd` (and `npm run test:bdd:future` for spec-ahead scenarios). The suite **drives** development — never edit `src/` or `supabase/migrations/` to force a scenario green; tag genuinely-missing functionality `@future` instead. Full guide — tag taxonomy, the two binding seams (resolver vs. render-app), and run-time gotchas — is in **`docs/bdd.md`**. The same specs export to a manual UAT checklist via `npm run uat:checklist` (see Commands).

## Environment Variables

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (the README and `SETUP.md` still say `VITE_SUPABASE_ANON_KEY`: see TO-DO). Optional `VITE_ACCOUNT_DOMAIN` (default `table`): label of the derived sign-in address `<pseudo>@<label>.invalid`, which must match `ACCOUNT_DOMAIN` used when the accounts were created.

### Authentication

Every route except `/login` sits behind `RequireAuth` (`src/components/RequireAuth.tsx`); `AuthProvider` / `useAuth()` (`src/hooks/useAuth.tsx`) hold the session and empty the query cache on sign-out. Only `src/hooks/` may import `@/lib/supabase` (ESLint `no-restricted-imports`): pages call hooks or the functions of `src/hooks/dataAccess.ts`.

## Deployment and CSP (epic 7)

- The QNAP stack, install procedure and network rules are in `docs/deploy-qnap.md` (`deploy/qnap/`); the load test in `docs/qnap-load-test.md`. No secret, host name or address in the repository.
- The app runs under a strict Content-Security-Policy (no `unsafe-inline`, no `unsafe-eval`): no inline `<script>`, no `<style>` element injected by a new library, no `eval`/`new Function`. Every Playwright test runs under that policy (`e2e/fixtures.ts`) and fails on a violation. After a `sonner` upgrade, `deploy/qnap/csp.test.ts` tells you to refresh the hash (`node scripts/sonner-csp-hash.mjs`).
