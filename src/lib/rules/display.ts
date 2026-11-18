/**
 * Display names of rule entities. An entry of the SRD or of the DM library shows its own name (French when the
 * interface is in French and the entry has one, else English); a built-in entity shows its `gamedata` key.
 *
 * Text written by the DM is returned as is: it never goes through i18next (no `defaultValue`, no interpolation).
 */
import { DND_CLASSES, isBackgroundId, isFeatId, isSpeciesId, type ClassId } from '@/lib/dnd-helpers';
import type { LocalizedName, RuleEntryKind } from '@/lib/rules/schemas';
import { ruleKey, type RuleEntryInfo, type RuleSet } from '@/lib/rules/types';
import { isSpellId } from '@/lib/sources/spells';
import { isSubclassId } from '@/lib/sources/subclasses';

export type NamedRuleKind = Extract<
  RuleEntryKind,
  'species' | 'class' | 'subclass' | 'background' | 'feat' | 'spell' | 'item'
>;

/** The minimal `t` of the `gamedata` namespace this module needs (keeps it testable without i18next). */
export type GamedataT = (key: string) => string;

export function localizedName(name: LocalizedName, language: string): string {
  return language.startsWith('fr') && name.fr ? name.fr : name.en;
}

const CLASS_IDS: readonly string[] = DND_CLASSES.map((c) => c.id);
function isClassId(id: string): id is ClassId {
  return CLASS_IDS.includes(id);
}

/** The `gamedata` key of a built-in entity, or undefined when the id is not built-in. */
export function gamedataKey(kind: NamedRuleKind, id: string): string | undefined {
  switch (kind) {
    case 'species':
      return isSpeciesId(id) ? `species.${id}` : undefined;
    case 'class':
      return isClassId(id) ? `classes.${id}` : undefined;
    case 'subclass':
      return isSubclassId(id) ? `subclasses.${id}.name` : undefined;
    case 'background':
      return isBackgroundId(id) ? `backgrounds.${id}` : undefined;
    case 'feat':
      return isFeatId(id) ? `feats.${id}.name` : undefined;
    case 'spell':
      return isSpellId(id) ? `spells.${id}.name` : undefined;
    case 'item':
      // Library items are magic items with grants; the built-in layer has none, catalog items keep their own keys.
      return undefined;
  }
}

/** True when the rule set holds a usable entity of that kind and id (any layer). */
export function hasRule(rules: RuleSet, kind: RuleEntryKind, id: string): boolean {
  switch (kind) {
    case 'species':
      return rules.species.has(id);
    case 'subspecies':
      return rules.subspecies.has(id);
    case 'class':
      return rules.classes.has(id);
    case 'subclass':
      return rules.subclasses.has(id);
    case 'background':
      return rules.backgrounds.has(id);
    case 'feat':
      return rules.feats.has(id);
    case 'spell':
      return rules.spells.has(id);
    case 'item':
      return rules.items.has(id);
  }
}

/**
 * The entry whose own texts describe an id: the effective SRD or library entry; an unverified entry only when nothing
 * usable carries that id (an unverified override must not rename the built-in rule that stays in force).
 */
export function ownEntry(rules: RuleSet, kind: NamedRuleKind, id: string): RuleEntryInfo | undefined {
  const effective = rules.entries.get(ruleKey(kind, id));
  if (effective) return effective;
  if (hasRule(rules, kind, id)) return undefined;
  return rules.unverified.find((e) => e.kind === kind && e.id === id);
}

/**
 * Name to show for an entity of the rule set: own name of an SRD or library entry, else the `gamedata` translation,
 * else the raw id (never empty, never a raw translation key).
 */
export function ruleDisplayName(
  rules: RuleSet,
  kind: NamedRuleKind,
  id: string,
  language: string,
  t: GamedataT
): string {
  const info = ownEntry(rules, kind, id);
  if (info) return localizedName(info.name, language);
  const key = gamedataKey(kind, id);
  // Built-in names are translated exactly as the screens did before story 9.3 (no default value).
  return key ? t(key) : id;
}

/** Own summary of an SRD or library entry in the interface language (English as fallback), if any. */
export function ruleSummary(rules: RuleSet, kind: NamedRuleKind, id: string, language: string): string | undefined {
  const summary = ownEntry(rules, kind, id)?.summary;
  if (!summary) return undefined;
  return (language.startsWith('fr') ? summary.fr : undefined) ?? summary.en ?? summary.fr;
}

const ENTITY_KEYS: readonly {
  readonly pattern: RegExp;
  readonly kind: NamedRuleKind;
  readonly part: 'name' | 'summary';
}[] = [
  { pattern: /^species\.([^.]+)$/, kind: 'species', part: 'name' },
  { pattern: /^classes\.([^.]+)$/, kind: 'class', part: 'name' },
  { pattern: /^subclasses\.([^.]+)\.name$/, kind: 'subclass', part: 'name' },
  { pattern: /^subclasses\.([^.]+)\.description$/, kind: 'subclass', part: 'summary' },
  { pattern: /^backgrounds\.([^.]+)$/, kind: 'background', part: 'name' },
  { pattern: /^feats\.([^.]+)\.name$/, kind: 'feat', part: 'name' },
  { pattern: /^feats\.([^.]+)\.description$/, kind: 'feat', part: 'summary' },
  { pattern: /^spells\.([^.]+)\.name$/, kind: 'spell', part: 'name' },
];

/**
 * Wraps a `gamedata` translator so that every entity key (`species.<id>`, `classes.<id>`, `subclasses.<id>.name`,
 * `backgrounds.<id>`, `feats.<id>.name|description`, `spells.<id>.name`) answers with the rule set:
 *   - an SRD or library entry: its own name or summary, returned verbatim (never interpolated by i18next);
 *   - a built-in id: the original translator, called with the same arguments (unchanged behaviour);
 *   - an unknown id: the caller's `defaultValue` when it gave one, else the id (never a raw key such as
 *     `species.test-elfkin`).
 * Other keys go to the original translator. Pure: used by the screens and by non-React code (PDF export).
 */
export function ruleAwareT<T>(rules: RuleSet, language: string, t: T): T {
  const call = t as unknown as (key: string, ...rest: unknown[]) => string;
  const wrapped = (key: string, ...rest: unknown[]): string => {
    for (const { pattern, kind, part } of ENTITY_KEYS) {
      const match = pattern.exec(key);
      if (!match) continue;
      const id = match[1];
      const info = ownEntry(rules, kind, id);
      if (info) {
        if (part === 'name') return localizedName(info.name, language);
        return ruleSummary(rules, kind, id, language) ?? '';
      }
      if (gamedataKey(kind, id) !== undefined) return call(key, ...rest);
      const options = rest[0] as { readonly defaultValue?: unknown } | undefined;
      if (typeof options?.defaultValue === 'string') return options.defaultValue;
      return part === 'name' ? id : '';
    }
    return call(key, ...rest);
  };
  return wrapped as unknown as T;
}
