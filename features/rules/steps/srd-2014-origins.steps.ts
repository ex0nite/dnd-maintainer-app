import { Given, Then, When } from '@cucumber/cucumber';
import type { DndWorld } from '../../steps/support/world.js';
import { buildRuleSet } from '@/lib/rules/ruleset';
import type { RuleSet } from '@/lib/rules/types';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import type { AbilityKey } from '@/lib/dnd-helpers';
import type { ChoiceDecision, ChoiceKey } from '@/types/choices';
import type { ResolvedCharacter } from '@/types/resolved';

/**
 * Steps for features/rules/srd-2014-origins.feature (story 9.5, resolver seam): the 2014 rule set (generated SRD 5.1
 * layer, no library) resolves a species, its subspecies and a background.
 */

interface Srd2014World extends DndWorld {
  rules2014?: RuleSet;
  species2014?: string;
  background2014?: string | null;
  choices2014?: Record<string, ChoiceDecision>;
  resolved2014?: ResolvedCharacter;
  warnings2014?: readonly string[];
}

const ABILITY: Record<string, AbilityKey> = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };

Given('a character of a 2014 campaign with base abilities of 10', function (this: Srd2014World) {
  this.rules2014 = buildRuleSet('2014');
  this.background2014 = null;
  this.choices2014 = {};
});

Given(
  'the species {string} with the subspecies {string}',
  function (this: Srd2014World, species: string, subspecies: string) {
    this.species2014 = species;
    // The subspecies choice of an SRD species is its first lineage choice (no SRD species with subspecies has another).
    this.choices2014![`lineage-choice:species:${species}:0`] = { type: 'lineage-choice', lineageId: subspecies };
  }
);

Given('the background {string}', function (this: Srd2014World, background: string) {
  this.background2014 = background;
});

When('the 2014 sheet is resolved', function (this: Srd2014World) {
  const choices = this.choices2014 as Record<ChoiceKey, ChoiceDecision>;
  const baseAbilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const { bundles, warnings, expandedFeats } = collectBundles(
    {
      speciesId: this.species2014!,
      backgroundId: this.background2014 ?? null,
      baseAbilities,
      abilityMethod: 'standard-array',
      levels: [],
      choices,
      feats: [],
      activeItems: [],
    },
    this.rules2014
  );
  this.warnings2014 = warnings;
  this.resolved2014 = resolveCharacter({
    baseAbilities,
    level: 0,
    bundles,
    choices,
    expandedFeats,
    rules: this.rules2014,
  });
});

function expectAbilities(world: Srd2014World, expected: Partial<Record<AbilityKey, number>>, others: number): void {
  for (const [key, ability] of Object.entries(world.resolved2014!.abilities)) {
    const want = expected[key as AbilityKey] ?? others;
    if (ability.total !== want) throw new Error(`${key}: expected ${want}, got ${ability.total}`);
  }
}

Then(
  'the 2014 character has {word} {int} and {word} {int} and every other ability at {int}',
  function (this: Srd2014World, a: string, av: number, b: string, bv: number, others: number) {
    expectAbilities(this, { [ABILITY[a]]: av, [ABILITY[b]]: bv }, others);
  }
);

Then(
  'the 2014 character has {word} {int} and every other ability at {int}',
  function (this: Srd2014World, a: string, av: number, others: number) {
    expectAbilities(this, { [ABILITY[a]]: av }, others);
  }
);

Then(
  'the 2014 character walks {int} feet and is of size {string}',
  function (this: Srd2014World, feet: number, size: string) {
    const walk = this.resolved2014!.speed.walk?.value;
    if (walk !== feet) throw new Error(`Expected a walking speed of ${feet}, got ${walk}`);
    const actual = this.rules2014!.species.get(this.species2014!)?.defaultSize;
    if (actual !== size) throw new Error(`Expected size ${size}, got ${actual}`);
  }
);

Then('the 2014 character speaks {string} and {string}', function (this: Srd2014World, a: string, b: string) {
  const languages = this.resolved2014!.languages.map((l) => l.value as string);
  if (JSON.stringify(languages) !== JSON.stringify([a, b]))
    throw new Error(`Languages were ${JSON.stringify(languages)}`);
});

Then('the 2014 character is resistant to {string}', function (this: Srd2014World, damage: string) {
  const resistances = this.resolved2014!.resistances.map((r) => r.value as string);
  if (!resistances.includes(damage)) throw new Error(`Resistances were ${JSON.stringify(resistances)}`);
});

Then(
  'the 2014 character has the traits {string}, {string} and {string}',
  function (this: Srd2014World, a: string, b: string, c: string) {
    const ids = this.resolved2014!.features.map((f) => f.feature.id);
    for (const id of [a, b, c])
      if (!ids.includes(id)) throw new Error(`Missing trait "${id}" in ${JSON.stringify(ids)}`);
  }
);

Then('the 2014 character is proficient in {string} and {string}', function (this: Srd2014World, a: string, b: string) {
  const skills = this.resolved2014!.skills as Record<string, { proficient: boolean }>;
  for (const id of [a, b]) if (!skills[id]?.proficient) throw new Error(`Not proficient in ${id}`);
});

Then('the 2014 character is offered no feat and no ability score choice', function (this: Srd2014World) {
  const offered = this.resolved2014!.pendingChoices.filter((p) =>
    ['feat-choice', 'asi', 'ability-choice'].includes(p.type)
  );
  if (offered.length > 0) throw new Error(`Unexpected choices: ${JSON.stringify(offered.map((p) => p.choiceKey))}`);
});

Then('the engine warns about the lineage {string}', function (this: Srd2014World, id: string) {
  if (!this.warnings2014!.some((w) => w.includes(`lineage "${id}"`))) {
    throw new Error(`No warning about "${id}": ${JSON.stringify(this.warnings2014)}`);
  }
});
