/**
 * Builds a `RuleSet` from its layers (story 9.3, docs/rules-as-data.md §3.2):
 *
 *   1. the built-in code layer of the edition (2024: `src/lib/sources/*`, unchanged; 2014: none),
 *   2. the built-in SRD layer of the edition (2014: `SRD_2014_ENTRIES`, filled by stories 9.5 to 9.8),
 *   3. the DM library (`rule_entries` rows of that edition).
 *
 * The last layer wins: an entry whose kind and id exist in a lower layer replaces it and is flagged `overrides`.
 * Every SRD entry and library row is validated again here (strict Zod schema): an invalid row is ignored and listed in
 * `invalid`, never resolved. A row with `needsReview` notes is listed in `unverified` and not applied (the lower
 * layer, if any, stays in force) until the DM clears the notes.
 */
import type { ClassId } from '@/lib/dnd-helpers';
import { getLogger } from '@/lib/logger';
import type { RulesetId } from '@/lib/ruleset';
import { parseRuleEntry, toGrants, type LocalizedName, type RuleEntry, type RuleEntryKind } from '@/lib/rules/schemas';
import { SRD_2014_ENTRIES } from '@/lib/rules/srd-2014';
import {
  ruleKey,
  type BackgroundRule,
  type ClassRule,
  type FeatRule,
  type InvalidRuleEntry,
  type ItemRule,
  type LineageGrants,
  type RuleEntryInfo,
  type RuleKey,
  type RuleLayer,
  type RuleSet,
  type SpeciesRule,
  type SpellRule,
  type SubclassRule,
  type SubspeciesRule,
} from '@/lib/rules/types';
import { BACKGROUND_SOURCES } from '@/lib/sources/backgrounds';
import { CLASS_SOURCES } from '@/lib/sources/classes';
import { FEAT_SOURCES } from '@/lib/sources/feats';
import { ITEM_SOURCES } from '@/lib/sources/items';
import { LINEAGE_GRANTS_REGISTRY, SPECIES_SOURCES } from '@/lib/sources/species';
import { SPELL_CATALOG } from '@/lib/sources/spells';
import { SUBCLASS_IDS_BY_CLASS, SUBCLASS_SOURCES } from '@/lib/sources/subclasses';
import { createChoiceKey } from '@/types/choices';
import type { LineageChoiceGrant } from '@/types/grants';
import type { SpellDef } from '@/types/spells';

const logger = getLogger('rules');

/** A row of `rule_entries` as read from the database. `content` is untrusted until validated. */
export interface RuleEntryRow {
  readonly ruleset: string;
  readonly kind: string;
  readonly id: string;
  readonly content: unknown;
  readonly revision?: number;
}

interface Draft {
  readonly ruleset: RulesetId;
  readonly species: Map<string, SpeciesRule>;
  readonly lineages: Map<string, LineageGrants>;
  readonly lineageNames: Map<string, ReadonlyMap<string, LocalizedName>>;
  readonly subspecies: Map<string, SubspeciesRule>;
  readonly classes: Map<string, ClassRule>;
  readonly subclasses: Map<string, SubclassRule>;
  readonly subclassesByClass: Map<ClassId, string[]>;
  readonly backgrounds: Map<string, BackgroundRule>;
  readonly feats: Map<string, FeatRule>;
  readonly spells: Map<string, SpellRule>;
  readonly items: Map<string, ItemRule>;
  readonly entries: Map<RuleKey, RuleEntryInfo>;
  readonly unverified: RuleEntryInfo[];
  readonly invalid: InvalidRuleEntry[];
}

function emptyDraft(ruleset: RulesetId): Draft {
  return {
    ruleset,
    species: new Map(),
    lineages: new Map(),
    lineageNames: new Map(),
    subspecies: new Map(),
    classes: new Map(),
    subclasses: new Map(),
    subclassesByClass: new Map(),
    backgrounds: new Map(),
    feats: new Map(),
    spells: new Map(),
    items: new Map(),
    entries: new Map(),
    unverified: [],
    invalid: [],
  };
}

/** Layer 1 for 2024: the TypeScript sources, same object references, same order. */
function addBuiltin2024(d: Draft): void {
  for (const s of SPECIES_SOURCES) d.species.set(s.id, s);
  for (const [speciesId, lineages] of Object.entries(LINEAGE_GRANTS_REGISTRY)) d.lineages.set(speciesId, lineages);
  for (const c of CLASS_SOURCES) d.classes.set(c.id, c);
  for (const [classId, ids] of Object.entries(SUBCLASS_IDS_BY_CLASS) as [ClassId, readonly string[]][]) {
    d.subclassesByClass.set(classId, [...ids]);
  }
  for (const [id, source] of Object.entries(SUBCLASS_SOURCES)) d.subclasses.set(id, source);
  for (const b of BACKGROUND_SOURCES) d.backgrounds.set(b.id, b);
  for (const f of FEAT_SOURCES) d.feats.set(f.id, f);
  for (const s of SPELL_CATALOG as readonly SpellDef[]) d.spells.set(s.id, s);
  for (const i of ITEM_SOURCES) d.items.set(i.id, i);
}

function has(d: Draft, kind: RuleEntryKind, id: string): boolean {
  switch (kind) {
    case 'species':
      return d.species.has(id);
    case 'subspecies':
      return d.subspecies.has(id);
    case 'class':
      return d.classes.has(id);
    case 'subclass':
      return d.subclasses.has(id);
    case 'background':
      return d.backgrounds.has(id);
    case 'feat':
      return d.feats.has(id);
    case 'spell':
      return d.spells.has(id);
    case 'item':
      return d.items.has(id);
  }
}

function info(entry: RuleEntry, layer: RuleEntryInfo['layer'], overrides: boolean, revision?: number): RuleEntryInfo {
  return {
    kind: entry.kind,
    id: entry.id,
    layer,
    overrides,
    name: entry.name,
    ...(entry.summary ? { summary: entry.summary } : {}),
    ...(entry.source ? { source: entry.source } : {}),
    needsReview: entry.needsReview ?? [],
    ...(revision !== undefined ? { revision } : {}),
  };
}

/** Puts a validated entry in the maps, replacing any lower-layer entry of the same kind and id. */
function apply(d: Draft, entry: RuleEntry): void {
  const book = entry.source?.book;
  const withBook = book ? { sourceBook: book } : {};
  switch (entry.kind) {
    case 'species': {
      d.species.set(entry.id, {
        id: entry.id,
        defaultSize: entry.body.size,
        defaultSpeed: entry.body.speed,
        grants: toGrants(entry.body.grants),
        ...withBook,
      });
      if (entry.body.lineages && entry.body.lineages.length > 0) {
        d.lineages.set(entry.id, Object.fromEntries(entry.body.lineages.map((l) => [l.id, toGrants(l.grants)])));
        d.lineageNames.set(entry.id, new Map(entry.body.lineages.map((l) => [l.id, l.name])));
      } else {
        d.lineages.delete(entry.id);
        d.lineageNames.delete(entry.id);
      }
      return;
    }
    case 'subspecies':
      d.subspecies.set(entry.id, { id: entry.id, parent: entry.body.parent, grants: toGrants(entry.body.grants) });
      return;
    case 'class': {
      // A class entry replaces a built-in class (closed ids). It keeps the quick-build hints and the book of the class it
      // replaces. Its `asi` and `subclass` grants are indexed like the built-in ones (n-th asi grant = `asi:class:<id>:n`,
      // stored in the row of the class level that carries it): keep them at the same levels, or stored builds move.
      const replaced = d.classes.get(entry.id);
      d.classes.set(entry.id, {
        id: entry.id,
        primaryAbility: entry.body.primaryAbility,
        levels: entry.body.levels.map((l) => ({ grants: toGrants(l.grants) })),
        ...(replaced?.quickBuild ? { quickBuild: replaced.quickBuild } : {}),
        ...(replaced?.sourceBook ? { sourceBook: replaced.sourceBook } : {}),
      });
      return;
    }
    case 'subclass': {
      d.subclasses.set(entry.id, {
        features: entry.body.features.map((f) => ({ classLevel: f.classLevel, grants: toGrants(f.grants) })),
      });
      // A subclass belongs to exactly one class: move it if a lower layer filed it under another one.
      for (const [classId, ids] of d.subclassesByClass) {
        if (classId !== entry.body.class && ids.includes(entry.id)) {
          d.subclassesByClass.set(
            classId,
            ids.filter((id) => id !== entry.id)
          );
        }
      }
      const list = d.subclassesByClass.get(entry.body.class) ?? [];
      if (!list.includes(entry.id)) d.subclassesByClass.set(entry.body.class, [...list, entry.id]);
      return;
    }
    case 'background':
      d.backgrounds.set(entry.id, { id: entry.id, grants: toGrants(entry.body.grants), ...withBook });
      return;
    case 'feat':
      d.feats.set(entry.id, {
        id: entry.id,
        category: entry.body.category,
        prerequisites: entry.body.prerequisites,
        grants: toGrants(entry.body.grants),
        ...(entry.body.repeatable !== undefined ? { repeatable: entry.body.repeatable } : {}),
        ...withBook,
      });
      return;
    case 'spell': {
      const [first, ...rest] = entry.body.classes;
      d.spells.set(entry.id, {
        id: entry.id,
        level: entry.body.level as SpellDef['level'],
        school: entry.body.school,
        ritual: entry.body.ritual,
        concentration: entry.body.concentration,
        castingTime: entry.body.castingTime,
        range: entry.body.range,
        duration: entry.body.duration,
        components: entry.body.components,
        nativeClasses: [first, ...rest],
        ...withBook,
      });
      return;
    }
    case 'item':
      d.items.set(entry.id, {
        id: entry.id,
        grants: toGrants(entry.body.grants),
        requiresAttunement: entry.body.requiresAttunement,
        ...withBook,
      });
      return;
  }
}

function addLayer(
  d: Draft,
  layer: Exclude<RuleLayer, 'builtin-2024'>,
  rows: readonly { readonly kind: string; readonly id: string; readonly content: unknown; readonly revision?: number }[]
): void {
  for (const row of rows) {
    const parsed = parseRuleEntry(row.content);
    if (!parsed.ok) {
      d.invalid.push({ kind: row.kind, id: row.id, issues: parsed.issues });
      logger.warn(`Ignored invalid rule entry ${row.kind}:${row.id} (${layer}): ${parsed.issues[0]?.message ?? ''}`);
      continue;
    }
    const entry = parsed.entry;
    if (entry.kind !== row.kind || entry.id !== row.id) {
      const issue = { path: '', message: `content describes ${entry.kind}:${entry.id}, row is ${row.kind}:${row.id}` };
      d.invalid.push({ kind: row.kind, id: row.id, issues: [issue] });
      logger.warn(`Ignored rule entry ${row.kind}:${row.id} (${layer}): ${issue.message}`);
      continue;
    }
    const overrides = has(d, entry.kind, entry.id);
    const meta = info(entry, layer, overrides, row.revision);
    if (meta.needsReview.length > 0) {
      d.unverified.push(meta);
      continue;
    }
    apply(d, entry);
    d.entries.set(ruleKey(entry.kind, entry.id), meta);
  }
}

/**
 * Story 9.5: a subspecies is offered as a lineage of its parent species. Its grants join the parent's lineages (a new
 * object: the built-in lineage maps are shared and never mutated) and its own name joins `lineageNames`, so the engine,
 * the lineage picker and the sheet treat it like any lineage. A subspecies whose parent is not in the rule set, or whose id
 * is already a lineage of the parent, is left out (logged): it stays listed in `subspecies` but is offered to nobody.
 */
function attachSubspecies(d: Draft): void {
  for (const sub of d.subspecies.values()) {
    if (!d.species.has(sub.parent)) {
      logger.warn(`Subspecies ${sub.id} is offered to nobody: no species "${sub.parent}" in the ${d.ruleset} rules`);
      continue;
    }
    const lineages = d.lineages.get(sub.parent) ?? {};
    if (Object.prototype.hasOwnProperty.call(lineages, sub.id)) {
      logger.warn(`Subspecies ${sub.id} is offered to nobody: "${sub.parent}" already has a lineage with that id`);
      continue;
    }
    d.lineages.set(sub.parent, Object.freeze({ ...lineages, [sub.id]: sub.grants }));
    const name = d.entries.get(ruleKey('subspecies', sub.id))?.name;
    if (name) {
      const names = new Map(d.lineageNames.get(sub.parent) ?? []);
      names.set(sub.id, name);
      d.lineageNames.set(sub.parent, names);
    }
  }
}

/**
 * The rule set handed to the engine. Invariant: nobody mutates it. The maps are typed `ReadonlyMap` and the built-in
 * values are the shared objects of `src/lib/sources/*` (one `builtin2024RuleSet()` for the whole app): the object and
 * its lists are frozen, the maps are not (a frozen Map still accepts `set`), so the invariant is kept by the types.
 */
function freeze(d: Draft): RuleSet {
  Object.freeze(d.unverified);
  Object.freeze(d.invalid);
  for (const ids of d.subclassesByClass.values()) Object.freeze(ids);
  return Object.freeze({
    ruleset: d.ruleset,
    species: d.species,
    lineages: d.lineages,
    lineageNames: d.lineageNames,
    subspecies: d.subspecies,
    classes: d.classes,
    subclasses: d.subclasses,
    subclassesByClass: d.subclassesByClass,
    backgrounds: d.backgrounds,
    feats: d.feats,
    spells: d.spells,
    items: d.items,
    entries: d.entries,
    unverified: d.unverified,
    invalid: d.invalid,
  });
}

export interface BuildRuleSetOptions {
  /** Replaces the built-in SRD layer (tests). */
  readonly srdEntries?: readonly unknown[];
}

/**
 * The rules of one edition: built-in layers plus the DM library rows of that edition. Rows of another edition are
 * reported as invalid (the query filters them; this is a guard).
 */
export function buildRuleSet(
  ruleset: RulesetId,
  library: readonly RuleEntryRow[] = [],
  options: BuildRuleSetOptions = {}
): RuleSet {
  const d = emptyDraft(ruleset);
  if (ruleset === '2024') addBuiltin2024(d);

  const srd = options.srdEntries ?? (ruleset === '2014' ? SRD_2014_ENTRIES : []);
  addLayer(
    d,
    'srd-2014',
    srd.map((content) => {
      const c = (content ?? {}) as { kind?: unknown; id?: unknown };
      return { kind: String(c.kind ?? ''), id: String(c.id ?? ''), content };
    })
  );

  const own = library.filter((row) => {
    if (row.ruleset === ruleset) return true;
    d.invalid.push({
      kind: row.kind,
      id: row.id,
      issues: [{ path: '', message: `entry of the ${row.ruleset} rules read for ${ruleset}` }],
    });
    return false;
  });
  addLayer(d, 'library', own);
  attachSubspecies(d);
  return freeze(d);
}

let builtinCache: { readonly key: readonly unknown[]; readonly rules: RuleSet } | null = null;

/**
 * The 2024 rules with no library: the default of every engine entry point, so callers written before story 9.3 behave
 * exactly as before. Built once and reused while the source modules export the same arrays (a test that swaps a source
 * module array gets a rule set rebuilt from it).
 */
export function builtin2024RuleSet(): RuleSet {
  const key = [
    SPECIES_SOURCES,
    LINEAGE_GRANTS_REGISTRY,
    CLASS_SOURCES,
    SUBCLASS_IDS_BY_CLASS,
    SUBCLASS_SOURCES,
    BACKGROUND_SOURCES,
    FEAT_SOURCES,
    SPELL_CATALOG,
    ITEM_SOURCES,
  ];
  if (builtinCache && builtinCache.key.every((value, i) => value === key[i])) return builtinCache.rules;
  builtinCache = { key, rules: buildRuleSet('2024') };
  return builtinCache.rules;
}

/** Spells of a class list (optionally of one level), across every layer. */
export function spellsForList(rules: RuleSet, classId: string, level?: number): readonly SpellRule[] {
  const out: SpellRule[] = [];
  for (const spell of rules.spells.values()) {
    if (
      (spell.nativeClasses as readonly string[]).includes(classId) &&
      (level === undefined || spell.level === level)
    ) {
      out.push(spell);
    }
  }
  return out;
}

/**
 * Subspecies ids offered for a species (story 9.5), in rule set order (SRD by id, then the library). Only those attached
 * as lineages of the species (see `attachSubspecies`).
 */
export function subspeciesOf(rules: RuleSet, speciesId: string): readonly string[] {
  const lineages = rules.lineages.get(speciesId);
  if (!lineages) return [];
  const out: string[] = [];
  for (const sub of rules.subspecies.values()) {
    // Same grants object: attached by `attachSubspecies`, not a lineage of the species that merely shares the id.
    if (
      sub.parent === speciesId &&
      Object.prototype.hasOwnProperty.call(lineages, sub.id) &&
      lineages[sub.id] === sub.grants
    ) {
      out.push(sub.id);
    }
  }
  return out;
}

/**
 * The choice of subspecies of a species, or null when it has none (story 9.5). It is a `lineage-choice` grant: the
 * decision is stored like any lineage (`{ type: 'lineage-choice', lineageId: <subspecies id> }` in the creation row) and
 * expands into the subspecies grants, on top of the species grants. Its key is
 * `lineage-choice:species:<species>:<n>`, n being the first index the species' own lineage choices do not use (0 for
 * every SRD species with subspecies; a species with its own lineage choice, such as the dragonborn, would get 1).
 */
export function subspeciesChoice(rules: RuleSet, speciesId: string): LineageChoiceGrant | null {
  const from = subspeciesOf(rules, speciesId);
  if (from.length === 0) return null;
  const used = new Set(
    (rules.species.get(speciesId)?.grants ?? []).flatMap((g) => (g.type === 'lineage-choice' ? [g.key as string] : []))
  );
  let index = 0;
  while (used.has(createChoiceKey('lineage-choice', 'species', speciesId, index))) index++;
  return {
    type: 'lineage-choice',
    key: createChoiceKey('lineage-choice', 'species', speciesId, index),
    speciesId,
    from,
  };
}

/** Class owning a subclass id in this rule set, or undefined. */
export function classOfSubclass(rules: RuleSet, subclassId: string): ClassId | undefined {
  for (const [classId, ids] of rules.subclassesByClass) {
    if (ids.includes(subclassId)) return classId;
  }
  return undefined;
}

/** Why an id is missing: unverified (needs review) or unknown. Used in engine warnings. */
export function missingReason(rules: RuleSet, kind: RuleEntryKind, id: string): string {
  if (rules.unverified.some((e) => e.kind === kind && e.id === id)) {
    return `the ${kind} "${id}" needs review and can not be used until the DM clears its review notes`;
  }
  if (rules.invalid.some((e) => e.kind === kind && e.id === id)) {
    return `the ${kind} "${id}" is invalid in the rules library and is ignored`;
  }
  return `no ${kind} "${id}" in the ${rules.ruleset} rules`;
}
