# Rules as data (epic 9, story 9.2)

Result of the story 9.2 spike: what the SRD 5.1 covers, what the engine needs, and the architecture chosen for rules that the
DM creates and edits through the MCP. It is the reference for stories 9.3 to 9.9. The decision itself is D-35 in
`DECISIONS.md`.

## 1. The constraint

The engine (`src/lib/sources`, `src/lib/resolver`) is a pure pipeline: `collectBundles(build)` assembles `GrantBundle[]` from
`SpeciesSource`, `ClassSource`, `SubclassSource`, `BackgroundSource`, `FeatSource` and `ItemSource` objects, then
`resolveCharacter(bundles, choices)` turns them into a `ResolvedCharacter`. Everything those objects contain is a `Grant`
(a discriminated union of 29 variants in `src/types/grants.ts`), which is plain serializable data.

Two things make the rules code today, not data:

- the sources live in TypeScript modules and are read through module-level lookups (`getSpeciesSource(id)`, `getClassSource(id)`,
  `getSubclassSource(id)`, `getBackgroundSource(id)`, `getFeatSource(id)`, `getItemSource(id)`): 45 call sites outside
  `src/lib/sources/`, plus the MCP engine;
- the identifiers are closed TypeScript unions (`SpeciesId`, `ClassId`, `BackgroundId`, `FeatId`, `SkillId`, `LanguageId`,
  `ToolProficiencyId`, ...) and every name shown to a user is a key of `gamedata.json`.

The grant pipeline needs no change to describe 2014 rules: a class level already carries any grants, so the level at which a
subclass is chosen (1, 2 or 3) is a `{ type: 'subclass' }` grant in the right `levels[]` entry, species already grant
`ability-bonus`, and `lineage-choice` already models sub-species.

## 2. What the SRD 5.1 covers (checked on the SRD 5.1 data, 2026-11-18)

The SRD 5.1 is published under CC-BY-4.0 (attribution required, see section 7). Counts below come from the SRD 5.1 data set.

| Kind                               | In the SRD 5.1                                                                                                           | Notes                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Species                            | 9: dragonborn, dwarf, elf, gnome, half-elf, half-orc, halfling, human, tiefling                                          |                                                                                                         |
| Sub-species                        | 4: hill dwarf, high elf, lightfoot halfling, rock gnome                                                                  | **Mountain dwarf is not in the SRD.** Lightfoot halfling is.                                            |
| Classes                            | 12                                                                                                                       | all PHB classes; **artificer is not**                                                                   |
| Subclasses                         | 12, one per class: berserker, champion, devotion, draconic, evocation, fiend, hunter, land, life, lore, open hand, thief | **The Fiend (warlock) is in the SRD.** Circle of Spores, Rune Knight, Soulknife, Gloom Stalker are not. |
| Backgrounds                        | 1: acolyte                                                                                                               | the other backgrounds are not                                                                           |
| Feats                              | 1: grappler                                                                                                              |                                                                                                         |
| Spells                             | 319                                                                                                                      | with their class lists                                                                                  |
| Equipment                          | 237                                                                                                                      | weapons, armor, gear, packs, tools                                                                      |
| Magic items                        | 362                                                                                                                      |                                                                                                         |
| Features                           | 407                                                                                                                      | class and subclass features                                                                             |
| Languages / skills / proficiencies | 16 / 18 / 117                                                                                                            |                                                                                                         |

### 2.1 Where the SRD data comes from

Source of truth: the open SRD 5.1 data set behind the public SRD API (the `5e-database` project: one JSON file per entity, with
class levels, features, class spell lists and equipment). It already has the shape the converter needs (levels per class,
features per level, ability bonuses per species and sub-species). The 2014 SRD layer is generated from it by a script kept in the
repository (`scripts/`), and the generated JSON is committed with the attribution of section 7. Nothing is fetched at run time.

The PyPI package `dnd-5e-core` (Python, MIT, alpha, last release 2026-02-06, 7 stars) was assessed and is **not adopted**: it is a
Python game and combat engine (combat, treasure, shop, monsters) that bundles the same SRD data under the same folder
layout as that data set, so it adds nothing to take from upstream, brings a language and a scope the app does not use, and its
MIT licence covers the code only (the SRD data keeps its CC-BY attribution duty). Its claim of "40+ subclasses" is more than
the 12 the SRD holds: whatever the extra ones are, they are not safe to ship in a public repository.

Consequence: the repository (public) may hold the English SRD text of these entries and nothing else. Everything outside it
(mountain dwarf, Circle of Spores, Rune Knight, Soulknife, Gloom Stalker, non-SRD backgrounds and feats, artificer) is entered by
the DM into the private database, through the MCP, from the books they own.

French: there is no CC-BY French text to ship. The repository keeps English SRD text and its own French UI labels (names are
facts; descriptions in French come from the DM's private entries).

## 3. Architecture

### 3.1 A `RuleSet` replaces the module-level lookups

```ts
interface RuleSet {
  readonly ruleset: '2014' | '2024';
  readonly species: ReadonlyMap<string, SpeciesEntry>;
  readonly classes: ReadonlyMap<string, ClassEntry>;
  readonly subclasses: ReadonlyMap<string, SubclassEntry>;
  readonly backgrounds: ReadonlyMap<string, BackgroundEntry>;
  readonly feats: ReadonlyMap<string, FeatEntry>;
  readonly spells: ReadonlyMap<string, SpellEntry>;
  readonly items: ReadonlyMap<string, ItemEntry>;
}
```

`collectBundles(build, rules)` and the resolver take the `RuleSet`; `getXSource(id)` becomes `rules.species.get(id)`. A
`RuleSetProvider` (React context, fed by one query) hands it to the screens; the MCP engine builds it the same way. The 2024
`RuleSet` is built from the existing TypeScript sources, unchanged and with their tests.

### 3.2 Three layers, last one wins

1. **Built-in 2024** (code, today's sources).
2. **Built-in 2014 SRD** (static JSON in the repository, SRD 5.1 text only, attribution file next to it).
3. **DM library** (database, table `rule_entries`): the DM's entries for that edition. An entry with the id of a lower layer
   replaces it, and the MCP and the app flag it as an override.

### 3.3 Entry envelope

One JSON object per entry, validated by a strict Zod schema (no unknown key):

```json
{
  "schema": 1,
  "kind": "subclass",
  "id": "circle-of-spores",
  "name": { "en": "Circle of Spores", "fr": "Cercle des Spores" },
  "source": { "book": "tcoe", "page": 39 },
  "summary": { "en": "...", "fr": "..." },
  "needsReview": ["dice read from a scan, to confirm"],
  "body": {}
}
```

`needsReview` is a bounded list of short notes. An entry that carries notes is stored and shown to the DM as unverified, and a
character can not use it until the DM clears the list (the MCP tool refuses to clear it without an explicit confirmation).

`kind` is one of `species`, `subspecies`, `class`, `subclass`, `background`, `feat`, `spell`, `item`. The `body` is the existing
source shape, in JSON: `grants` for species, background, feat and item; `levels[].grants` for a class;
`features[{ classLevel, grants }]` for a subclass; plus, for a subclass, `class` and `chosenAtClassLevel`. Descriptive text
(feature names and descriptions) lives in the entry (`features[].name`, `features[].text`), not in `gamedata.json`: an
entry is displayed with its own text, and `gamedata.json` keys remain for the built-in layers only.

### 3.4 Identifiers and closed vocabularies

- **Entity ids are open strings** (kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 to 60 characters): species, subclasses,
  backgrounds, feats, spells, items. The closed TypeScript unions for these ids become `string` at the engine boundary; the
  built-in layer keeps its unions through a narrowing helper.
- **Mechanical vocabularies stay closed in code**: abilities, skills, damage types, conditions, sizes, armor and weapon
  categories, proficiency ids, spell schools. A rule that needs a new value in one of them is a code change, not a data entry.
  An entry validates its `Grant`s against these vocabularies, so a typo is refused with the field path.
- **Languages and tools** are the exception that must open: the 2014 books add languages and tool proficiencies the 2024
  engine does not list. They become registry-backed (the built-in list plus DM entries of kind `item` / `language`), decided
  in 9.5.
- **2014 additions to the `Grant` vocabulary** (new variants, added in 9.5 to 9.8, each with its resolver and tests):
  spells known and spell list extension (expanded patron list), warlock invocations and pact boon, class
  features that grant dice pools (Superiority Dice, Wild Shape uses) through the existing `resource-pool`, subspecies traits
  through `lineage-choice`. The Grant additions are listed per story in section 6.

### 3.5 Storage

```
rule_entries (
  ruleset   text  not null check (ruleset in ('2014','2024')),
  kind      text  not null,
  id        text  not null,
  content   jsonb not null,
  revision  int   not null default 1,
  created_at, updated_at timestamptz,
  primary key (ruleset, kind, id)
)
```

It is a library of the DM, not of a campaign: the single DM keeps one set of rules per edition and every campaign of that
edition reads it (no duplication across campaigns). Reads: members of a campaign whose `ruleset` matches (policy through
`is_member` and `campaigns.ruleset`). Writes: the DM only (`is_dm()`). Same access matrix as the other tables (AD-14).

Guards in the database (the DM is trusted but the MCP writes on their behalf, so the table defends itself):

- `jsonb_typeof(content) = 'object'`, `octet_length(content::text) <= 65536`, at most 2000 entries per kind and edition;
- a validation function (`validate_rule_entry(kind, content)`, SQL) that checks the envelope: allowed keys per kind, string
  lengths, array bounds, and refuses any string value that looks like markup, a link or a script (`<`, `>`, `javascript:`,
  `data:`, `http`);
- `revision` increments on every update; deletion is refused while a character uses the entry (checked by the same function).

The database cannot run the full Zod schema. **The SQL guard is a structural floor, not the validation**: it checks the
envelope, the body keys per kind, that every element of a `grants` list (at any depth) is an object whose `type` is one of the
29 grant types, that names and summaries are strings, bounds, and dangerous text (markup, links, scripts, control and invisible
formatting characters). It does not check the inside of a grant (an unknown key in a grant passes the SQL). **Zod is the
complete check**: the app and the MCP run it before writing, and **the app runs it again when reading**: an entry that fails is
ignored and reported to the DM, never resolved.

### 3.6 Characters keep their stored values

A finalized sheet stores computed values (hit points, armor class, ...). Changing a rule does not rewrite stored sheets: the
MCP update tool returns the list of characters that use the changed entry, flagged "recompute on next rebuild". A sheet is
recomputed when its owner or the DM rebuilds it.

## 4. Security

- An entry is data: no code, no markup, no link. Text is shown as plain text (React escapes it). There is no Markdown or HTML
  rendering of rule text (that belongs to epic 8, with its own sanitizer).
- Bounded size and count, validated on write (MCP, app, database) and on read (app, MCP).
- Written by the DM only; read by members of the campaigns of that edition; anonymous and non-members read nothing.
- Text that a book supplies (OCR) is treated as untrusted data by the MCP: it is never interpreted as an instruction.
- Nothing from outside the SRD enters the repository, the test fixtures included (fixtures use invented entries).

## 5. Impact on the existing code

| Area                                                                                                                           | Change                                                          | Story |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----- |
| `src/lib/sources/index.ts`                                                                                                     | `collectBundles` takes a `RuleSet` (done, section 9)            | 9.3   |
| 45 call sites (`BasicsStep`, `OriginStep`, `SubclassPicker`, `useCharacterContext`, `build-reconstruction`, `random-npc`, ...) | read the `RuleSet` from context                                 | 9.3   |
| `src/types/*`                                                                                                                  | open entity ids, JSON entry types, Zod schemas                  | 9.3   |
| `supabase/migrations`                                                                                                          | `rule_entries`, `validate_rule_entry`, policies, pgTAP matrix   | 9.3   |
| MCP `src/engine`, `src/tools`                                                                                                  | build the `RuleSet`; `dnd_*_rule` tools; character tools use it | 9.4   |
| `gamedata.json`                                                                                                                | unchanged for built-in; entries carry their own text            | 9.3   |
| `docs/dnd-2024.md`                                                                                                             | add the data-shape reference for entries                        | 9.3   |

## 6. What the 2014 engine needs (differences from the 2024 data)

Differences between the 2024 data and the 2014 rules, split across 9.5 to 9.8 (section 8 lists what a real table needs):

| Topic              | 2024 engine today                                   | 2014 needs                                                                           |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ability scores     | species give none, backgrounds give +2/+1           | species and subspecies give bonuses; backgrounds give none                           |
| Backgrounds        | skills, tool, language, origin feat                 | skills, tools, languages, equipment, a feature (text)                                |
| Subclass           | chosen at class level 3                             | chosen at class level 1 (cleric, sorcerer, warlock), 2 (druid, wizard) or 3 (others) |
| Weapon masteries   | granted by 5 classes                                | none                                                                                 |
| Feats              | origin feats from backgrounds, general feats at ASI | only at ASI levels (alternative to the ASI), optional rule                           |
| Spells             | prepared and known per 2024 tables                  | 2014 known, prepared and spellbook rules; warlock pact magic, invocations, pact boon |
| Starting equipment | bundles per class and background                    | class equipment choices and gold alternative                                         |
| Species traits     | lineage choice                                      | subspecies, darkvision, resistances, extra languages, weapon and tool proficiencies  |

## 7. SRD attribution

The SRD 5.1 requires this notice wherever its content is distributed (to ship in the repository with the 2014 SRD layer):

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available
> at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution
> 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

## 8. What a real 2014 table asks of the engine

Drawn from the sheets of five real characters of the first table (levels 1 to 5, seven classes and subclasses, four species and
sub-species, five backgrounds). The sheets themselves, their names and the book text stay outside the repository; this is the
list of capabilities they require, which 9.5 to 9.9 must cover and 9.10 checks against the real sheets.

| Capability                                                                                                                                   | Needed by             | Engine today                                 | Plan                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Sub-species bonus **on top of** the species bonus (Mountain Dwarf STR +2 and CON +2, Lightfoot Halfling CHA +1 and DEX +2)                   | species               | `ability-bonus` grants exist, no parent link | `subspecies` entry with `parent`; its grants add to the parent's (9.5)         |
| Sub-species armor proficiency; tool choice from a list given by the parent species                                                           | species               | `proficiency-choice` for tools exists        | covered by existing grants; inheritance of parent traits in the resolver (9.5) |
| Standard human (+1 to every ability)                                                                                                         | species               | none                                         | species grants (9.5)                                                           |
| Backgrounds without ability bonus, with skills, tools, languages, starting equipment and a text feature; **custom backgrounds of the table** | backgrounds           | origin feat and `asi` assumed                | 2014 background body; custom backgrounds are DM library entries (9.5, 9.3)     |
| Subclass chosen at level 1 (warlock patron), 2 (druid circle) and 3 (ranger, rogue, fighter)                                                 | classes               | one `subclass` grant per class level         | already data: put the grant in the right `levels[]` entry (9.6)                |
| Subclass **spells always available** (patron expanded list, circle spells)                                                                   | warlock, druid        | `spell` grants exist                         | expanded-list grant: `spell-list-extension` (new, 9.8)                         |
| Pact magic, invocations, pact boon                                                                                                           | warlock               | pact slots resolved, no invocations          | `invocation-choice`, `pact-boon-choice` grants (new, 9.8)                      |
| Cantrips known, spells known vs prepared, per-class spell lists, slots                                                                       | all casters           | partial for 2024                             | 2014 tables and lists from the SRD (9.8)                                       |
| Class dice pools and uses (Wild Shape, Psionic Energy dice, Second Wind, Action Surge, rune uses)                                            | druid, rogue, fighter | `resource-pool`                              | existing grant, 2014 numbers (9.6)                                             |
| Ranger 2014 features (favored enemy, natural explorer choices)                                                                               | ranger                | none                                         | `feature-choice` entries (9.6)                                                 |
| Fighting style at the class level 2014 gives it, no weapon masteries                                                                         | fighter, ranger       | `fighting-style-choice`, masteries           | 2014 classes grant no mastery (9.6)                                            |
| Homebrew mechanics with no engine effect (custom rune system)                                                                                | any                   | none                                         | `feature` entries with text only; never a grant (9.3)                          |
| Ability scores entered by hand (method unknown)                                                                                              | all                   | standard array, point buy, rolling           | add a `manual` method with bounds (9.7)                                        |
| Computed sheet values: HP, AC with armor, initiative, passive perception, saves, skills with expertise, spell save DC and attack             | all                   | resolved                                     | 2014 formulas and tests (9.6 to 9.7)                                           |
| PDF sheet from 2014 data                                                                                                                     | all                   | field map for 2024                           | 9.9                                                                            |

Source books named in the entries: `phb-2014` (partly SRD), `xgte`, `tcoe` are in use at the table; `vrgtr` is probable
(an original background). Others (`dmg-2014`, `scag`, `vgm`, `eepc`) exist in the library but their use is unconfirmed;
`mpmm` is not a 2014 book and is excluded from the 2014 edition. **The list of books really allowed at the table is not written
anywhere and needs the DM's confirmation** (it feeds `allowed_source_books`, which today only knows `phb-2024`).

French names: the only French glossary found (about 1790 entries) is the unofficial 2018 AideDD one, with several French
variants for 267 entries and poor coverage of Xanathar and Tasha. It is a starting point, not the reference: an entry's French
name must be confirmed in the book it comes from, and the entry keeps the book in `source`.

Limits of the extractions made so far (private files): the books are OCR scans, with systematic errors on dice, columns mixed in
tables (the Rune Knight rune table is the most fragile) and lost lines (one row of the Fiend expanded list). Every entry coming
from a scan carries a `needsReview` list and is not usable until a human has checked it; the schema reserves that field.

## 9. As implemented in story 9.3

Story 9.3 built sections 3.1 to 3.5. Where the implementation had to decide something this document left open, or chose a
simpler shape, it is listed here (the data shapes are in `docs/dnd-2024.md`, section "Rule entries").

- **Code.** `src/lib/rules/` (pure, importable by the MCP): `schemas.ts` (Zod: envelope, eight bodies, the 29 `Grant` variants
  against the closed vocabularies of `vocab.ts`), `types.ts` (`RuleSet`), `ruleset.ts` (`buildRuleSet`, `builtin2024RuleSet`,
  `spellsForList`, `classOfSubclass`), `display.ts` (names, `ruleAwareT`), `srd-2014.ts` (empty SRD layer). React:
  `useRuleEntries`, `useRuleSet` (`{ rules, status }`), `RuleSetProvider`, `useActiveRuleSet`, `useRuleName`, `useRuleAwareT`
  (`src/hooks/`).
- **Validation, two levels.** Zod (`parseRuleEntry`) is the complete check, on write (app, MCP) and on read. The SQL
  `validate_rule_entry` is a structural floor (section 3.5): grant types yes, grant contents no. Text rules are the same on both
  sides: no `<`, `>`, `javascript:`, `vbscript:`, `data:`, `http` (any case), no value starting with `www.` or `//`, no control or
  invisible formatting character (Unicode Cc, Cf; line breaks allowed in summaries and descriptions only). Zod bounds the JSON to
  60000 bytes of `JSON.stringify` and 12 levels of nesting, under the 65536 bytes of `octet_length(content::text)` in SQL (jsonb
  normalizes the text a little longer).
- **Loading.** `useRuleSet` returns `{ rules, status: loading | error | ready }`. `RuleSetProvider` (builder, sheet) waits for
  the campaign and the library (skeleton), and shows an error with a retry button instead of the sheet when the library can not be
  read: a sheet is never computed without the entries it may depend on. `rule_entries` is cached 30 seconds.
- **Names.** Every place that turns a species, class, subclass, background, feat or spell id into a name goes through the rule
  set (`useRuleName`, or `useRuleAwareT`, a `gamedata` translator whose entity keys answer with the entry's own text, used by the
  choice sources, the sheet, the character list, the dashboard and the PDF). Text written by the DM is never passed to i18next
  (`defaultValue` is interpolated): a feature's own `name` and `description` are shown first, as is.
- **The built-in layer keeps its objects.** The 2024 `RuleSet` holds the very objects of `src/lib/sources/*` (same references, same
  order), so `useGameData` and every test that compares sources are unchanged. `builtin2024RuleSet()` is the default of
  `collectBundles`, `resolveCharacter`, `reconstructBuild` and the builder helpers: callers that pass nothing behave as before.
- **Editions.** 2024 = built-in code + library. 2014 = SRD layer + library, with no built-in 2024 rules underneath (the 2014 engine
  stays disabled until 9.5 to 9.8).
- **Feature text.** The descriptive text of a feature is carried by its `feature` grant (`feature.name`, `feature.description`, which
  `FeatureDef` already had and the sheet already displays), in one language. Section 3.3 suggested `features[].name` and
  `features[].text` on the subclass: not added, to keep one place for the text. Entry names and summaries are bilingual.
- **Classes stay closed.** Spell lists, slot tables, class icons and resource pools are keyed on `ClassId` everywhere, so a `class`
  entry can only replace a built-in class (its id must be a `ClassId`). Opening class ids (artificer) is a later story.
- **Languages and tools stay closed** until 9.5, as section 3.4 planned.
- **Unverified entries.** An entry with `needsReview` notes is not applied at all: it is listed in `RuleSet.unverified` (and on the
  DM's dashboard), and when it has the id of a lower-layer rule, that rule stays in force (and keeps its name) until the notes
  are cleared. The database refuses (23503) to add review notes to an entry a character uses.
- **Invalid entries** are listed in `RuleSet.invalid` with the path and message of the first issue, logged, and never resolved.
- **Source books.** `allowed_source_books` filters the built-in layer only; SRD and library entries are always offered (the DM put
  them in the library on purpose). `SourceBookId` gains `phb-2014`, `xgte`, `tcoe` (default unchanged: `{phb-2024}`); the dashboard
  lists the books of the campaign's edition only.
- **Reads.** Policy `rule_entries_member_select`: a member reads the library of an edition when one of their campaigns follows it
  (subquery on `campaigns` with `is_member`, no new SECURITY DEFINER function); `access_active` as everywhere; the DM reads and
  writes all (`rule_entries_dm_all`). The API writes only `ruleset`, `kind`, `id`, `content` (insert) and `content` (update).
- **Deletion guard.** `rule_entry_users(ruleset, kind, id)` (SQL, not SECURITY DEFINER) lists the characters that use an id,
  **whatever the current edition of their campaign** (a campaign can change edition while it holds drafts): `characters.species/background/class/subclass`, `character_build_levels.class_id/subclass_id/feat_id`,
  feat, spell and lineage decisions in `choices`, `character_items.item_id`. The delete trigger refuses (23503) while it returns
  rows. It is a separate function from `validate_rule_entry`, so the MCP can show who uses an entry before an update (section 3.6).
  It also blocks deleting a library entry that only overrides a built-in rule while characters use that id: safest default.
  `rule_entry_references(ruleset, kind, id)` lists the other entries of the edition whose content mentions the id (any string
  value equal to it): the delete is refused while there are some. Limit for 9.5: a `subspecies` is matched through the
  `lineage-choice` decisions (`lineageId`), the only place a sub-choice of a species is stored today; lineage ids are not unique
  across species, so the match can be over-cautious. 9.5 decides how a subspecies is stored on a character.
- **Guard names for API clients (story 9.4).** Every refusal raised by the `rule_entries` triggers carries the guard name in
  `HINT` as well as in `CONSTRAINT` (`rule_entries_content_valid`, `rule_entries_quota`, `rule_entries_identity`,
  `rule_entries_in_use`, `rule_entries_referenced`): PostgREST passes the hint to its clients, not the constraint name. The MCP
  reads it first (pgTAP `00565-rule-entries-hints.test.sql`).
- **Characters.** `characters.species` and `characters.background` were closed lists of the 2024 ids; they become kebab-case
  checks, so a character can carry a library species or background. Engine types follow: `CharacterBuild.speciesId`,
  `backgroundId`, `feats`, the `subclass` and `feat-choice` decisions, `SourceTag` ids of species, subclass, background and feat,
  `FeatGrant.featId`, `FeatChoiceGrant.from` and `LineageChoiceGrant.speciesId` are `string`. The closed unions remain for the
  built-in data (`SpeciesId`, `FeatId`, ...), narrowed with `isSpeciesId`, `isFeatId`, `isBackgroundId`, `isSubclassId` where a
  `gamedata` key is built.
- **Lineage names** of a library species are kept in `RuleSet.lineageNames` and shown by the lineage picker and the sheet. A
  lineage is taken only from the entry's own keys and only when the grant offers it (a stored `constructor` resolves to nothing).
- **Degraded reading.** `reconstructBuild` no longer throws on a well-formed but unknown species: a warning, and the sheet
  resolves without its grants. Feat and spell decisions with a well-formed id are kept even when the rules do not know the id
  (they were dropped silently before); `collectBundles` warns about the missing entry. `collectBundles` runs inside the error
  boundary of the character context.
- **Replacing a class** keeps the quick-build hints and the book of the built-in class. Its `asi` and `subclass` grants are indexed
  like the built-in ones (the n-th `asi` grant is `asi:class:<id>:n`, stored on the row of the class level that carries it):
  keep them at the same levels, or stored builds move.
- **Immutability.** A `RuleSet` and its lists are frozen; its maps are typed `ReadonlyMap` and must never be mutated (the
  built-in values are the shared objects of `src/lib/sources/*`).
- **Ids a player can write.** `characters.species` and `characters.background` accept any kebab-case id, and a player writes
  their own sheet: a player can store an id that is no rule (it only affects their sheet, which resolves without it), and can
  thereby block the deletion of a library entry with that id until the DM edits the sheet.
- **Not done in 9.3** (left to the stories that need them): the MCP tools (9.4), consuming `subspecies` (9.5), the SRD 2014 converter
  and data (9.5 to 9.8), library entries in the random NPC generator and in the class quick-build (they draw from the built-in rules).
