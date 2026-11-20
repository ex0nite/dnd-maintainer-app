import { Given, Then, When } from '@cucumber/cucumber';
import type { DndWorld } from '../../steps/support/world.js';
import { buildRuleSet } from '@/lib/rules/ruleset';
import type { RuleSet } from '@/lib/rules/types';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import { builderSteps } from '@/lib/character-builder/steps';
import { isAbilityMethod, validateBaseAbilities } from '@/lib/ability-scores';
import { ABILITY_KEYS, type AbilityKey, type ClassId } from '@/lib/dnd-helpers';
import type { AbilityScores } from '@/types/database';
import type { BuildLevel, ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { ResolvedCharacter } from '@/types/resolved';

/**
 * Steps for features/characters/builder-2014.feature (story 9.7): the order of the builder steps, the check of the base
 * scores and a 2014 sheet resolved from a build, all with the generated SRD 5.1 layer of the 2014 edition.
 */

interface Builder2014World extends DndWorld {
  b14Rules?: RuleSet;
  b14Species?: string;
  b14Background?: string;
  b14Choices?: Record<string, ChoiceDecision>;
  b14Base?: AbilityScores;
  b14Levels?: BuildLevel[];
  b14Worn?: string[];
  b14Steps?: readonly string[];
  b14Method?: string;
  b14Scores?: AbilityScores;
  b14Resolved?: ResolvedCharacter;
  b14Warnings?: readonly string[];
}

const toScores = (list: string): AbilityScores => {
  const values = list.split(',').map(Number);
  return Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, values[i]])) as unknown as AbilityScores;
};

function start(world: Builder2014World, species: string, background: string, subspecies?: string): void {
  world.b14Rules = buildRuleSet('2014');
  world.b14Species = species;
  world.b14Background = background;
  world.b14Choices = subspecies
    ? { [`lineage-choice:species:${species}:0`]: { type: 'lineage-choice', lineageId: subspecies } }
    : {};
  world.b14Base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  world.b14Levels = [];
  world.b14Worn = [];
}

const levelsOf = (classId: string, level: number): BuildLevel[] =>
  Array.from({ length: level }, (_, i) => ({ classId: classId as ClassId, classLevel: i + 1, hpRoll: null }));

Given('a 2014 campaign', function (this: Builder2014World) {
  this.b14Steps = builderSteps('2014').map((s) => s.id);
});

Then(
  'the builder steps are {string}, {string}, {string}, {string}, {string}, {string}, {string}',
  function (
    this: Builder2014World,
    s1: string,
    s2: string,
    s3: string,
    s4: string,
    s5: string,
    s6: string,
    s7: string
  ) {
    const expected = [s1, s2, s3, s4, s5, s6, s7];
    if (JSON.stringify(this.b14Steps) !== JSON.stringify(expected)) {
      throw new Error(`Steps ${JSON.stringify(this.b14Steps)}, expected ${JSON.stringify(expected)}`);
    }
  }
);

Given(
  'the base scores {string} by the method {string}',
  function (this: Builder2014World, scores: string, method: string) {
    this.b14Scores = toScores(scores);
    this.b14Method = method;
  }
);

Then('the scores are accepted', function (this: Builder2014World) {
  if (!isAbilityMethod(this.b14Method)) throw new Error('Unknown method');
  const issues = validateBaseAbilities(this.b14Method, this.b14Scores!);
  if (issues.length > 0) throw new Error(`Refused: ${JSON.stringify(issues)}`);
});

Then('the scores are refused', function (this: Builder2014World) {
  if (!isAbilityMethod(this.b14Method)) throw new Error('Unknown method');
  if (validateBaseAbilities(this.b14Method, this.b14Scores!).length === 0) throw new Error('Accepted');
});

Given(
  'a 2014 {string} with the subspecies {string} and the background {string}',
  function (this: Builder2014World, species: string, subspecies: string, background: string) {
    start(this, species, background, subspecies);
  }
);

Given(
  'a 2014 {string} with no subspecies and the background {string}',
  function (this: Builder2014World, species: string, background: string) {
    start(this, species, background);
  }
);

Given('the 2014 base scores {string} typed by hand', function (this: Builder2014World, scores: string) {
  this.b14Base = toScores(scores);
});

Given('a level {int} {string}', function (this: Builder2014World, level: number, classId: string) {
  this.b14Levels = levelsOf(classId, level);
});

Given(
  'a level {int} {string} with the subclass {string}',
  function (this: Builder2014World, level: number, classId: string, subclass: string) {
    this.b14Levels = levelsOf(classId, level);
    this.b14Choices![`subclass:class:${classId}:0`] = { type: 'subclass', subclassId: subclass };
  }
);

Given('the 2014 character wears {string} and {string}', function (this: Builder2014World, a: string, b: string) {
  this.b14Worn = [a, b];
  // The class equipment of the cleric of the scenario: a mace, chain mail, a light crossbow and a priest pack.
  Object.assign(this.b14Choices!, {
    'bundle-choice:class:cleric:0': { type: 'bundle-choice', bundleId: 'single-mace', slotPicks: {} },
    'bundle-choice:class:cleric:1': { type: 'bundle-choice', bundleId: 'single-chain-mail', slotPicks: {} },
    'bundle-choice:class:cleric:2': { type: 'bundle-choice', bundleId: 'light-crossbow-kit', slotPicks: {} },
    'bundle-choice:class:cleric:3': { type: 'bundle-choice', bundleId: 'priests-pack', slotPicks: {} },
  });
});

When('the 2014 character is resolved', function (this: Builder2014World) {
  const rules = this.b14Rules!;
  const build = {
    speciesId: this.b14Species!,
    backgroundId: this.b14Background!,
    baseAbilities: this.b14Base!,
    abilityMethod: 'manual' as const,
    levels: this.b14Levels!,
    choices: this.b14Choices as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  };
  const { bundles, warnings, expandedFeats } = collectBundles(build, rules);
  this.b14Warnings = warnings;
  this.b14Resolved = resolveCharacter({
    baseAbilities: build.baseAbilities,
    level: build.levels.length,
    bundles,
    choices: build.choices,
    levels: build.levels,
    equippedItemIds: this.b14Worn,
    expandedFeats,
    rules,
  });
});

Then(
  'the 2014 character has STR {int}, CON {int} and WIS {int}',
  function (this: Builder2014World, str: number, con: number, wis: number) {
    const a = this.b14Resolved!.abilities;
    const got = { str: a.str.total, con: a.con.total, wis: a.wis.total };
    if (JSON.stringify(got) !== JSON.stringify({ str, con, wis })) throw new Error(JSON.stringify(got));
  }
);

Then(
  'the 2014 character has {int} hit points, an armor class of {int} and a proficiency bonus of {int}',
  function (this: Builder2014World, hp: number, ac: number, pb: number) {
    const r = this.b14Resolved!;
    const got = { hp: r.hitPoints.max, ac: r.armorClass.effective, pb: r.proficiencyBonus };
    if (JSON.stringify(got) !== JSON.stringify({ hp, ac, pb })) throw new Error(JSON.stringify(got));
  }
);

Then(
  'the 2014 character has a saving throw bonus of {int} in {string}',
  function (this: Builder2014World, bonus: number, ability: string) {
    const save = this.b14Resolved!.savingThrows[ability as AbilityKey];
    if (save.bonus !== bonus) throw new Error(`Saving throw ${ability}: ${save.bonus}`);
  }
);

Then(
  'the 2014 character has a skill bonus of {int} in {string}',
  function (this: Builder2014World, bonus: number, skill: string) {
    const got = this.b14Resolved!.skills[skill as keyof ResolvedCharacter['skills']].bonus;
    if (got !== bonus) throw new Error(`Skill ${skill}: ${got}`);
  }
);

Then('the 2014 character still has {int} equipment choices to make', function (this: Builder2014World, count: number) {
  const got = this.b14Resolved!.pendingChoices.filter((p) => p.type === 'bundle-choice').length;
  if (got !== count) throw new Error(`Equipment choices: ${got}`);
});

Then('the 2014 character carries a holy symbol from the background', function (this: Builder2014World) {
  const item = this.b14Resolved!.equipment.find((e) => e.itemId === 'holy-symbol' && e.source.origin === 'background');
  if (!item) throw new Error('No holy symbol from the background');
});

Then(
  'the engine warns that {string} does not belong to {string}',
  function (this: Builder2014World, subclass: string, classId: string) {
    const expected = `Subclass "${subclass}" does not belong to class "${classId}"`;
    if (!this.b14Warnings!.some((w) => w.startsWith(expected))) {
      throw new Error(`No warning in ${JSON.stringify(this.b14Warnings)}`);
    }
  }
);
