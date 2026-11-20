/**
 * Story 9.8: the 319 SRD 5.1 spells and the spellcasting of the 2014 classes, resolved level by level.
 *
 * The expectations are written by hand from the SRD 5.1 class tables (spell slots, pact magic, cantrips known, spells
 * known, invocations known, metamagic known) and class texts, not derived from the generated JSON, so a conversion
 * error can not agree with itself.
 */
import { describe, expect, it } from 'vitest';
import { buildRuleSet, builtin2024RuleSet, spellChoicePool, spellsForList } from '@/lib/rules/ruleset';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import type { ClassId } from '@/lib/dnd-helpers';
import type { AbilityScores } from '@/types/database';
import type { BuildLevel, CharacterBuild, ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { PendingChoice } from '@/types/resolved';

const RULES = buildRuleSet('2014');

// Human: +1 to every score, so a base of 15 is a total of 16 (modifier +3).
const BASE: AbilityScores = { str: 10, dex: 10, con: 10, int: 15, wis: 15, cha: 15 };

type Decisions = Record<string, ChoiceDecision>;

function resolve(classId: ClassId, level: number, choices: Decisions = {}, base: AbilityScores = BASE) {
  const levels: BuildLevel[] = Array.from({ length: level }, (_, i) => ({
    classId,
    classLevel: i + 1,
    hpRoll: null,
  }));
  const build = {
    speciesId: 'human',
    backgroundId: 'acolyte',
    baseAbilities: base,
    abilityMethod: 'manual',
    levels,
    choices: choices as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  } satisfies CharacterBuild;
  const { bundles, expandedFeats, warnings } = collectBundles(build, RULES);
  const resolved = resolveCharacter({
    baseAbilities: base,
    level,
    bundles,
    choices: build.choices,
    levels,
    expandedFeats,
    rules: RULES,
  });
  return { resolved, warnings, bundles };
}

type Pending<T extends PendingChoice['type']> = Extract<PendingChoice, { type: T }>;
const pendingOf = <T extends PendingChoice['type']>(pending: readonly PendingChoice[], type: T): Pending<T>[] =>
  pending.filter((c): c is Pending<T> => c.type === type);

const FULL: Record<number, number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
  6: [4, 3, 3],
  7: [4, 3, 3, 1],
  8: [4, 3, 3, 2],
  9: [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1],
  13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1],
  16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

const HALF: Record<number, number[]> = {
  1: [],
  2: [2],
  3: [3],
  4: [3],
  5: [4, 2],
  6: [4, 2],
  7: [4, 3],
  8: [4, 3],
  9: [4, 3, 2],
  10: [4, 3, 2],
  11: [4, 3, 3],
  12: [4, 3, 3],
  13: [4, 3, 3, 1],
  14: [4, 3, 3, 1],
  15: [4, 3, 3, 2],
  16: [4, 3, 3, 2],
  17: [4, 3, 3, 3, 1],
  18: [4, 3, 3, 3, 1],
  19: [4, 3, 3, 3, 2],
  20: [4, 3, 3, 3, 2],
};

/** Pact magic table of the SRD 5.1 warlock: [slots, slot level]. */
const PACT: Record<number, [number, number]> = {
  1: [1, 1],
  2: [2, 1],
  3: [2, 2],
  4: [2, 2],
  5: [2, 3],
  6: [2, 3],
  7: [2, 4],
  8: [2, 4],
  9: [2, 5],
  10: [2, 5],
  11: [3, 5],
  12: [3, 5],
  13: [3, 5],
  14: [3, 5],
  15: [3, 5],
  16: [3, 5],
  17: [4, 5],
  18: [4, 5],
  19: [4, 5],
  20: [4, 5],
};

/** Cantrips known by level (SRD class tables), from the first level of each range. */
const CANTRIPS: Partial<Record<ClassId, readonly (readonly [number, number])[]>> = {
  bard: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  cleric: [
    [1, 3],
    [4, 4],
    [10, 5],
  ],
  druid: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  sorcerer: [
    [1, 4],
    [4, 5],
    [10, 6],
  ],
  warlock: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  wizard: [
    [1, 3],
    [4, 4],
    [10, 5],
  ],
};

/** Spells known by level, levels 1 to 20 (SRD class tables). */
const KNOWN: Partial<Record<ClassId, readonly number[]>> = {
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
};

const levelRange = Array.from({ length: 20 }, (_, i) => i + 1);

describe('the SRD 5.1 spells in the 2014 rule set', () => {
  it('holds the 319 spells, all valid', () => {
    expect(RULES.spells.size).toBe(319);
    expect(RULES.invalid).toEqual([]);
    expect(RULES.unverified).toEqual([]);
  });

  it('gives each spell its level, school, components and classes (checked on spells the SRD text states)', () => {
    const fireball = RULES.spells.get('fireball');
    expect(fireball).toMatchObject({
      level: 3,
      school: 'evocation',
      ritual: false,
      concentration: false,
      castingTime: '1 action',
      range: '150 feet',
      duration: 'Instantaneous',
      components: { verbal: true, somatic: true, material: 'A tiny ball of bat guano and sulfur.' },
    });
    expect([...(fireball?.nativeClasses ?? [])].sort()).toEqual(['sorcerer', 'wizard']);
    expect(RULES.spells.get('detect-magic')).toMatchObject({ ritual: true, concentration: true, level: 1 });
    expect(RULES.spells.get('wish')).toMatchObject({ level: 9, school: 'conjuration' });
    expect(RULES.spells.get('fire-bolt')).toMatchObject({ level: 0, components: { material: false } });
    expect([...(RULES.spells.get('cure-wounds')?.nativeClasses ?? [])].sort()).toEqual([
      'bard',
      'cleric',
      'druid',
      'paladin',
      'ranger',
    ]);
    expect([...(RULES.spells.get('eldritch-blast')?.nativeClasses ?? [])]).toEqual(['warlock']);
  });

  it('keeps the SRD name and text, with the higher-level paragraph', () => {
    expect(RULES.entries.get('spell:magic-missile')?.name.en).toBe('Magic Missile');
    const summary = RULES.entries.get('spell:magic-missile')?.summary?.en ?? '';
    expect(summary).toMatch(/three glowing darts of magical force/);
    expect(summary).toMatch(/At Higher Levels\. When you cast this spell using a spell slot of 2nd level or higher/);
  });

  it('attaches the spells to the class lists, and only the SRD classes have a list', () => {
    const counts = Object.fromEntries(
      (['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'] as const).map((c) => [
        c,
        spellsForList(RULES, c).length,
      ])
    );
    // Totals of the SRD 5.1 class spell lists.
    expect(counts).toEqual({
      bard: 111,
      cleric: 105,
      druid: 106,
      paladin: 31,
      ranger: 37,
      sorcerer: 120,
      warlock: 64,
      wizard: 204,
    });
    expect(spellsForList(RULES, 'barbarian')).toHaveLength(0);
    expect(spellsForList(RULES, 'wizard', 0).every((s) => s.level === 0)).toBe(true);
  });

  it('leaves the 2024 spells and rules untouched', () => {
    const rules2024 = builtin2024RuleSet();
    expect(rules2024.spells.has('fireball')).toBe(rules2024.spells.has('fireball'));
    expect(rules2024.spells.size).not.toBe(319);
    expect(rules2024.classes.get('wizard')?.levels[0].grants.some((g) => g.type === 'spell-slots')).toBe(false);
  });
});

describe('spell slots and pact magic by class level (SRD 5.1 class tables)', () => {
  it.each(levelRange)('full casters at level %i', (level) => {
    for (const classId of ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'] as const) {
      const { resolved } = resolve(classId, level);
      expect(resolved.spellcasting?.slots, `${classId} ${level}`).toEqual(FULL[level]);
      expect(resolved.spellcasting?.pactMagic).toBeNull();
    }
  });

  it.each(levelRange)('half casters at level %i (no spellcasting at level 1)', (level) => {
    for (const classId of ['paladin', 'ranger'] as const) {
      const { resolved } = resolve(classId, level);
      if (level === 1) {
        expect(resolved.spellcasting).toBeNull();
      } else {
        expect(resolved.spellcasting?.slots, `${classId} ${level}`).toEqual(HALF[level]);
      }
    }
  });

  it.each(levelRange)('warlock pact magic at level %i', (level) => {
    const { resolved } = resolve('warlock', level);
    expect(resolved.spellcasting?.slots).toEqual([]);
    expect(resolved.spellcasting?.pactMagic).toEqual({ count: PACT[level][0], slotLevel: PACT[level][1] });
  });

  it('gives a non-caster no spellcasting', () => {
    expect(resolve('fighter', 5).resolved.spellcasting).toBeNull();
    expect(resolve('barbarian', 5).resolved.spellcasting).toBeNull();
  });

  it('uses each class spellcasting ability: Intelligence, Wisdom or Charisma', () => {
    const abilityOf = (c: ClassId) => resolve(c, 3).resolved.spellcasting?.ability;
    expect(abilityOf('wizard')).toBe('int');
    expect(abilityOf('cleric')).toBe('wis');
    expect(abilityOf('druid')).toBe('wis');
    expect(abilityOf('ranger')).toBe('wis');
    expect(abilityOf('bard')).toBe('cha');
    expect(abilityOf('paladin')).toBe('cha');
    expect(abilityOf('sorcerer')).toBe('cha');
    expect(abilityOf('warlock')).toBe('cha');
  });

  it('computes the spell save DC and attack bonus from the proficiency bonus and the ability', () => {
    // Level 5: proficiency +3, Intelligence 16 (+3): DC 8 + 3 + 3 = 14, attack +6.
    const { resolved } = resolve('wizard', 5);
    expect(resolved.spellcasting?.spellSaveDC).toBe(14);
    expect(resolved.spellcasting?.spellAttackBonus).toBe(6);
  });
});

describe('cantrips, spells known, spellbook and prepared spells', () => {
  it.each(
    Object.entries(CANTRIPS).flatMap(([classId, ranges]) =>
      levelRange.map(
        (level) =>
          [classId as ClassId, level, [...(ranges ?? [])].reverse().find(([from]) => level >= from)?.[1]] as const
      )
    )
  )('%s level %i knows the cantrips of the SRD table', (classId, level, expected) => {
    expect(resolve(classId, level).resolved.spellcasting?.cantripsKnown).toBe(expected);
  });

  it.each(
    Object.entries(KNOWN).flatMap(([classId, perLevel]) =>
      levelRange.map((level) => [classId as ClassId, level, (perLevel ?? [])[level - 1]] as const)
    )
  )('%s level %i knows the spells of the SRD table', (classId, level, expected) => {
    const spellcasting = resolve(classId, level).resolved.spellcasting;
    // Mystic Arcanum picks (one spell of each level 6 to 9) are separate, fixed-level choices.
    expect(spellcasting?.knownTotal ?? 0).toBe(expected);
  });

  it('gives the wizard a spellbook: six spells at level 1, two more at each level', () => {
    for (const level of [1, 2, 5, 11, 20]) {
      expect(resolve('wizard', level).resolved.spellcasting?.knownTotal).toBe(6 + 2 * (level - 1));
    }
  });

  it('lets the cleric, druid and paladin choose no known spell (they prepare)', () => {
    for (const classId of ['cleric', 'druid', 'paladin'] as const) {
      expect(resolve(classId, 5).resolved.spellcasting?.knownTotal).toBeNull();
    }
  });

  it('prepares ability modifier + class level (half the level for the paladin), at least one', () => {
    // Modifier +3 (16).
    expect(resolve('wizard', 5).resolved.spellcasting?.preparedCount).toBe(8);
    expect(resolve('cleric', 3).resolved.spellcasting?.preparedCount).toBe(6);
    expect(resolve('druid', 1).resolved.spellcasting?.preparedCount).toBe(4);
    expect(resolve('paladin', 5).resolved.spellcasting?.preparedCount).toBe(5);
    expect(resolve('paladin', 2).resolved.spellcasting?.preparedCount).toBe(4);
    // Charisma 4 + 1 = 5 (modifier -3): at least one prepared spell.
    expect(resolve('paladin', 2, {}, { ...BASE, cha: 4 }).resolved.spellcasting?.preparedCount).toBe(1);
    // Known-spell classes prepare none.
    for (const classId of ['bard', 'ranger', 'sorcerer', 'warlock'] as const) {
      expect(resolve(classId, 5).resolved.spellcasting?.preparedCount).toBe(0);
    }
  });

  it('asks for the new picks of each level: a wizard at level 2 owes six spells and two more', () => {
    const { resolved } = resolve('wizard', 2);
    const picks = pendingOf(resolved.pendingChoices, 'spell-choice').filter((c) => c.spellLevel === 1);
    expect(picks.map((c) => [c.count, c.maxSpellLevel])).toEqual([
      [6, 1],
      [2, 1],
    ]);
    // Level 3 opens the 2nd-level spells: the new picks go up to level 2.
    const l3 = pendingOf(resolve('wizard', 3).resolved.pendingChoices, 'spell-choice').filter(
      (c) => c.spellLevel === 1
    );
    expect(l3.map((c) => c.maxSpellLevel)).toEqual([1, 1, 2]);
  });

  it('keeps the chosen spells and refuses a spell of another list or above the slots', () => {
    const initial = resolve('wizard', 1);
    const [cantrips, book] = pendingOf(initial.resolved.pendingChoices, 'spell-choice');
    expect(cantrips.spellLevel).toBe(0);
    const choices: Decisions = {
      [cantrips.choiceKey]: { type: 'spell-choice', spellIds: ['fire-bolt', 'mage-hand', 'light'] },
      [book.choiceKey]: {
        type: 'spell-choice',
        spellIds: ['magic-missile', 'shield', 'sleep', 'detect-magic', 'cure-wounds', 'fireball'],
      },
    };
    const { resolved, warnings } = resolve('wizard', 1, choices);
    expect(resolved.spellcasting?.cantrips).toEqual(['fire-bolt', 'mage-hand', 'light']);
    expect(resolved.spellcasting?.knownSpells.map((s) => s.spellId)).toEqual([
      'magic-missile',
      'shield',
      'sleep',
      'detect-magic',
    ]);
    // cure-wounds is not a wizard spell, fireball is above the level 1 slots.
    expect(warnings.filter((w) => /cure-wounds|fireball/.test(w))).toHaveLength(2);
    // Two picks are missing: the choice is still pending.
    expect(pendingOf(resolved.pendingChoices, 'spell-choice').some((c) => c.spellLevel === 1)).toBe(true);
  });
});

describe('subclass spells', () => {
  it('gives the Life domain its always-prepared spells at the cleric levels the SRD lists', () => {
    const at = (level: number) =>
      resolve('cleric', level, { 'subclass:class:cleric:0': { type: 'subclass', subclassId: 'life' } }).resolved
        .spellcasting?.alwaysPreparedSpells;
    expect(at(1)).toEqual(['bless', 'cure-wounds']);
    expect(at(3)).toEqual(['bless', 'cure-wounds', 'lesser-restoration', 'spiritual-weapon']);
    expect(at(9)).toHaveLength(9);
    expect(at(9)).toContain('raise-dead');
    expect(at(8)).not.toContain('raise-dead');
  });

  it('gives the Oath of Devotion its oath spells from paladin level 3', () => {
    const at = (level: number) =>
      resolve('paladin', level, { 'subclass:class:paladin:0': { type: 'subclass', subclassId: 'devotion' } }).resolved
        .spellcasting?.alwaysPreparedSpells;
    expect(at(2)).toEqual([]);
    expect(at(3)).toEqual(['protection-from-evil-and-good', 'sanctuary']);
    expect(at(5)).toEqual(['protection-from-evil-and-good', 'sanctuary', 'lesser-restoration', 'zone-of-truth']);
  });

  it('gives the Circle of the Land the circle spells of the chosen terrain, level by level', () => {
    const subclass = { 'subclass:class:druid:0': { type: 'subclass', subclassId: 'land' } } as Decisions;
    const initial = resolve('druid', 5, subclass);
    const terrain = pendingOf(initial.resolved.pendingChoices, 'feature-choice').find((c) =>
      c.options.some((o) => o.optionId === 'arctic')
    );
    expect(terrain).toBeDefined();
    const chosen = resolve('druid', 5, {
      ...subclass,
      [terrain?.choiceKey as string]: { type: 'feature-choice', optionId: 'arctic' },
    });
    expect(chosen.resolved.spellcasting?.alwaysPreparedSpells).toEqual([
      'hold-person',
      'spike-growth',
      'sleet-storm',
      'slow',
    ]);
    const lowLevel = resolve('druid', 3, {
      ...subclass,
      [terrain?.choiceKey as string]: { type: 'feature-choice', optionId: 'desert' },
    });
    expect(lowLevel.resolved.spellcasting?.alwaysPreparedSpells).toEqual(['blur', 'silence']);
  });

  it('adds the Fiend expanded list to the warlock list for the picks, without knowing the spells', () => {
    const fiend = { 'subclass:class:warlock:0': { type: 'subclass', subclassId: 'fiend' } } as Decisions;
    const { resolved } = resolve('warlock', 1, fiend);
    const [, known] = pendingOf(resolved.pendingChoices, 'spell-choice');
    expect(known.extraSpellIds).toEqual(['burning-hands', 'command']);
    expect(resolved.spellcasting?.knownSpells).toEqual([]);
    expect(resolved.spellcasting?.listExtensions).toEqual([
      { spellList: 'warlock', spellIds: ['burning-hands', 'command'] },
    ]);
    // The expanded spell can be picked (it is a level 1 spell the warlock list does not hold).
    expect(spellsForList(RULES, 'warlock', 1).some((s) => s.id === 'burning-hands')).toBe(false);
    expect(spellChoicePool(RULES, known).some((s) => s.id === 'burning-hands')).toBe(true);
    const picked = resolve('warlock', 1, {
      ...fiend,
      [known.choiceKey]: { type: 'spell-choice', spellIds: ['burning-hands', 'charm-person'] },
    });
    expect(picked.resolved.spellcasting?.knownSpells.map((s) => s.spellId)).toEqual(['burning-hands', 'charm-person']);
    // At level 3 the second tier joins; a level 5 spell is not offered at level 3.
    const l3 = resolve('warlock', 3, fiend).resolved.spellcasting?.listExtensions?.[0].spellIds;
    expect(l3).toEqual(['burning-hands', 'command', 'blindness-deafness', 'scorching-ray']);
  });

  it('does not offer an expanded spell without the patron', () => {
    const { resolved } = resolve('warlock', 1);
    const [, known] = pendingOf(resolved.pendingChoices, 'spell-choice');
    expect(known.extraSpellIds).toBeUndefined();
    expect(spellChoicePool(RULES, known).some((s) => s.id === 'burning-hands')).toBe(false);
  });
});

describe('warlock invocations, pact boon and Mystic Arcanum', () => {
  const invocationKeys = (level: number) =>
    pendingOf(resolve('warlock', level).resolved.pendingChoices, 'feature-picks').map((c) => c.choiceKey);

  it('asks for the invocations known at each level (SRD table: 2 at level 2, then 3, 4, 5, 6, 7, 8 at levels 5, 7, 9, 12, 15, 18)', () => {
    const asked = (level: number) =>
      pendingOf(resolve('warlock', level).resolved.pendingChoices, 'feature-picks').reduce((n, c) => n + c.count, 0);
    // The data set says 3 at level 4 and 4 at level 6: the SRD table says 2 and 3 (see PICK_POOLS in the converter).
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 17, 18, 20].map(asked)).toEqual([
      0, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
    ]);
  });

  it('lists the 32 SRD invocations once, with their prerequisites', () => {
    const [first] = pendingOf(resolve('warlock', 2).resolved.pendingChoices, 'feature-picks');
    expect(first.options).toHaveLength(32);
    const blade = first.options.find((o) => o.optionId === 'thirsting-blade');
    expect(blade?.minClassLevel).toBe(5);
    expect(blade?.description).toMatch(/^Prerequisite: 5th level, Pact of the Blade\./);
    expect(first.options.find((o) => o.optionId === 'agonizing-blast')?.description).toMatch(
      /^Prerequisite: the Eldritch Blast cantrip\./
    );
    // The later grants of the pool share the options.
    const levelFour = pendingOf(resolve('warlock', 5).resolved.pendingChoices, 'feature-picks');
    expect(levelFour).toHaveLength(2);
    expect(levelFour[1].options).toHaveLength(32);
  });

  it('adds the picked invocations as features, once per pool, and only when the level allows it', () => {
    const [first, second] = invocationKeys(5);
    const choices: Decisions = {
      [first]: { type: 'feature-picks', optionIds: ['agonizing-blast', 'armor-of-shadows'] },
      // armor-of-shadows is already taken by the first grant.
      [second]: { type: 'feature-picks', optionIds: ['armor-of-shadows'] },
    };
    const { resolved, warnings } = resolve('warlock', 5, choices);
    const names = resolved.features.map((f) => f.feature.name);
    expect(names).toContain('Agonizing Blast');
    expect(names.filter((n) => n === 'Armor of Shadows')).toHaveLength(1);
    expect(warnings.some((w) => /already taken/.test(w))).toBe(true);
    expect(pendingOf(resolved.pendingChoices, 'feature-picks').map((c) => c.choiceKey)).toEqual([second]);

    // Lifedrinker asks for level 12.
    const tooEarly = resolve('warlock', 5, { [second]: { type: 'feature-picks', optionIds: ['lifedrinker'] } });
    expect(tooEarly.resolved.features.map((f) => f.feature.name)).not.toContain('Lifedrinker');
    expect(pendingOf(tooEarly.resolved.pendingChoices, 'feature-picks').map((c) => c.choiceKey)).toContain(second);

    const done = resolve('warlock', 5, {
      ...choices,
      [second]: { type: 'feature-picks', optionIds: ['devils-sight'] },
    });
    expect(done.resolved.features.map((f) => f.feature.name)).toContain("Devil's Sight");
    expect(pendingOf(done.resolved.pendingChoices, 'feature-picks')).toEqual([]);
    // The bundles of the picked options do not count as class levels: pact magic is still the level 5 row.
    expect(done.resolved.spellcasting?.pactMagic).toEqual({ count: 2, slotLevel: 3 });
  });

  it('offers the three pact boons at level 3', () => {
    const boon = pendingOf(resolve('warlock', 3).resolved.pendingChoices, 'feature-choice').find((c) =>
      c.options.some((o) => o.optionId === 'chain')
    );
    expect(boon?.options.map((o) => o.optionId)).toEqual(['chain', 'blade', 'tome']);
    expect(boon?.options[0].name).toBe('Pact of the Chain');
  });

  it('asks for one Mystic Arcanum spell of level 6 at level 11, 7 at 13, 8 at 15 and 9 at 17', () => {
    const arcanum = (level: number) =>
      pendingOf(resolve('warlock', level).resolved.pendingChoices, 'spell-choice')
        .filter((c) => c.spellLevel >= 6)
        .map((c) => [c.spellLevel, c.count, c.maxSpellLevel]);
    expect(arcanum(10)).toEqual([]);
    expect(arcanum(11)).toEqual([[6, 1, undefined]]);
    expect(arcanum(17)).toEqual([
      [6, 1, undefined],
      [7, 1, undefined],
      [8, 1, undefined],
      [9, 1, undefined],
    ]);
  });
});

describe('sorcerer metamagic', () => {
  it('asks for two options at level 3, one more at 10 and at 17, among the eight of the SRD', () => {
    const asked = (level: number) =>
      pendingOf(resolve('sorcerer', level).resolved.pendingChoices, 'feature-picks').reduce((n, c) => n + c.count, 0);
    // The data set raises it at level 16: the SRD says 10th and 17th level.
    expect([2, 3, 9, 10, 16, 17, 20].map(asked)).toEqual([0, 2, 2, 3, 3, 4, 4]);
    const [first] = pendingOf(resolve('sorcerer', 3).resolved.pendingChoices, 'feature-picks');
    expect(first.options.map((o) => o.optionId)).toEqual([
      'careful-spell',
      'distant-spell',
      'empowered-spell',
      'extended-spell',
      'heightened-spell',
      'quickened-spell',
      'subtle-spell',
      'twinned-spell',
    ]);
    const { resolved } = resolve('sorcerer', 3, {
      [first.choiceKey]: { type: 'feature-picks', optionIds: ['quickened-spell', 'twinned-spell'] },
    });
    expect(resolved.features.map((f) => f.feature.name)).toEqual(
      expect.arrayContaining(['Quickened Spell', 'Twinned Spell'])
    );
    expect(pendingOf(resolved.pendingChoices, 'feature-picks')).toEqual([]);
  });
});
