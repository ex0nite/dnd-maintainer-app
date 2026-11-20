/**
 * Story 9.7: starting equipment of the 2014 classes and of the acolyte as grants, and a whole 2014 character resolved
 * from creation (species bonus, manual scores, class, background, equipment).
 *
 * The expected number of "(a) ... or (b) ..." lines and of options per line is written by hand from the SRD 5.1 class
 * descriptions, not derived from the generated JSON.
 */
import { describe, expect, it } from 'vitest';
import { buildRuleSet } from '@/lib/rules/ruleset';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import { getBundleDef, getItemsForSlot, resolveBundleRef } from '@/lib/sources/bundles';
import { getItemDef } from '@/lib/sources/items';
import type { ClassId } from '@/lib/dnd-helpers';
import type { AbilityScores } from '@/types/database';
import type { BuildLevel, CharacterBuild, ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { Grant } from '@/types/grants';

const RULES = buildRuleSet('2014');

/** Options of each "(a) ... or (b) ..." line, in the order of the SRD sentence. */
const OPTIONS_PER_LINE: Record<ClassId, readonly number[]> = {
  barbarian: [2, 2],
  bard: [3, 2, 2],
  cleric: [2, 3, 2, 2],
  druid: [2, 2],
  fighter: [2, 2, 2, 2],
  monk: [2, 2],
  paladin: [2, 2, 2],
  ranger: [2, 2, 2],
  rogue: [2, 2, 3],
  sorcerer: [2, 2, 2],
  warlock: [2, 2, 2, 1],
  wizard: [2, 2, 2],
};

/** Fixed items of the SRD sentence ("You start with the following equipment: ..."), item id and quantity. */
const FIXED_ITEMS: Record<ClassId, readonly [string, number][]> = {
  barbarian: [
    ['explorers-pack', 1],
    ['javelin', 4],
  ],
  bard: [
    ['leather', 1],
    ['dagger', 1],
  ],
  cleric: [
    ['shield', 1],
    ['holy-symbol', 1],
  ],
  druid: [
    ['leather', 1],
    ['explorers-pack', 1],
    ['druidic-focus', 1],
  ],
  fighter: [],
  monk: [['dart', 10]],
  paladin: [
    ['chain-mail', 1],
    ['holy-symbol', 1],
  ],
  ranger: [
    ['longbow', 1],
    ['arrows-20', 1],
  ],
  rogue: [
    ['leather', 1],
    ['dagger', 2],
    ['thieves-tools', 1],
  ],
  sorcerer: [['dagger', 2]],
  warlock: [
    ['dagger', 2],
    ['leather', 1],
  ],
  wizard: [['spellbook', 1]],
};

const CLASS_IDS = Object.keys(OPTIONS_PER_LINE) as ClassId[];
const level1 = (classId: string): Grant[] => (RULES.classes.get(classId)?.levels[0]?.grants ?? []) as Grant[];
const bundleChoices = (classId: string) =>
  level1(classId).filter((g): g is Extract<Grant, { type: 'bundle-choice' }> => g.type === 'bundle-choice');

describe.each(CLASS_IDS)('2014 starting equipment of the %s', (classId) => {
  it('offers the options of the SRD lines, each one a known bundle or pack', () => {
    const choices = bundleChoices(classId);
    expect(choices.map((c) => c.bundleIds.length)).toEqual(OPTIONS_PER_LINE[classId]);
    for (const choice of choices) {
      for (const id of choice.bundleIds) {
        expect(() => resolveBundleRef(id), `${classId}: ${id}`).not.toThrow();
        for (const slot of getBundleDef(id)?.slots ?? []) {
          expect(getItemsForSlot(slot.filter).length, `${classId}: ${id}/${slot.slotKey}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('grants the fixed items, all in the item catalog', () => {
    const fixed = level1(classId)
      .filter((g): g is Extract<Grant, { type: 'equipment' }> => g.type === 'equipment')
      .map((g) => [g.itemId, g.quantity] as const);
    expect(fixed).toEqual(FIXED_ITEMS[classId]);
    for (const [itemId] of fixed) expect(getItemDef(itemId), itemId).toBeDefined();
  });

  it('keeps the choices pending until each is answered, then lists the equipment', () => {
    const choices = bundleChoices(classId);
    const answers: Record<string, ChoiceDecision> = {};
    const before = resolveAt(classId, {});
    expect(before.pendingChoices.filter((p) => p.type === 'bundle-choice')).toHaveLength(choices.length);

    for (const choice of choices) {
      const bundleId = choice.bundleIds[0];
      const slotPicks: Record<string, string> = {};
      for (const slot of getBundleDef(bundleId)?.slots ?? []) {
        slotPicks[slot.slotKey] = getItemsForSlot(slot.filter)[0].id;
      }
      answers[choice.key] = { type: 'bundle-choice', bundleId, slotPicks };
    }
    const after = resolveAt(classId, answers);
    expect(after.pendingChoices.filter((p) => p.type === 'bundle-choice')).toHaveLength(0);
    const have = new Map(after.equipment.map((e) => [e.itemId, e.quantity]));
    for (const [itemId, quantity] of FIXED_ITEMS[classId])
      expect(have.get(itemId), itemId).toBeGreaterThanOrEqual(quantity);
  });
});

function resolveAt(classId: ClassId, choices: Record<string, ChoiceDecision>) {
  const build = {
    speciesId: 'human',
    backgroundId: null,
    baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilityMethod: 'manual',
    levels: [{ classId, classLevel: 1, hpRoll: null }],
    choices: choices as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  } satisfies CharacterBuild;
  const { bundles } = collectBundles(build, RULES);
  const resolved = resolveCharacter({
    baseAbilities: build.baseAbilities,
    level: 1,
    bundles,
    choices: build.choices,
    rules: RULES,
    levels: build.levels,
  });
  return { pendingChoices: resolved.pendingChoices, equipment: resolved.equipment };
}

describe('2014 background equipment', () => {
  it('turns the acolyte equipment line into items, the gold staying in the text', () => {
    const grants = (RULES.backgrounds.get('acolyte')?.grants ?? []) as Grant[];
    const items = grants
      .filter((g): g is Extract<Grant, { type: 'equipment' }> => g.type === 'equipment')
      .map((g) => g.itemId);
    expect(items).toEqual(['holy-symbol', 'prayer-book', 'incense-sticks-5', 'vestments', 'common-clothes', 'pouch']);
    for (const id of items) expect(getItemDef(id), id).toBeDefined();
    const text = grants.find((g) => g.type === 'feature' && g.feature.id === 'acolyte-equipment');
    expect(JSON.stringify(text)).toContain('15 gp');
  });
});

describe('a whole 2014 character: hill dwarf cleric, acolyte, scores typed by hand', () => {
  const base: AbilityScores = { str: 14, dex: 10, con: 15, int: 8, wis: 16, cha: 12 };

  function build(choices: Record<string, ChoiceDecision>): { resolved: ReturnType<typeof resolveCharacter> } {
    const levels: BuildLevel[] = [{ classId: 'cleric', classLevel: 1, hpRoll: null }];
    const b = {
      speciesId: 'dwarf',
      backgroundId: 'acolyte',
      baseAbilities: base,
      abilityMethod: 'manual',
      levels,
      choices: choices as Record<ChoiceKey, ChoiceDecision>,
      feats: [],
      activeItems: [],
    } satisfies CharacterBuild;
    const { bundles, expandedFeats } = collectBundles(b, RULES);
    return {
      resolved: resolveCharacter({
        baseAbilities: base,
        level: 1,
        bundles,
        choices: b.choices,
        levels,
        equippedItemIds: ['chain-mail', 'shield'],
        expandedFeats,
        rules: RULES,
      }),
    };
  }

  const choices: Record<string, ChoiceDecision> = {
    'lineage-choice:species:dwarf:0': { type: 'lineage-choice', lineageId: 'hill-dwarf' },
    'subclass:class:cleric:0': { type: 'subclass', subclassId: 'life' },
    'bundle-choice:class:cleric:0': { type: 'bundle-choice', bundleId: 'single-mace', slotPicks: {} },
    'bundle-choice:class:cleric:1': { type: 'bundle-choice', bundleId: 'single-chain-mail', slotPicks: {} },
    'bundle-choice:class:cleric:2': { type: 'bundle-choice', bundleId: 'light-crossbow-kit', slotPicks: {} },
    'bundle-choice:class:cleric:3': { type: 'bundle-choice', bundleId: 'priests-pack', slotPicks: {} },
  };

  it('adds the species and subspecies bonuses to the typed scores', () => {
    const { resolved } = build(choices);
    // Dwarf: CON +2, hill dwarf: WIS +1.
    expect(resolved.abilities.con.total).toBe(17);
    expect(resolved.abilities.wis.total).toBe(17);
    expect(resolved.abilities.str.total).toBe(14);
  });

  it('computes proficiency bonus, hit points, saves and armor class with the 2014 formulas', () => {
    const { resolved } = build(choices);
    expect(resolved.proficiencyBonus).toBe(2);
    // d8 at level 1 + CON modifier 3 + Dwarven Toughness 1.
    expect(resolved.hitPoints.max).toBe(12);
    expect(resolved.savingThrows.wis.proficient).toBe(true);
    expect(resolved.savingThrows.cha.proficient).toBe(true);
    expect(resolved.savingThrows.wis.bonus).toBe(5);
    // Chain mail 16 + shield 2 (the Life domain grants the heavy armor).
    expect(resolved.armorClass.effective).toBe(18);
    // Acolyte: Insight and Religion. Insight = WIS modifier 3 + proficiency 2; Athletics = STR modifier 2.
    expect(resolved.skills.insight.proficient).toBe(true);
    expect(resolved.skills.insight.bonus).toBe(5);
    expect(resolved.skills.athletics.bonus).toBe(2);
  });
});
