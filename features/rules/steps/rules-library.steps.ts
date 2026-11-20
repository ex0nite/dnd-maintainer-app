import { Given, Then, When } from '@cucumber/cucumber';
import type { DndWorld } from '../../steps/support/world.js';
import { buildRuleSet, builtin2024RuleSet, type RuleEntryRow } from '@/lib/rules/ruleset';
import { ruleKey, type RuleSet } from '@/lib/rules/types';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import type { CharacterBuild, ChoiceKey } from '@/types/choices';
import type { ResolvedCharacter } from '@/types/resolved';
import { FEAT_ENTRY, SUBCLASS_ENTRY, row, withChange } from '@/test/rule-fixtures';

/**
 * Steps for features/rules/rules-library.feature (story 9.3, resolver seam).
 * The library is a list of rows as the database returns them; the rule set is built from them exactly as the app does
 * (`buildRuleSet`, which validates every row again).
 */

interface RulesWorld extends DndWorld {
  rules?: RuleSet;
  resolvedWithRules?: ResolvedCharacter;
  rulesBuild?: CharacterBuild;
}

function library(world: RulesWorld, rows: RuleEntryRow[]): void {
  world.rules = buildRuleSet('2024', rows);
}

function resolveWith(build: CharacterBuild, rules: RuleSet): ResolvedCharacter {
  const { bundles, expandedFeats } = collectBundles(build, rules);
  return resolveCharacter({
    baseAbilities: build.baseAbilities,
    level: build.levels.length,
    bundles,
    choices: build.choices,
    levels: build.levels,
    expandedFeats,
    rules,
  });
}

Given("the DM's 2024 rules library is empty", function (this: RulesWorld) {
  library(this, []);
});

Given(
  "the DM's 2024 rules library holds the invented druid subclass {string}",
  function (this: RulesWorld, id: string) {
    library(this, [row(withChange(SUBCLASS_ENTRY, (c) => (c.id = id)) as typeof SUBCLASS_ENTRY)]);
  }
);

Given(
  "the DM's 2024 rules library holds the invented druid subclass {string} with review notes",
  function (this: RulesWorld, id: string) {
    const entry = withChange(SUBCLASS_ENTRY, (c) => {
      c.id = id;
      c.needsReview = ['feature level read from a scan, to confirm'];
    });
    library(this, [row(entry as typeof SUBCLASS_ENTRY)]);
  }
);

Given(
  "the DM's 2024 rules library holds an entry replacing the built-in feat {string}",
  function (this: RulesWorld, id: string) {
    library(this, [row(withChange(FEAT_ENTRY, (c) => (c.id = id)) as typeof FEAT_ENTRY)]);
  }
);

Given(
  "the DM's 2024 rules library holds a feat {string} whose name contains markup",
  function (this: RulesWorld, id: string) {
    const entry = withChange(FEAT_ENTRY, (c) => {
      c.id = id;
      c.name = { en: '<img src=x onerror=alert(1)>' };
    });
    library(this, [row(entry as typeof FEAT_ENTRY)]);
  }
);

When('a level 3 druid chooses the subclass {string}', function (this: RulesWorld, subclassId: string) {
  const build: CharacterBuild = {
    speciesId: 'human',
    backgroundId: null,
    baseAbilities: { str: 10, dex: 14, con: 12, int: 10, wis: 15, cha: 8 },
    abilityMethod: 'standard-array',
    levels: [1, 2, 3].map((classLevel) => ({ classId: 'druid' as const, classLevel, hpRoll: null })),
    choices: { ['subclass:class:druid:0' as ChoiceKey]: { type: 'subclass' as const, subclassId } },
    feats: [],
    activeItems: [],
  };
  this.rulesBuild = build;
  this.resolvedWithRules = resolveWith(build, this.rules!);
});

Then('the character has the feature {string}', function (this: RulesWorld, featureId: string) {
  const ids = this.resolvedWithRules!.features.map((f) => f.feature.id);
  if (!ids.includes(featureId))
    throw new Error(`Expected feature "${featureId}", features were ${JSON.stringify(ids)}`);
});

Then('the character does not have the feature {string}', function (this: RulesWorld, featureId: string) {
  if (this.resolvedWithRules!.features.some((f) => f.feature.id === featureId)) {
    throw new Error(`Feature "${featureId}" was resolved although its entry is not usable`);
  }
});

Then('the rules flag the feat {string} as replacing a built-in rule', function (this: RulesWorld, id: string) {
  const info = this.rules!.entries.get(ruleKey('feat', id));
  if (!info?.overrides)
    throw new Error(`Expected feat "${id}" to be flagged as an override, got ${JSON.stringify(info)}`);
  if (this.rules!.feats.get(id) === builtin2024RuleSet().feats.get(id)) {
    throw new Error(`The built-in feat "${id}" is still in force`);
  }
});

Then('the DM sees {string} waiting for review', function (this: RulesWorld, id: string) {
  if (!this.rules!.unverified.some((e) => e.id === id)) throw new Error(`"${id}" is not listed as waiting for review`);
});

Then('the rules have no feat {string}', function (this: RulesWorld, id: string) {
  if (this.rules!.feats.has(id)) throw new Error(`The invalid feat "${id}" was loaded`);
});

Then('the DM sees {string} as ignored', function (this: RulesWorld, id: string) {
  if (!this.rules!.invalid.some((e) => e.id === id)) throw new Error(`"${id}" is not listed as ignored`);
});

Then('the sheet is the same as with the built-in rules alone', function (this: RulesWorld) {
  const builtin = resolveWith(this.rulesBuild!, builtin2024RuleSet());
  if (JSON.stringify(builtin) !== JSON.stringify(this.resolvedWithRules)) {
    throw new Error('An empty library changed the resolved sheet');
  }
});
