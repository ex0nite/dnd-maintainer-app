/**
 * Invented rule entries for tests (no book text, story 9.3). One valid entry per kind.
 * Test code only.
 */
import type { RuleEntryRow } from '@/lib/rules/ruleset';

export const SPECIES_ENTRY = {
  schema: 1,
  kind: 'species',
  id: 'test-elfkin',
  name: { en: 'Elfkin', fr: 'Elfelin' },
  source: { book: 'homebrew', page: 4 },
  summary: { en: 'Small folk of the test woods.', fr: 'Petit peuple des bois de test.' },
  body: {
    size: 'small',
    speed: 25,
    grants: [
      { type: 'ability-bonus', ability: 'dex', bonus: 2 },
      { type: 'proficiency', category: 'skill', id: 'stealth' },
      {
        type: 'lineage-choice',
        key: 'lineage-choice:species:test-elfkin:0',
        speciesId: 'test-elfkin',
        from: ['dusk', 'dawn'],
      },
    ],
    lineages: [
      {
        id: 'dusk',
        name: { en: 'Dusk kin', fr: 'Parentèle du crépuscule' },
        grants: [{ type: 'resistance', damageType: 'necrotic' }],
      },
      { id: 'dawn', name: { en: 'Dawn kin' }, grants: [{ type: 'resistance', damageType: 'radiant' }] },
    ],
  },
} as const;

export const SUBSPECIES_ENTRY = {
  schema: 1,
  kind: 'subspecies',
  id: 'test-hill-folk',
  name: { en: 'Hill Folk' },
  body: { parent: 'test-elfkin', grants: [{ type: 'hp-bonus', perLevel: 1 }] },
} as const;

export const CLASS_ENTRY = {
  schema: 1,
  kind: 'class',
  id: 'wizard',
  name: { en: 'Test Wizard', fr: 'Magicien de test' },
  body: {
    primaryAbility: 'int',
    levels: [
      {
        grants: [
          { type: 'hit-die', die: 6 },
          { type: 'proficiency', category: 'saving-throw', id: 'int' },
          { type: 'spellcasting', ability: 'int', source: 'class' },
        ],
      },
      { grants: [] },
      { grants: [{ type: 'subclass', classId: 'wizard', key: 'subclass:class:wizard:0' }] },
    ],
  },
} as const;

export const SUBCLASS_ENTRY = {
  schema: 1,
  kind: 'subclass',
  id: 'test-circle',
  name: { en: 'Circle of Testing', fr: 'Cercle du Test' },
  summary: { en: 'Druids who test everything twice.' },
  body: {
    class: 'druid',
    chosenAtClassLevel: 3,
    features: [
      {
        classLevel: 3,
        grants: [
          {
            type: 'feature',
            feature: { id: 'test-circle-gift', name: 'Gift of Tests', description: 'You test twice.' },
          },
          { type: 'spell', spellId: 'test-spark', alwaysPrepared: true },
        ],
      },
      { classLevel: 6, grants: [{ type: 'resistance', damageType: 'poison' }] },
    ],
  },
} as const;

export const BACKGROUND_ENTRY = {
  schema: 1,
  kind: 'background',
  id: 'test-hermitage',
  name: { en: 'Hermitage' },
  body: {
    grants: [
      { type: 'proficiency', category: 'skill', id: 'religion' },
      { type: 'feat', featId: 'test-grit' },
    ],
  },
} as const;

export const FEAT_ENTRY = {
  schema: 1,
  kind: 'feat',
  id: 'test-grit',
  name: { en: 'Grit', fr: 'Cran' },
  body: {
    category: 'origin',
    prerequisites: [],
    grants: [{ type: 'hp-bonus', perLevel: 1 }],
  },
} as const;

export const SPELL_ENTRY = {
  schema: 1,
  kind: 'spell',
  id: 'test-spark',
  name: { en: 'Spark' },
  body: {
    level: 0,
    school: 'evocation',
    ritual: false,
    concentration: false,
    castingTime: '1 action',
    range: '30 feet',
    duration: 'Instantaneous',
    components: { verbal: true, somatic: false, material: false },
    classes: ['wizard', 'druid', 'bard'],
  },
} as const;

export const ITEM_ENTRY = {
  schema: 1,
  kind: 'item',
  id: 'test-charm',
  name: { en: 'Test Charm' },
  body: { requiresAttunement: true, grants: [{ type: 'ac-bonus', bonus: 1 }] },
} as const;

export const ALL_ENTRIES = [
  SPECIES_ENTRY,
  SUBSPECIES_ENTRY,
  CLASS_ENTRY,
  SUBCLASS_ENTRY,
  BACKGROUND_ENTRY,
  FEAT_ENTRY,
  SPELL_ENTRY,
  ITEM_ENTRY,
] as const;

/** A library row of the 2024 edition for an entry. */
export function row(content: { readonly kind: string; readonly id: string }, ruleset = '2024'): RuleEntryRow {
  return { ruleset, kind: content.kind, id: content.id, content, revision: 1 };
}

/** Deep copy with a change, for refusal tests. */
export function withChange<T>(entry: T, change: (copy: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
  change(copy);
  return copy;
}
