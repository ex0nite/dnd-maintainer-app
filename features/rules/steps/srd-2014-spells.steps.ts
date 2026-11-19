import { Given, Then } from '@cucumber/cucumber';
import type { DndWorld } from '../../steps/support/world.js';
import { buildRuleSet } from '@/lib/rules/ruleset';
import type { RuleSet } from '@/lib/rules/types';
import type { ResolvedCharacter } from '@/types/resolved';

/**
 * Steps for features/rules/srd-2014-spells.feature (story 9.8, resolver seam). The sheet comes from the steps of
 * srd-2014-classes.steps.ts ("a 2014 {string} at level {int}").
 */

interface SpellsWorld extends DndWorld {
  rulesSpells2014?: RuleSet;
  sheetClasses2014?: ResolvedCharacter;
}

const sheet = (world: SpellsWorld): NonNullable<ResolvedCharacter['spellcasting']> => {
  const spellcasting = world.sheetClasses2014?.spellcasting;
  if (!spellcasting) throw new Error('The sheet has no spellcasting');
  return spellcasting;
};

Given('the 2014 rules', function (this: SpellsWorld) {
  this.rulesSpells2014 = buildRuleSet('2014');
});

Then('the 2014 rules hold {int} spells', function (this: SpellsWorld, count: number) {
  const size = this.rulesSpells2014!.spells.size;
  if (size !== count) throw new Error(`Expected ${count} spells, got ${size}`);
  if (this.rulesSpells2014!.invalid.length > 0) throw new Error('Some entries are invalid');
});

Then(
  'the 2014 spell {string} is a level {int} spell of the classes {string}',
  function (this: SpellsWorld, id: string, level: number, classes: string) {
    const spell = this.rulesSpells2014!.spells.get(id);
    if (!spell) throw new Error(`No spell ${id}`);
    if (spell.level !== level) throw new Error(`Level ${spell.level}, expected ${level}`);
    const actual = [...spell.nativeClasses].sort().join(', ');
    if (actual !== classes) throw new Error(`Classes ${actual}, expected ${classes}`);
  }
);

Then('the 2014 sheet has the spell slots {string}', function (this: SpellsWorld, slots: string) {
  const actual = this.sheetClasses2014?.spellcasting?.slots.join(',') ?? '';
  if (actual !== slots) throw new Error(`Slots "${actual}", expected "${slots}"`);
});

Then(
  'the 2014 sheet has {int} pact magic slots of level {int}',
  function (this: SpellsWorld, count: number, level: number) {
    const pact = sheet(this).pactMagic;
    if (pact?.count !== count || pact.slotLevel !== level) throw new Error(`Pact magic ${JSON.stringify(pact)}`);
  }
);

Then('the 2014 sheet knows {int} cantrips', function (this: SpellsWorld, count: number) {
  if (sheet(this).cantripsKnown !== count) throw new Error(`Cantrips known ${sheet(this).cantripsKnown}`);
});

Then('the 2014 sheet has {int} spells to learn', function (this: SpellsWorld, count: number) {
  if (sheet(this).knownTotal !== count) throw new Error(`Spells to learn ${sheet(this).knownTotal}`);
});

Then('the 2014 sheet prepares {int} spells', function (this: SpellsWorld, count: number) {
  if (sheet(this).preparedCount !== count) throw new Error(`Prepared ${sheet(this).preparedCount}`);
});

Then('the 2014 sheet always prepares {string}', function (this: SpellsWorld, spells: string) {
  const actual = sheet(this).alwaysPreparedSpells.join(', ');
  if (actual !== spells) throw new Error(`Always prepared "${actual}", expected "${spells}"`);
});

Then(
  'the 2014 sheet offers {int} options to pick among {int} invocations',
  function (this: SpellsWorld, count: number, options: number) {
    const picks = this.sheetClasses2014!.pendingChoices.filter((p) => p.type === 'feature-picks');
    const asked = picks.reduce((n, p) => n + (p.type === 'feature-picks' ? p.count : 0), 0);
    const listed = picks[0]?.type === 'feature-picks' ? picks[0].options.length : 0;
    if (asked !== count || listed !== options) throw new Error(`Picks ${asked} among ${listed}`);
  }
);
