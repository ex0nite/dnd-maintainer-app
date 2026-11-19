import { Given, Then } from '@cucumber/cucumber';
import type { DndWorld } from '../../steps/support/world.js';
import { buildRuleSet } from '@/lib/rules/ruleset';
import type { RuleSet } from '@/lib/rules/types';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import type { ClassId } from '@/lib/dnd-helpers';
import type { BuildLevel, ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { ResolvedCharacter } from '@/types/resolved';

/**
 * Steps for features/rules/srd-2014-classes.feature (story 9.6, resolver seam): the 2014 rule set (generated SRD 5.1
 * layer, no library) resolves a single-class character level by level.
 */

interface Classes2014World extends DndWorld {
  rulesClasses2014?: RuleSet;
  sheetClasses2014?: ResolvedCharacter;
}

const TENS = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

function resolve(world: Classes2014World, classId: string, level: number, subclassId?: string): void {
  const rules = (world.rulesClasses2014 ??= buildRuleSet('2014'));
  const levels: BuildLevel[] = Array.from({ length: level }, (_, i) => ({
    classId: classId as ClassId,
    classLevel: i + 1,
    hpRoll: null,
  }));
  const choices: Record<string, ChoiceDecision> = subclassId
    ? { [`subclass:class:${classId}:0`]: { type: 'subclass', subclassId } }
    : {};
  const build = {
    speciesId: 'human',
    backgroundId: null,
    baseAbilities: TENS,
    abilityMethod: 'standard-array' as const,
    levels,
    choices: choices as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  };
  const { bundles, expandedFeats } = collectBundles(build, rules);
  world.sheetClasses2014 = resolveCharacter({
    baseAbilities: TENS,
    level,
    bundles,
    choices: build.choices,
    expandedFeats,
    rules,
    levels,
  });
}

Given('a 2014 {string} at level {int}', function (this: Classes2014World, classId: string, level: number) {
  resolve(this, classId, level);
});

Given(
  'a 2014 {string} at level {int} with the subclass {string}',
  function (this: Classes2014World, classId: string, level: number, subclassId: string) {
    resolve(this, classId, level, subclassId);
  }
);

const pending = (world: Classes2014World, type: string) =>
  world.sheetClasses2014!.pendingChoices.filter((p) => p.type === type);

Then('the 2014 sheet offers no subclass', function (this: Classes2014World) {
  if (pending(this, 'subclass').length > 0) throw new Error('A subclass is offered too early');
});

Then(
  'the 2014 sheet offers the subclass of the {string} to choose',
  function (this: Classes2014World, classId: string) {
    const offered = pending(this, 'subclass');
    if (offered.length !== 1 || offered[0].choiceKey !== `subclass:class:${classId}:0`) {
      throw new Error(
        `Expected the ${classId} subclass choice, got ${JSON.stringify(offered.map((p) => p.choiceKey))}`
      );
    }
  }
);

Then('the 2014 sheet offers {int} ability score improvements', function (this: Classes2014World, count: number) {
  const offered = pending(this, 'asi').length;
  if (offered !== count) throw new Error(`Expected ${count} improvements, got ${offered}`);
  if (pending(this, 'feat-choice').length > 0) throw new Error('A feat is offered (feats are optional in 2014)');
});

Then('the 2014 sheet has no weapon mastery', function (this: Classes2014World) {
  const sheet = this.sheetClasses2014!;
  if (sheet.weaponMasteries.length > 0) throw new Error('Weapon masteries found');
  if (pending(this, 'weapon-mastery-choice').length > 0) throw new Error('A weapon mastery is offered');
});

Then(
  'the 2014 sheet has proficiency in the saving throws {string} and {string}',
  function (this: Classes2014World, a: string, b: string) {
    const saves = Object.entries(this.sheetClasses2014!.savingThrows)
      .filter(([, s]) => s.proficient)
      .map(([k]) => k)
      .sort();
    if (JSON.stringify(saves) !== JSON.stringify([a, b].sort())) throw new Error(`Saving throws: ${saves}`);
  }
);

Then(
  'the 2014 sheet has a hit die of {int} and {int} hit points',
  function (this: Classes2014World, die: number, hp: number) {
    const sheet = this.sheetClasses2014!;
    if (sheet.hitDie[0]?.die !== die) throw new Error(`Hit die ${JSON.stringify(sheet.hitDie)}`);
    if (sheet.hitPoints.max !== hp) throw new Error(`Hit points ${sheet.hitPoints.max}, expected ${hp}`);
  }
);

Then('the 2014 sheet has a proficiency bonus of {int}', function (this: Classes2014World, bonus: number) {
  if (this.sheetClasses2014!.proficiencyBonus !== bonus) throw new Error('Wrong proficiency bonus');
});

Then(
  'the 2014 sheet offers {int} skills to choose among {int}',
  function (this: Classes2014World, count: number, pool: number) {
    const choice = pending(this, 'skill-choice')[0] as { count?: number; from?: readonly string[] | null } | undefined;
    if (!choice || choice.count !== count || choice.from?.length !== pool) {
      throw new Error(`Skill choice: ${JSON.stringify(choice)}`);
    }
  }
);

Then(
  'the 2014 sheet has the features {string}, {string} and {string}',
  function (this: Classes2014World, a: string, b: string, c: string) {
    const ids = this.sheetClasses2014!.features.map((f) => f.feature.id);
    for (const id of [a, b, c]) if (!ids.includes(id)) throw new Error(`Missing "${id}" in ${JSON.stringify(ids)}`);
  }
);
