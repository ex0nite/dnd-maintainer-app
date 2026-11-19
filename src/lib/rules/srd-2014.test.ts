/**
 * Story 9.5: the generated SRD 5.1 layer of the 2014 rules (species, subspecies, background), resolved by the engine.
 * Each species and subspecies of the SRD is resolved from its generated entry: ability bonuses (species + subspecies),
 * speed, size, languages, traits, proficiencies, resistances.
 */
import { describe, expect, it } from 'vitest';
import { buildRuleSet, builtin2024RuleSet, subspeciesChoice, subspeciesOf } from '@/lib/rules/ruleset';
import { SRD_2014_ENTRIES } from '@/lib/rules/srd-2014';
import { parseRuleEntry } from '@/lib/rules/schemas';
import { ruleKey } from '@/lib/rules/types';
import { collectBundles } from '@/lib/sources';
import { LINEAGE_GRANTS_REGISTRY, SPECIES_SOURCES } from '@/lib/sources/species';
import { resolveCharacter } from '@/lib/resolver';
import { reconstructBuild, type BuildLevelRow } from '@/lib/build-reconstruction';
import type { AbilityKey } from '@/lib/dnd-helpers';
import type { CharacterBuild, ChoiceDecision, ChoiceKey } from '@/types/choices';
import { CLASS_ENTRY, row } from '@/test/rule-fixtures';

const TENS = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const RULES = buildRuleSet('2014');

function build(speciesId: string, choices: Record<string, ChoiceDecision> = {}, backgroundId: string | null = null) {
  return {
    speciesId,
    backgroundId,
    baseAbilities: TENS,
    abilityMethod: 'standard-array',
    levels: [],
    choices: choices as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  } satisfies CharacterBuild;
}

function resolve(b: CharacterBuild, rules = RULES, level = 0) {
  const { bundles, warnings } = collectBundles(b, rules);
  const resolved = resolveCharacter({
    baseAbilities: b.baseAbilities,
    level,
    bundles,
    choices: b.choices,
    rules,
    levels: b.levels,
  });
  return { resolved, warnings, bundles };
}

const lineage = (speciesId: string, lineageId: string): Record<string, ChoiceDecision> => ({
  [`lineage-choice:species:${speciesId}:0`]: { type: 'lineage-choice', lineageId },
});

function totals(r: ReturnType<typeof resolve>['resolved']): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const [k, v] of Object.entries(r.abilities)) if (v.total !== 10) out[k as AbilityKey] = v.total;
  return out;
}

interface Expected {
  readonly abilities: Partial<Record<AbilityKey, number>>;
  readonly speed: number;
  readonly size: string;
  readonly languages: readonly string[];
  readonly features: readonly string[];
  readonly weapons?: readonly string[];
  readonly tools?: readonly string[];
  readonly skills?: readonly string[];
  readonly resistances?: readonly string[];
  /** Pending choices (type:key) left open by the species alone. */
  readonly pending: readonly string[];
}

const SPECIES: Record<string, Expected> = {
  dragonborn: {
    abilities: { str: 12, cha: 11 },
    speed: 30,
    size: 'medium',
    languages: ['common', 'draconic'],
    features: ['draconic-ancestry', 'breath-weapon', 'damage-resistance'],
    pending: ['lineage-choice:lineage-choice:species:dragonborn:0'],
  },
  dwarf: {
    abilities: { con: 12 },
    speed: 25,
    size: 'medium',
    languages: ['common', 'dwarvish'],
    features: ['darkvision', 'dwarven-resilience', 'stonecunning', 'dwarven-combat-training', 'tool-proficiency'],
    weapons: ['battleaxe', 'handaxe', 'lighthammer', 'warhammer'],
    resistances: ['poison'],
    pending: ['tool-choice:tool-choice:species:dwarf:0', 'lineage-choice:lineage-choice:species:dwarf:0'],
  },
  elf: {
    abilities: { dex: 12 },
    speed: 30,
    size: 'medium',
    languages: ['common', 'elvish'],
    features: ['darkvision', 'fey-ancestry', 'trance', 'keen-senses'],
    skills: ['perception'],
    pending: ['lineage-choice:lineage-choice:species:elf:0'],
  },
  gnome: {
    abilities: { int: 12 },
    speed: 25,
    size: 'small',
    languages: ['common', 'gnomish'],
    features: ['darkvision', 'gnome-cunning'],
    pending: ['lineage-choice:lineage-choice:species:gnome:0'],
  },
  'half-elf': {
    abilities: { cha: 12 },
    speed: 30,
    size: 'medium',
    languages: ['common', 'elvish'],
    features: ['darkvision', 'fey-ancestry', 'skill-versatility'],
    pending: [
      'language-choice:language-choice:species:half-elf:0',
      'skill-choice:skill-choice:species:half-elf:0',
      'ability-choice:ability-choice:species:half-elf:0',
    ],
  },
  'half-orc': {
    abilities: { str: 12, con: 11 },
    speed: 30,
    size: 'medium',
    languages: ['common', 'orc'],
    features: ['darkvision', 'savage-attacks', 'relentless-endurance', 'menacing'],
    skills: ['intimidation'],
    pending: [],
  },
  halfling: {
    abilities: { dex: 12 },
    speed: 25,
    size: 'small',
    languages: ['common', 'halfling'],
    features: ['brave', 'halfling-nimbleness', 'lucky'],
    pending: ['lineage-choice:lineage-choice:species:halfling:0'],
  },
  human: {
    abilities: { str: 11, dex: 11, con: 11, int: 11, wis: 11, cha: 11 },
    speed: 30,
    size: 'medium',
    languages: ['common'],
    features: [],
    pending: ['language-choice:language-choice:species:human:0'],
  },
  tiefling: {
    abilities: { int: 11, cha: 12 },
    speed: 30,
    size: 'medium',
    languages: ['common', 'infernal'],
    features: ['darkvision', 'hellish-resistance', 'infernal-legacy'],
    resistances: ['fire'],
    pending: [],
  },
};

function check(r: ReturnType<typeof resolve>['resolved'], speciesId: string, e: Expected) {
  expect(totals(r)).toEqual(e.abilities);
  expect(r.speed.walk?.value).toBe(e.speed);
  expect(RULES.species.get(speciesId)?.defaultSize).toBe(e.size);
  expect(r.languages.map((l) => l.value)).toEqual(e.languages);
  for (const f of e.features) expect(r.features.map((x) => x.feature.id)).toContain(f);
  expect(r.weaponProficiencies.map((w) => w.value)).toEqual(e.weapons ?? []);
  expect(r.toolProficiencies.map((w) => w.value)).toEqual(e.tools ?? []);
  const skills = Object.entries(r.skills)
    .filter(([, s]) => s.proficient)
    .map(([id]) => id);
  expect(skills).toEqual(e.skills ?? []);
  expect(r.resistances.map((x) => x.value)).toEqual(e.resistances ?? []);
}

describe('SRD 2014 layer: the generated entries', () => {
  it('holds the 9 species, 4 subspecies and 1 background of the SRD 5.1, all valid', () => {
    for (const content of SRD_2014_ENTRIES) expect(parseRuleEntry(content).ok).toBe(true);
    expect(RULES.invalid).toEqual([]);
    expect(RULES.unverified).toEqual([]);
    expect([...RULES.species.keys()].sort()).toEqual(Object.keys(SPECIES).sort());
    expect([...RULES.subspecies.keys()]).toEqual(['high-elf', 'hill-dwarf', 'lightfoot-halfling', 'rock-gnome']);
    expect([...RULES.backgrounds.keys()]).toEqual(['acolyte']);
    expect(RULES.entries.get(ruleKey('species', 'dwarf'))).toMatchObject({
      layer: 'srd-2014',
      overrides: false,
      name: { en: 'Dwarf', fr: 'Nain' },
      source: { book: 'srd-5-1' },
    });
  });

  it('keeps every SRD trait as a feature with its name and text', () => {
    const features = SRD_2014_ENTRIES.flatMap((e) => JSON.stringify(e).match(/"type":"feature"/g) ?? []);
    expect(features.length).toBeGreaterThan(30);
    for (const species of RULES.species.values()) {
      for (const g of species.grants) {
        if (g.type === 'feature') {
          expect(g.feature.name).toBeTruthy();
          expect(g.feature.description).toBeTruthy();
        }
      }
    }
  });

  it('has no built-in 2024 rule underneath (no goliath, no 2024 background, no feat, no class)', () => {
    expect(RULES.species.has('goliath')).toBe(false);
    expect(RULES.backgrounds.has('sage')).toBe(false);
    expect(RULES.feats.size).toBe(0);
    expect(RULES.classes.size).toBe(0);
  });
});

describe('SRD 2014 species, resolved alone', () => {
  it.each(Object.entries(SPECIES))('%s', (speciesId, e) => {
    const { resolved, warnings } = resolve(build(speciesId));
    expect(warnings).toEqual([]);
    check(resolved, speciesId, e);
    const species = resolved.pendingChoices.filter((p) => p.source.origin === 'species');
    expect(species.map((p) => `${p.type}:${p.choiceKey}`).sort()).toEqual([...e.pending].sort());
  });
});

describe('SRD 2014 subspecies: grants added to the parent species', () => {
  it('offers the subspecies of a species as a lineage choice', () => {
    expect(subspeciesOf(RULES, 'dwarf')).toEqual(['hill-dwarf']);
    expect(subspeciesOf(RULES, 'human')).toEqual([]);
    expect(subspeciesChoice(RULES, 'dwarf')).toEqual({
      type: 'lineage-choice',
      key: 'lineage-choice:species:dwarf:0',
      speciesId: 'dwarf',
      from: ['hill-dwarf'],
    });
    expect(subspeciesChoice(RULES, 'dragonborn')).toBeNull();
    expect(RULES.lineageNames.get('dwarf')?.get('hill-dwarf')).toEqual({ en: 'Hill Dwarf', fr: 'Nain des collines' });
  });

  it('hill dwarf: CON +2 and WIS +1, dwarf traits plus Dwarven Toughness (+1 HP per level)', () => {
    const rules = buildRuleSet('2014', [row(CLASS_ENTRY, '2014')]);
    const b = {
      ...build('dwarf', lineage('dwarf', 'hill-dwarf')),
      levels: [
        { classId: 'wizard' as const, classLevel: 1, hpRoll: null },
        { classId: 'wizard' as const, classLevel: 2, hpRoll: null },
      ],
    };
    const { resolved } = resolve(b, rules, 2);
    check(resolved, 'dwarf', {
      ...SPECIES.dwarf,
      abilities: { con: 12, wis: 11 },
      features: [...SPECIES.dwarf.features, 'dwarven-toughness'],
    });
    // d6 wizard of the fixture: 6 + 4 (average) + 2 x CON +1 + 2 x Dwarven Toughness
    expect(resolved.hitPoints.max).toBe(6 + 4 + 2 + 2);
    expect(resolved.pendingChoices.some((p) => p.type === 'lineage-choice')).toBe(false);
  });

  it('high elf: DEX +2 and INT +1, elf weapon training, an extra language of choice', () => {
    const { resolved } = resolve(
      build('elf', {
        ...lineage('elf', 'high-elf'),
        'language-choice:species:high-elf:0': { type: 'language-choice', languages: ['draconic'] },
      })
    );
    check(resolved, 'elf', {
      ...SPECIES.elf,
      abilities: { dex: 12, int: 11 },
      languages: ['common', 'elvish', 'draconic'],
      features: [...SPECIES.elf.features, 'elf-weapon-training', 'high-elf-cantrip', 'extra-language'],
      weapons: ['longsword', 'shortsword', 'shortbow', 'longbow'],
    });
    expect(resolved.pendingChoices).toEqual([]);
  });

  it('lightfoot halfling: DEX +2 and CHA +1, Naturally Stealthy', () => {
    const { resolved } = resolve(build('halfling', lineage('halfling', 'lightfoot-halfling')));
    check(resolved, 'halfling', {
      ...SPECIES.halfling,
      abilities: { dex: 12, cha: 11 },
      features: [...SPECIES.halfling.features, 'naturally-stealthy'],
    });
  });

  it("rock gnome: INT +2 and CON +1, Artificer's Lore, Tinker and tinker's tools", () => {
    const { resolved } = resolve(build('gnome', lineage('gnome', 'rock-gnome')));
    check(resolved, 'gnome', {
      ...SPECIES.gnome,
      abilities: { int: 12, con: 11 },
      features: [...SPECIES.gnome.features, 'artificers-lore', 'tinker'],
      tools: ['tinkerstools'],
    });
  });

  it('an unknown subspecies, or one of another species, warns and adds nothing', () => {
    for (const id of ['mountain-dwarf', 'high-elf', 'constructor']) {
      const { resolved, warnings } = resolve(build('dwarf', lineage('dwarf', id)));
      expect(warnings.some((w) => w.includes(`lineage "${id}"`))).toBe(true);
      expect(totals(resolved)).toEqual({ con: 12 });
    }
  });

  it('a library subspecies joins the SRD ones, with its own name; one with no parent is offered to nobody', () => {
    const sub = (id: string, parent: string) => ({
      schema: 1,
      kind: 'subspecies',
      id,
      name: { en: `Test ${id}` },
      body: { parent, grants: [{ type: 'ability-bonus', ability: 'str', bonus: 1 }] },
    });
    const rules = buildRuleSet('2014', [
      { ruleset: '2014', kind: 'subspecies', id: 'test-deep-dwarf', content: sub('test-deep-dwarf', 'dwarf') },
      { ruleset: '2014', kind: 'subspecies', id: 'test-orphan', content: sub('test-orphan', 'test-nobody') },
      { ruleset: '2014', kind: 'subspecies', id: 'test-scaled', content: sub('test-scaled', 'dragonborn') },
    ]);
    expect(subspeciesOf(rules, 'dwarf')).toEqual(['hill-dwarf', 'test-deep-dwarf']);
    expect(rules.lineageNames.get('dwarf')?.get('test-deep-dwarf')).toEqual({ en: 'Test test-deep-dwarf' });
    expect(rules.subspecies.has('test-orphan')).toBe(true);
    expect([...rules.lineages.values()].some((l) => 'test-orphan' in l)).toBe(false);
    // The dragonborn's own ancestry choice keeps index 0: the subspecies choice takes the next one.
    expect(subspeciesChoice(rules, 'dragonborn')?.key).toBe('lineage-choice:species:dragonborn:1');
    const { resolved } = resolve(
      build('dragonborn', {
        ...lineage('dragonborn', 'red'),
        'lineage-choice:species:dragonborn:1': { type: 'lineage-choice', lineageId: 'test-scaled' },
      }),
      rules
    );
    expect(totals(resolved)).toEqual({ str: 13, cha: 11 });
    expect(resolved.resistances.map((r) => r.value)).toEqual(['fire']);
  });
});

describe('SRD 2014 choices of the species', () => {
  it('dragonborn: an ancestry gives its resistance and its breath weapon', () => {
    const { resolved } = resolve(build('dragonborn', lineage('dragonborn', 'blue')));
    expect(resolved.resistances.map((r) => r.value)).toEqual(['lightning']);
    expect(resolved.features.map((f) => f.feature.id)).toContain('draconic-ancestry-blue');
    const breath = resolved.features.find((f) => f.feature.id === 'breath-weapon');
    expect(breath?.feature.usesPerRest).toBe('short');
    expect(breath?.saveDC).toBe(8 + resolved.proficiencyBonus + resolved.abilities.con.modifier);
    expect(RULES.lineageNames.get('dragonborn')?.get('brass')).toEqual({ en: 'Brass', fr: 'Airain' });
    expect(subspeciesOf(RULES, 'dragonborn')).toEqual([]);
  });

  it('half-elf: +1 to two abilities of choice, two skills, one language', () => {
    const { resolved } = resolve(
      build('half-elf', {
        'ability-choice:species:half-elf:0': { type: 'ability-choice', abilities: ['str', 'dex'] },
        'skill-choice:species:half-elf:0': { type: 'skill-choice', skills: ['stealth', 'arcana'] },
        'language-choice:species:half-elf:0': { type: 'language-choice', languages: ['sylvan'] },
      })
    );
    expect(totals(resolved)).toEqual({ str: 11, dex: 11, cha: 12 });
    expect(resolved.skills.stealth.proficient && resolved.skills.arcana.proficient).toBe(true);
    expect(resolved.languages.map((l) => l.value)).toContain('sylvan');
    expect(resolved.pendingChoices).toEqual([]);
  });

  it('dwarf: one artisan tool among three', () => {
    const { resolved } = resolve(
      build('dwarf', { 'tool-choice:species:dwarf:0': { type: 'tool-choice', tools: ['smithstools'] } })
    );
    expect(resolved.toolProficiencies.map((t) => t.value)).toEqual(['smithstools']);
  });
});

describe('SRD 2014 background: acolyte', () => {
  it('gives skills, two languages of choice and its feature as text, no ability bonus and no feat', () => {
    const { resolved, warnings } = resolve(
      build(
        'human',
        { 'language-choice:background:acolyte:0': { type: 'language-choice', languages: ['celestial', 'giant'] } },
        'acolyte'
      )
    );
    expect(warnings).toEqual([]);
    expect(resolved.skills.insight.proficient && resolved.skills.religion.proficient).toBe(true);
    expect(resolved.languages.map((l) => l.value)).toEqual(['common', 'celestial', 'giant']);
    expect(resolved.features.map((f) => f.feature.id)).toEqual([
      'acolyte-shelter-of-the-faithful',
      'acolyte-equipment',
    ]);
    expect(totals(resolved)).toEqual(SPECIES.human.abilities);
    const background = RULES.backgrounds.get('acolyte');
    expect(background?.grants.some((g) => ['ability-choice', 'asi', 'feat', 'feat-choice'].includes(g.type))).toBe(
      false
    );
    expect(resolved.pendingChoices.filter((p) => p.source.origin === 'background')).toEqual([]);
  });
});

describe('reconstructBuild with a subspecies', () => {
  it('reads the subspecies decision of the creation row and resolves it', () => {
    const rows: BuildLevelRow[] = [
      {
        sequence: 0,
        base_abilities: TENS,
        ability_method: 'standard-array',
        choices: { 'lineage-choice:species:halfling:0': { type: 'lineage-choice', lineageId: 'lightfoot-halfling' } },
        deleted_at: null,
      },
    ];
    const warnings: string[] = [];
    const b = reconstructBuild(
      { species: 'halfling', background: 'acolyte' },
      rows,
      [],
      (w) => warnings.push(w),
      RULES
    );
    expect(warnings).toEqual([]);
    expect(b.backgroundId).toBe('acolyte');
    expect(totals(resolve(b).resolved)).toEqual({ dex: 12, cha: 11 });
  });

  it('keeps a stale subspecies decision readable (warning from collectBundles, no crash)', () => {
    const rows: BuildLevelRow[] = [
      {
        sequence: 0,
        base_abilities: TENS,
        ability_method: 'standard-array',
        choices: { 'lineage-choice:species:dwarf:0': { type: 'lineage-choice', lineageId: 'mountain-dwarf' } },
        deleted_at: null,
      },
    ];
    const b = reconstructBuild({ species: 'dwarf', background: null }, rows, [], undefined, RULES);
    const { warnings } = resolve(b);
    expect(warnings.some((w) => w.includes('mountain-dwarf'))).toBe(true);
  });
});

describe('2024 rules unchanged', () => {
  it('opens no subspecies choice for any built-in species', () => {
    const rules = builtin2024RuleSet();
    for (const species of SPECIES_SOURCES) {
      expect(subspeciesChoice(rules, species.id)).toBeNull();
      const { bundles } = collectBundles(build(species.id), rules);
      expect(bundles.filter((b) => b.source.origin === 'species')).toHaveLength(1);
    }
    for (const [speciesId, lineages] of Object.entries(LINEAGE_GRANTS_REGISTRY)) {
      expect(rules.lineages.get(speciesId)).toBe(lineages);
    }
  });

  it('a 2024 library subspecies never mutates the shared built-in lineages', () => {
    const before = Object.keys(LINEAGE_GRANTS_REGISTRY.elf);
    const rules = buildRuleSet('2024', [
      {
        ruleset: '2024',
        kind: 'subspecies',
        id: 'test-moon-elf',
        content: {
          schema: 1,
          kind: 'subspecies',
          id: 'test-moon-elf',
          name: { en: 'Moon Elf' },
          body: { parent: 'elf', grants: [] },
        },
      },
    ]);
    expect(Object.keys(LINEAGE_GRANTS_REGISTRY.elf)).toEqual(before);
    expect(rules.lineages.get('elf')).not.toBe(LINEAGE_GRANTS_REGISTRY.elf);
    // The elf has its own lineage choice at index 0: the subspecies choice comes after it.
    expect(subspeciesChoice(rules, 'elf')?.key).toBe('lineage-choice:species:elf:1');
  });

  it('a subspecies whose id is already a lineage of its species is offered to nobody', () => {
    const rules = buildRuleSet('2024', [
      {
        ruleset: '2024',
        kind: 'subspecies',
        id: 'high-elf',
        content: {
          schema: 1,
          kind: 'subspecies',
          id: 'high-elf',
          name: { en: 'Clashing High Elf' },
          body: { parent: 'elf', grants: [{ type: 'ability-bonus', ability: 'int', bonus: 1 }] },
        },
      },
    ]);
    expect(rules.lineages.get('elf')).toBe(LINEAGE_GRANTS_REGISTRY.elf);
    expect(subspeciesOf(rules, 'elf')).toEqual([]);
    expect(subspeciesChoice(rules, 'elf')).toBeNull();
  });
});
