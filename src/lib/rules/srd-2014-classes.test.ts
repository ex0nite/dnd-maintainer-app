/**
 * Story 9.6: the generated SRD 5.1 classes and subclasses of the 2014 rules, resolved level by level (1 to 20).
 *
 * The expectations below are written by hand from the SRD 5.1 class tables (hit die, saving throws, skill choices,
 * proficiencies, Ability Score Improvement levels, level of the subclass choice, starting equipment), not derived from
 * the generated JSON, so a conversion error can not agree with itself.
 */
import { describe, expect, it } from 'vitest';
import { buildRuleSet, builtin2024RuleSet } from '@/lib/rules/ruleset';
import { SRD_2014_ENTRIES } from '@/lib/rules/srd-2014';
import { parseRuleEntry } from '@/lib/rules/schemas';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import { DND_CLASSES, type AbilityKey, type ClassId } from '@/lib/dnd-helpers';
import type { BuildLevel, CharacterBuild, ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { Grant } from '@/types/grants';

const RULES = buildRuleSet('2014');
const TENS = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

interface ClassFacts {
  readonly die: number;
  readonly saves: readonly AbilityKey[];
  readonly skillCount: number;
  readonly skillPool: readonly string[] | 'any';
  readonly armor: readonly string[];
  readonly weapons: readonly string[];
  readonly tools: readonly string[];
  /** Class levels with an Ability Score Improvement (SRD class tables). */
  readonly asi: readonly number[];
  /** Class level at which the subclass is chosen. */
  readonly subclassAt: number;
  readonly subclass: string;
  readonly equipment: readonly RegExp[];
}

const STANDARD_ASI = [4, 8, 12, 16, 19];

const FACTS: Record<ClassId, ClassFacts> = {
  barbarian: {
    die: 12,
    saves: ['str', 'con'],
    skillCount: 2,
    skillPool: ['animalhandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    armor: ['light', 'medium', 'shields'],
    weapons: ['simple', 'martial'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 3,
    subclass: 'berserker',
    equipment: [/greataxe/, /two handaxes/, /Explorer.s Pack/i, /4 Javelin/i],
  },
  bard: {
    die: 8,
    saves: ['dex', 'cha'],
    skillCount: 3,
    skillPool: 'any',
    armor: ['light'],
    weapons: ['simple', 'handcrossbow', 'longsword', 'rapier', 'shortsword'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 3,
    subclass: 'lore',
    equipment: [/rapier/, /diplomat.s pack/, /lute/, /Leather Armor/i, /Dagger/i],
  },
  cleric: {
    die: 8,
    saves: ['wis', 'cha'],
    skillCount: 2,
    skillPool: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    armor: ['light', 'medium', 'shields'],
    weapons: ['simple'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 1,
    subclass: 'life',
    equipment: [/mace/, /scale mail/, /priest.s pack/, /holy symbol/, /Shield/],
  },
  druid: {
    die: 8,
    saves: ['int', 'wis'],
    skillCount: 2,
    skillPool: ['arcana', 'animalhandling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
    armor: ['light', 'medium-nonmetal', 'shields-nonmetal'],
    weapons: ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'],
    tools: ['herbalismkit'],
    asi: STANDARD_ASI,
    subclassAt: 2,
    subclass: 'land',
    equipment: [/wooden shield/, /scimitar/, /druidic focus/, /Leather Armor/i, /Explorer.s Pack/i],
  },
  fighter: {
    die: 10,
    saves: ['str', 'con'],
    skillCount: 2,
    skillPool: [
      'acrobatics',
      'animalhandling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'survival',
    ],
    armor: ['light', 'medium', 'heavy', 'shields'],
    weapons: ['simple', 'martial'],
    tools: [],
    asi: [4, 6, 8, 12, 14, 16, 19],
    subclassAt: 3,
    subclass: 'champion',
    equipment: [/chain mail/, /longbow/, /two martial weapons/, /dungeoneer.s pack/],
  },
  monk: {
    die: 8,
    saves: ['str', 'dex'],
    skillCount: 2,
    skillPool: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    armor: [],
    weapons: ['simple', 'shortsword'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 3,
    subclass: 'open-hand',
    equipment: [/shortsword/, /dungeoneer.s pack/, /10 Dart/i],
  },
  paladin: {
    die: 10,
    saves: ['wis', 'cha'],
    skillCount: 2,
    skillPool: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    armor: ['light', 'medium', 'heavy', 'shields'],
    weapons: ['simple', 'martial'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 3,
    subclass: 'devotion',
    equipment: [/martial weapon and a shield/, /five javelins/, /priest.s pack/, /holy symbol/, /Chain Mail/i],
  },
  ranger: {
    die: 10,
    saves: ['str', 'dex'],
    skillCount: 3,
    skillPool: [
      'animalhandling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
    armor: ['light', 'medium', 'shields'],
    weapons: ['simple', 'martial'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 3,
    subclass: 'hunter',
    equipment: [/scale mail/, /two shortswords/, /dungeoneer.s pack/, /Longbow/i, /20 Arrow/i],
  },
  rogue: {
    die: 8,
    saves: ['dex', 'int'],
    skillCount: 4,
    skillPool: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'performance',
      'persuasion',
      'sleightofhand',
      'stealth',
    ],
    armor: ['light'],
    weapons: ['simple', 'handcrossbow', 'longsword', 'rapier', 'shortsword'],
    tools: ['thievestools'],
    asi: [4, 8, 10, 12, 16, 19],
    subclassAt: 3,
    subclass: 'thief',
    equipment: [/rapier/, /shortbow/, /burglar.s pack/, /2 Dagger/i, /Thieves. Tools/i],
  },
  sorcerer: {
    die: 6,
    saves: ['con', 'cha'],
    skillCount: 2,
    skillPool: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    armor: [],
    weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'lightcrossbow'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 1,
    subclass: 'draconic',
    equipment: [/light crossbow/, /component pouch/, /dungeoneer.s pack/, /2 Dagger/i],
  },
  warlock: {
    die: 8,
    saves: ['wis', 'cha'],
    skillCount: 2,
    skillPool: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'],
    armor: ['light'],
    weapons: ['simple'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 1,
    subclass: 'fiend',
    equipment: [/light crossbow/, /component pouch/, /scholar.s pack/, /Leather Armor/i, /2 Dagger/i],
  },
  wizard: {
    die: 6,
    saves: ['int', 'wis'],
    skillCount: 2,
    skillPool: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    armor: [],
    weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'lightcrossbow'],
    tools: [],
    asi: STANDARD_ASI,
    subclassAt: 2,
    subclass: 'evocation',
    equipment: [/quarterstaff/, /component pouch/, /scholar.s pack/, /Spellbook/i],
  },
};

const CLASS_IDS = Object.keys(FACTS) as ClassId[];

function levelsOf(classId: ClassId, count: number): BuildLevel[] {
  return Array.from({ length: count }, (_, i) => ({ classId, classLevel: i + 1, hpRoll: null }));
}

function resolveAt(classId: ClassId, level: number, choices: Record<string, ChoiceDecision> = {}) {
  const build = {
    speciesId: 'human',
    backgroundId: null,
    baseAbilities: TENS,
    abilityMethod: 'standard-array',
    levels: levelsOf(classId, level),
    choices: choices as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  } satisfies CharacterBuild;
  const { bundles, warnings } = collectBundles(build, RULES);
  const resolved = resolveCharacter({
    baseAbilities: TENS,
    level,
    bundles,
    choices: build.choices,
    rules: RULES,
    levels: build.levels,
  });
  return { resolved, warnings, bundles };
}

const classGrants = (classId: string, level: number): Grant[] =>
  (RULES.classes.get(classId)?.levels[level - 1]?.grants ?? []) as Grant[];

describe('SRD 2014 classes: the data layer', () => {
  it('holds the 12 classes and the 12 subclasses of the SRD 5.1, all valid, none overriding a built-in rule', () => {
    expect([...RULES.classes.keys()].sort()).toEqual([...CLASS_IDS].sort());
    expect(RULES.classes.size).toBe(DND_CLASSES.length);
    expect([...RULES.subclasses.keys()].sort()).toEqual(CLASS_IDS.map((c) => FACTS[c].subclass).sort());
    for (const content of SRD_2014_ENTRIES) expect(parseRuleEntry(content).ok).toBe(true);
    expect(RULES.invalid).toEqual([]);
    expect(RULES.unverified).toEqual([]);
    for (const info of RULES.entries.values()) expect(info.overrides).toBe(false);
  });

  it.each(CLASS_IDS)('%s has 20 levels and its subclass belongs to it', (classId) => {
    expect(RULES.classes.get(classId)?.levels).toHaveLength(20);
    expect(RULES.subclassesByClass.get(classId)).toEqual([FACTS[classId].subclass]);
  });

  it('has no weapon mastery anywhere (2014 rules)', () => {
    for (const classId of CLASS_IDS) {
      for (let level = 1; level <= 20; level++) {
        expect(classGrants(classId, level).some((g) => g.type === 'weapon-mastery-choice')).toBe(false);
      }
    }
    expect(JSON.stringify(SRD_2014_ENTRIES)).not.toMatch(/weapon-mastery/);
  });

  it('has no feat choice at an Ability Score Improvement (feats are an optional rule in 2014)', () => {
    for (const classId of CLASS_IDS) {
      for (let level = 1; level <= 20; level++) {
        expect(classGrants(classId, level).some((g) => g.type === 'feat-choice')).toBe(false);
      }
    }
  });

  it('keeps every feature id unique inside a class and inside a subclass', () => {
    for (const entry of SRD_2014_ENTRIES as readonly { kind: string; id: string }[]) {
      if (entry.kind !== 'class' && entry.kind !== 'subclass') continue;
      const ids = [...JSON.stringify(entry).matchAll(/"feature":\{"id":"([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, `${entry.kind} ${entry.id}`).toBe(ids.length);
    }
  });
});

describe.each(CLASS_IDS)('SRD 2014 class %s, level by level', (classId) => {
  const facts = FACTS[classId];

  it('level 1: hit die, saving throws, proficiencies, skill choice and starting equipment', () => {
    const grants = classGrants(classId, 1);
    expect(grants.find((g) => g.type === 'hit-die')).toEqual({ type: 'hit-die', die: facts.die });
    const proficiency = (category: string) =>
      grants.flatMap((g) => (g.type === 'proficiency' && g.category === category ? [g.id as string] : []));
    expect(proficiency('saving-throw').sort()).toEqual([...facts.saves].sort());
    expect(proficiency('armor').sort()).toEqual([...facts.armor].sort());
    expect(proficiency('weapon').sort()).toEqual([...facts.weapons].sort());
    expect(proficiency('tool').sort()).toEqual([...facts.tools].sort());

    const skills = grants.find((g) => g.type === 'proficiency-choice' && g.category === 'skill');
    expect(skills).toMatchObject({ count: facts.skillCount, key: `skill-choice:class:${classId}:0` });
    if (facts.skillPool === 'any') {
      // The SRD lets a bard pick any three of the 18 skills.
      expect((skills as unknown as { from: string[] }).from).toHaveLength(18);
    } else {
      expect((skills as unknown as { from: string[] }).from).toEqual(facts.skillPool);
    }

    const equipment = grants.find((g) => g.type === 'feature' && g.feature.id === `${classId}-starting-equipment`);
    expect(equipment).toBeDefined();
    const text = (equipment as { feature: { description: string } }).feature.description;
    for (const pattern of facts.equipment) expect(text).toMatch(pattern);
  });

  it('is the same on the resolved sheet at level 1', () => {
    const { resolved } = resolveAt(classId, 1);
    expect(resolved.hitDie).toEqual([{ die: facts.die, count: 1 }]);
    expect(resolved.hitPoints.max).toBe(facts.die);
    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(resolved.savingThrows[ability].proficient).toBe(facts.saves.includes(ability));
    }
    expect(resolved.armorProficiencies.map((p) => p.value as string).sort()).toEqual([...facts.armor].sort());
    expect(resolved.weaponProficiencies.map((p) => p.value as string).sort()).toEqual([...facts.weapons].sort());
    expect(resolved.toolProficiencies.map((p) => p.value as string)).toEqual(facts.tools);
    expect(resolved.proficiencyBonus).toBe(2);
    expect(resolved.weaponMasteries).toEqual([]);
    const skillChoice = resolved.pendingChoices.find((p) => p.choiceKey === `skill-choice:class:${classId}:0`);
    expect(skillChoice).toBeDefined();
  });

  it('asks for the subclass at class level ' + facts.subclassAt + ', and not before', () => {
    for (let level = 1; level <= 20; level++) {
      const pending = resolveAt(classId, level).resolved.pendingChoices.filter((p) => p.type === 'subclass');
      if (level < facts.subclassAt) expect(pending).toEqual([]);
      else {
        expect(pending.map((p) => p.choiceKey)).toEqual([`subclass:class:${classId}:0`]);
        expect(pending[0]).toMatchObject({ classId });
      }
    }
  });

  it('gives an Ability Score Improvement at the class levels of the SRD table, no feat, no other level', () => {
    for (let level = 1; level <= 20; level++) {
      const asis = resolveAt(classId, level).resolved.pendingChoices.filter((p) => p.type === 'asi');
      const expected = facts.asi.filter((l) => l <= level).map((_, i) => `asi:class:${classId}:${i}`);
      expect(asis.map((p) => p.choiceKey)).toEqual(expected);
    }
    expect(facts.asi).toHaveLength(classGrantsOfType(classId, 'asi').length);
  });

  it('adds features level by level and never loses one', () => {
    let previous = new Set<string>();
    for (let level = 1; level <= 20; level++) {
      const { resolved, warnings } = resolveAt(classId, level, {
        [`subclass:class:${classId}:0`]: { type: 'subclass', subclassId: facts.subclass },
      });
      expect(warnings.filter((w) => !/lineage|species/i.test(w))).toEqual([]);
      const ids = new Set(resolved.features.map((f) => f.feature.id));
      for (const id of previous) expect(ids.has(id), `${classId} ${level}: lost ${id}`).toBe(true);
      expect(ids.has(`${classId}-starting-equipment`)).toBe(true);
      expect(resolved.proficiencyBonus).toBe(2 + Math.floor((level - 1) / 4));
      previous = ids;
    }
    expect(previous.size).toBeGreaterThan(10);
  });

  it('computes hit points from the die: maximum at level 1, the average after', () => {
    const average = Math.floor(facts.die / 2) + 1;
    for (const level of [1, 2, 5, 20]) {
      expect(resolveAt(classId, level).resolved.hitPoints.max).toBe(facts.die + average * (level - 1));
    }
  });
});

function classGrantsOfType(classId: string, type: Grant['type']): Grant[] {
  return Array.from({ length: 20 }, (_, i) => classGrants(classId, i + 1))
    .flat()
    .filter((g) => g.type === type);
}

describe('SRD 2014 subclasses', () => {
  const FIRST_LEVELS: Record<string, readonly number[]> = {
    berserker: [3, 6, 10, 14],
    lore: [3, 6, 14],
    // Domain, oath and expanded-list spells add the levels they come with (story 9.8).
    life: [1, 2, 3, 5, 6, 7, 8, 9, 17],
    land: [2, 3, 5, 6, 7, 9, 10, 14],
    champion: [3, 7, 10, 15, 18],
    'open-hand': [3, 6, 11, 17],
    devotion: [3, 5, 7, 9, 13, 15, 17, 20],
    hunter: [3, 7, 11, 15],
    thief: [3, 9, 13, 17],
    draconic: [1, 6, 14, 18],
    fiend: [1, 3, 5, 6, 7, 9, 10, 14],
    evocation: [2, 6, 10, 14],
  };

  it.each(Object.entries(FIRST_LEVELS))(
    '%s gets its features and spells at the SRD class levels',
    (subclassId, levels) => {
      const entry = (
        SRD_2014_ENTRIES as readonly {
          kind: string;
          id: string;
          body: { class: ClassId; chosenAtClassLevel: number; features: { classLevel: number }[] };
        }[]
      ).find((e) => e.kind === 'subclass' && e.id === subclassId)!;
      expect(entry.body.features.map((f) => f.classLevel)).toEqual(levels);
      const classId = entry.body.class;
      expect(entry.body.chosenAtClassLevel).toBe(FACTS[classId].subclassAt);
      expect(levels[0]).toBe(FACTS[classId].subclassAt);
    }
  );

  it('applies a chosen subclass at its levels only', () => {
    const choices = { 'subclass:class:fighter:0': { type: 'subclass', subclassId: 'champion' } } as const;
    const at = (level: number) => resolveAt('fighter', level, choices).resolved.features.map((f) => f.feature.id);
    expect(at(2)).not.toContain('improved-critical');
    expect(at(3)).toContain('improved-critical');
    expect(at(6)).not.toContain('remarkable-athlete');
    expect(at(7)).toContain('remarkable-athlete');
    expect(at(18)).toContain('survivor');
  });

  it('opens the choice of a wizard subclass at level 2 and a cleric domain at level 1', () => {
    const wizard = resolveAt('wizard', 2, { 'subclass:class:wizard:0': { type: 'subclass', subclassId: 'evocation' } });
    expect(wizard.resolved.features.map((f) => f.feature.id)).toContain('evocation-savant');
    const cleric = resolveAt('cleric', 1, { 'subclass:class:cleric:0': { type: 'subclass', subclassId: 'life' } });
    expect(cleric.resolved.features.map((f) => f.feature.id)).toContain('disciple-of-life');
    expect(cleric.resolved.armorProficiencies.map((p) => p.value as string)).toContain('heavy');
  });
});

describe('SRD 2014 class features the engine computes', () => {
  const ids = (classId: ClassId, level: number, choices: Record<string, ChoiceDecision> = {}) =>
    resolveAt(classId, level, choices).resolved;

  it('barbarian and monk unarmored defense, and the armored base', () => {
    const barbarian = resolveAt('barbarian', 1).resolved;
    expect(barbarian.armorClass.calculations.map((c) => c.mode).sort()).toEqual(['armored', 'unarmored']);
    expect(
      resolveAt('monk', 1)
        .resolved.armorClass.calculations.map((c) => c.mode)
        .sort()
    ).toEqual(['armored', 'unarmored']);
  });

  it('rogue expertise at levels 1 and 6, bard expertise at 3 and 10, with the right keys', () => {
    const keysAt = (classId: ClassId, level: number) =>
      ids(classId, level)
        .pendingChoices.filter((p) => p.type === 'expertise-choice')
        .map((p) => p.choiceKey);
    expect(keysAt('rogue', 5)).toEqual(['expertise-choice:class:rogue:0']);
    expect(keysAt('rogue', 6)).toEqual(['expertise-choice:class:rogue:0', 'expertise-choice:class:rogue:1']);
    expect(keysAt('bard', 2)).toEqual([]);
    expect(keysAt('bard', 3)).toEqual(['expertise-choice:class:bard:0']);
    expect(keysAt('bard', 10)).toEqual(['expertise-choice:class:bard:0', 'expertise-choice:class:bard:1']);
  });

  it('fighting styles: fighter at 1, paladin and ranger at 2, with the 2014 lists', () => {
    const styles = (classId: ClassId, level: number) =>
      ids(classId, level).pendingChoices.filter((p) => p.type === 'fighting-style-choice');
    expect(styles('fighter', 1)).toHaveLength(1);
    expect(styles('paladin', 1)).toHaveLength(0);
    expect(styles('paladin', 2)).toHaveLength(1);
    expect(styles('ranger', 1)).toHaveLength(0);
    expect(styles('ranger', 2)).toHaveLength(1);
    expect(classGrants('paladin', 2).find((g) => g.type === 'fighting-style-choice')).toMatchObject({
      from: ['defense', 'dueling', 'great-weapon-fighting', 'protection'],
    });
    expect(classGrants('ranger', 2).find((g) => g.type === 'fighting-style-choice')).toMatchObject({
      from: ['archery', 'defense', 'dueling', 'two-weapon-fighting'],
    });
    expect(classGrants('fighter', 1).find((g) => g.type === 'fighting-style-choice')).toMatchObject({
      from: ['archery', 'defense', 'dueling', 'great-weapon-fighting', 'protection', 'two-weapon-fighting'],
    });
  });

  it('bardic inspiration is the feature the resolver knows', () => {
    expect(resolveAt('bard', 1).resolved.bardicInspiration).toEqual({ dieSize: 6, uses: 1 });
    expect(resolveAt('bard', 5).resolved.bardicInspiration?.dieSize).toBe(8);
  });

  it('Lore bard picks three bonus skills, Champion a second fighting style at 10, Draconic gains 1 HP per level', () => {
    const lore = resolveAt('bard', 3, { 'subclass:class:bard:0': { type: 'subclass', subclassId: 'lore' } }).resolved;
    expect(lore.pendingChoices.find((p) => p.choiceKey === 'skill-choice:subclass:lore:0')).toBeDefined();
    const champion = (level: number) =>
      resolveAt('fighter', level, { 'subclass:class:fighter:0': { type: 'subclass', subclassId: 'champion' } })
        .resolved.pendingChoices.filter((p) => p.type === 'fighting-style-choice')
        .map((p) => p.choiceKey);
    expect(champion(9)).toEqual(['fighting-style-choice:class:fighter:0']);
    expect(champion(10)).toEqual([
      'fighting-style-choice:class:fighter:0',
      'fighting-style-choice:subclass:champion:0',
    ]);
    const plain = resolveAt('sorcerer', 3).resolved.hitPoints.max;
    const draconic = resolveAt('sorcerer', 3, {
      'subclass:class:sorcerer:0': { type: 'subclass', subclassId: 'draconic' },
    }).resolved.hitPoints.max;
    expect(draconic - plain).toBe(3);
  });

  it('Hunter offers its options as feature choices at 3, 7, 11 and 15', () => {
    const choices = (level: number) =>
      resolveAt('ranger', level, { 'subclass:class:ranger:0': { type: 'subclass', subclassId: 'hunter' } })
        .resolved.pendingChoices.filter((p) => p.type === 'feature-choice')
        .map((p) => p.choiceKey);
    expect(choices(2)).toEqual([]);
    expect(choices(3)).toEqual(['feature-choice:subclass:hunter:0']);
    expect(choices(15)).toHaveLength(4);
  });

  it('tracks the uses of Second Wind and Arcane Recovery', () => {
    const fighter = resolveAt('fighter', 1).resolved.features.find((f) => f.feature.id === 'second-wind');
    expect(fighter?.feature).toMatchObject({ usesPerRest: 'short', usesCount: 1 });
    const wizard = resolveAt('wizard', 1).resolved.features.find((f) => f.feature.id === 'arcane-recovery');
    expect(wizard?.feature).toMatchObject({ usesPerRest: 'long', usesCount: 1 });
  });

  it('monk Diamond Soul gives every saving throw at 14', () => {
    const monk = resolveAt('monk', 14).resolved;
    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(monk.savingThrows[ability].proficient).toBe(true);
    }
    expect(resolveAt('monk', 13).resolved.savingThrows.cha.proficient).toBe(false);
  });
});

describe('the 2024 rules are untouched by the 2014 classes', () => {
  it('keeps the built-in 2024 classes, with weapon masteries', () => {
    const rules2024 = builtin2024RuleSet();
    expect(rules2024.classes.size).toBe(12);
    expect(rules2024.classes.get('fighter')?.levels[0].grants.some((g) => g.type === 'weapon-mastery-choice')).toBe(
      true
    );
    expect(rules2024.subclassesByClass.get('fighter')).not.toContain('champion-2014');
    expect(rules2024.subclasses.has('life')).toBe(false);
    for (const info of rules2024.entries.values()) expect(info.layer).not.toBe('srd-2014');
  });
});
