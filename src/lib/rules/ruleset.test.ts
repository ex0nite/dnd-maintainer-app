import { describe, expect, it } from 'vitest';
import { buildRuleSet, builtin2024RuleSet, classOfSubclass, missingReason, spellsForList } from '@/lib/rules/ruleset';
import { ruleAwareT, ruleDisplayName, ruleSummary } from '@/lib/rules/display';
import { ruleKey } from '@/lib/rules/types';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import { reconstructBuild, type BuildLevelRow } from '@/lib/build-reconstruction';
import { BACKGROUND_SOURCES } from '@/lib/sources/backgrounds';
import { CLASS_SOURCES } from '@/lib/sources/classes';
import { FEAT_SOURCES } from '@/lib/sources/feats';
import { SPECIES_SOURCES } from '@/lib/sources/species';
import { SUBCLASS_SOURCES } from '@/lib/sources/subclasses';
import type { CharacterBuild, ChoiceKey } from '@/types/choices';
import {
  BACKGROUND_ENTRY,
  CLASS_ENTRY,
  FEAT_ENTRY,
  ITEM_ENTRY,
  SPECIES_ENTRY,
  SPELL_ENTRY,
  SUBCLASS_ENTRY,
  SUBSPECIES_ENTRY,
  row,
  withChange,
} from '@/test/rule-fixtures';

const ABILITIES = { str: 10, dex: 14, con: 12, int: 10, wis: 15, cha: 8 };

function build(partial: Partial<CharacterBuild>): CharacterBuild {
  return {
    speciesId: 'human',
    backgroundId: null,
    baseAbilities: ABILITIES,
    abilityMethod: 'standard-array',
    levels: [],
    choices: {},
    feats: [],
    activeItems: [],
    ...partial,
  };
}

const LIBRARY = [
  SPECIES_ENTRY,
  SUBSPECIES_ENTRY,
  SUBCLASS_ENTRY,
  BACKGROUND_ENTRY,
  FEAT_ENTRY,
  SPELL_ENTRY,
  ITEM_ENTRY,
].map((e) => row(e));

describe('built-in 2024 rule set', () => {
  const rules = builtin2024RuleSet();

  it('holds the very objects of the TypeScript sources, in their order', () => {
    expect([...rules.species.values()]).toEqual(SPECIES_SOURCES);
    expect([...rules.species.values()][0]).toBe(SPECIES_SOURCES[0]);
    expect([...rules.classes.values()]).toEqual(CLASS_SOURCES);
    expect([...rules.backgrounds.values()]).toEqual(BACKGROUND_SOURCES);
    expect([...rules.feats.values()]).toEqual(FEAT_SOURCES);
    expect(rules.subclasses.get('champion')).toBe(SUBCLASS_SOURCES.champion);
  });

  it('is built once and reused', () => {
    expect(builtin2024RuleSet()).toBe(rules);
  });

  it('has no library entry, nothing unverified or invalid', () => {
    expect(rules.entries.size).toBe(0);
    expect(rules.unverified).toEqual([]);
    expect(rules.invalid).toEqual([]);
  });

  it('maps every subclass to its class', () => {
    expect(classOfSubclass(rules, 'champion')).toBe('fighter');
    expect(classOfSubclass(rules, 'nope')).toBeUndefined();
  });
});

describe('buildRuleSet: layers', () => {
  it('adds library entries on top of the built-in rules', () => {
    const rules = buildRuleSet('2024', LIBRARY);
    expect(rules.species.has('test-elfkin')).toBe(true);
    expect(rules.species.has('human')).toBe(true);
    expect(rules.subspecies.get('test-hill-folk')?.parent).toBe('test-elfkin');
    expect(rules.subclassesByClass.get('druid')).toContain('test-circle');
    expect(rules.feats.get('test-grit')?.category).toBe('origin');
    expect(rules.items.get('test-charm')?.requiresAttunement).toBe(true);
    expect(rules.lineages.get('test-elfkin')?.dusk).toEqual([{ type: 'resistance', damageType: 'necrotic' }]);
    expect(rules.entries.get(ruleKey('species', 'test-elfkin'))).toMatchObject({ layer: 'library', overrides: false });
  });

  it('lets a library entry replace a built-in rule with the same id, flagged as an override', () => {
    const rules = buildRuleSet('2024', [row(CLASS_ENTRY)]);
    expect(rules.classes.get('wizard')?.levels).toHaveLength(3);
    expect(rules.classes.get('wizard')).not.toBe(CLASS_SOURCES.find((c) => c.id === 'wizard'));
    expect(rules.entries.get(ruleKey('class', 'wizard'))).toMatchObject({ layer: 'library', overrides: true });
  });

  it('moves an overriding subclass to the class it names', () => {
    const moved = withChange(SUBCLASS_ENTRY, (c) => (c.id = 'champion'));
    const rules = buildRuleSet('2024', [row(moved as typeof SUBCLASS_ENTRY)]);
    expect(rules.subclassesByClass.get('fighter')).not.toContain('champion');
    expect(rules.subclassesByClass.get('druid')).toContain('champion');
    expect(classOfSubclass(rules, 'champion')).toBe('druid');
  });

  it('keeps an entry with review notes out of the rules (unusable) and lists it as unverified', () => {
    const pending = withChange(FEAT_ENTRY, (c) => (c.needsReview = ['bonus read from a scan']));
    const override = withChange(FEAT_ENTRY, (c) => {
      c.id = 'alert';
      c.needsReview = ['to check'];
    });
    const rules = buildRuleSet('2024', [row(pending as typeof FEAT_ENTRY), row(override as typeof FEAT_ENTRY)]);
    expect(rules.feats.has('test-grit')).toBe(false);
    expect(rules.feats.get('alert')).toBe(FEAT_SOURCES.find((f) => f.id === 'alert'));
    expect(rules.unverified.map((e) => e.id)).toEqual(['test-grit', 'alert']);
    expect(rules.unverified[1]).toMatchObject({ overrides: true, needsReview: ['to check'] });
    expect(missingReason(rules, 'feat', 'test-grit')).toMatch(/needs review/);
  });

  it('ignores an invalid row, never resolves it, and reports it', () => {
    const evil = withChange(FEAT_ENTRY, (c) => (c.name = { en: '<script>x</script>' }));
    const rules = buildRuleSet('2024', [row(evil as typeof FEAT_ENTRY)]);
    expect(rules.feats.has('test-grit')).toBe(false);
    expect(rules.invalid).toHaveLength(1);
    expect(rules.invalid[0]).toMatchObject({ kind: 'feat', id: 'test-grit' });
    expect(rules.invalid[0].issues[0].path).toBe('name.en');
    expect(missingReason(rules, 'feat', 'test-grit')).toMatch(/invalid/);
  });

  it('ignores a row whose content describes another entry, or of another edition', () => {
    const rules = buildRuleSet('2024', [
      { ruleset: '2024', kind: 'feat', id: 'other-id', content: FEAT_ENTRY },
      row(FEAT_ENTRY, '2014'),
    ]);
    expect(rules.feats.has('test-grit')).toBe(false);
    expect(rules.feats.has('other-id')).toBe(false);
    expect(rules.invalid).toHaveLength(2);
  });

  it('has no built-in 2024 layer for the 2014 rules; the SRD layer sits under the library', () => {
    const srd = withChange(SPECIES_ENTRY, (c) => (c.name = { en: 'SRD Elfkin' }));
    const rules = buildRuleSet('2014', [row(SPECIES_ENTRY, '2014')], { srdEntries: [srd, BACKGROUND_ENTRY] });
    expect(rules.species.has('human')).toBe(false);
    expect(rules.backgrounds.has('test-hermitage')).toBe(true);
    expect(rules.entries.get(ruleKey('background', 'test-hermitage'))).toMatchObject({
      layer: 'srd-2014',
      overrides: false,
    });
    expect(rules.entries.get(ruleKey('species', 'test-elfkin'))).toMatchObject({ layer: 'library', overrides: true });
    expect(buildRuleSet('2014', [], { srdEntries: [] }).species.size).toBe(0);
    // Story 9.5: the generated SRD layer (9 species).
    expect(buildRuleSet('2014').species.size).toBe(9);
  });

  it('adds library spells to the class lists', () => {
    const rules = buildRuleSet('2024', LIBRARY);
    expect(spellsForList(rules, 'wizard', 0).some((s) => s.id === 'test-spark')).toBe(true);
    expect(spellsForList(builtin2024RuleSet(), 'wizard', 0).some((s) => s.id === 'test-spark')).toBe(false);
  });
});

describe('the engine with a rules library', () => {
  const rules = buildRuleSet('2024', LIBRARY);

  it('collects the grants of a library species, its lineage, background and origin feat', () => {
    const b = build({
      speciesId: 'test-elfkin',
      backgroundId: 'test-hermitage',
      choices: {
        ['lineage-choice:species:test-elfkin:0' as ChoiceKey]: { type: 'lineage-choice' as const, lineageId: 'dusk' },
      },
    });
    const { bundles, warnings, expandedFeats } = collectBundles(b, rules);
    expect(warnings).toEqual([]);
    const grants = bundles.flatMap((x) => x.grants);
    expect(grants).toContainEqual({ type: 'ability-bonus', ability: 'dex', bonus: 2 });
    expect(grants).toContainEqual({ type: 'resistance', damageType: 'necrotic' });
    expect(expandedFeats.has('test-grit')).toBe(true);
    const resolved = resolveCharacter({
      baseAbilities: ABILITIES,
      level: 0,
      bundles,
      choices: b.choices,
      expandedFeats,
      rules,
    });
    expect(resolved.abilities.dex.total).toBe(16);
    expect(resolved.resistances.map((r) => r.value)).toContain('necrotic');
  });

  it('applies a library subclass chosen at its class level', () => {
    const b = build({
      levels: [1, 2, 3].map((classLevel) => ({ classId: 'druid' as const, classLevel, hpRoll: null })),
      choices: { ['subclass:class:druid:0' as ChoiceKey]: { type: 'subclass' as const, subclassId: 'test-circle' } },
    });
    const { bundles } = collectBundles(b, rules);
    const subclassBundles = bundles.filter((x) => x.source.origin === 'subclass');
    expect(subclassBundles).toHaveLength(1);
    expect(subclassBundles[0].grants[0]).toMatchObject({ type: 'feature', feature: { id: 'test-circle-gift' } });
  });

  it('offers library spells in a spell choice and accepts them', () => {
    const b = build({
      levels: [{ classId: 'bard', classLevel: 1, hpRoll: null }],
      choices: {
        ['spell-choice:class:bard:0' as ChoiceKey]: { type: 'spell-choice' as const, spellIds: ['test-spark'] },
      },
    });
    const withLibrary = collectBundles(b, rules);
    expect(withLibrary.bundles.flatMap((x) => x.grants)).toContainEqual({
      type: 'spell',
      spellId: 'test-spark',
      alwaysPrepared: false,
    });
    expect(collectBundles(b).warnings.some((w) => w.includes('test-spark'))).toBe(true);
  });

  it('does not resolve an unverified entry and says why', () => {
    const pending = withChange(SPECIES_ENTRY, (c) => (c.needsReview = ['speed to confirm']));
    const { bundles, warnings } = collectBundles(
      build({ speciesId: 'test-elfkin' }),
      buildRuleSet('2024', [row(pending as typeof SPECIES_ENTRY)])
    );
    expect(bundles.some((x) => x.source.origin === 'species')).toBe(false);
    expect(warnings.some((w) => w.includes('needs review'))).toBe(true);
  });

  it('behaves exactly as before without a library (default rule set)', () => {
    const b = build({ speciesId: 'human', levels: [{ classId: 'fighter', classLevel: 1, hpRoll: null }] });
    // A library that does not touch these ids changes nothing for this build.
    expect(collectBundles(b, buildRuleSet('2024', LIBRARY)).bundles).toEqual(collectBundles(b).bundles);
  });

  it('reconstructs a stored build that uses library ids', () => {
    const rows: BuildLevelRow[] = [
      {
        sequence: 0,
        base_abilities: ABILITIES,
        ability_method: 'standard-array',
        choices: { 'feat-choice:species:test-elfkin:0': { type: 'feat-choice', featId: 'test-grit' } },
        deleted_at: null,
      },
      {
        sequence: 1,
        class_id: 'druid',
        class_level: 1,
        subclass_id: 'test-circle',
        asi_allocation: null,
        hp_roll: null,
        feat_id: null,
        choices: null,
        deleted_at: null,
      },
    ];
    const identity = { species: 'test-elfkin', background: 'test-hermitage' };
    const b = reconstructBuild(identity, rows, [], undefined, rules);
    expect(b.speciesId).toBe('test-elfkin');
    expect(b.backgroundId).toBe('test-hermitage');
    expect(b.choices['subclass:class:druid:0' as ChoiceKey]).toEqual({ type: 'subclass', subclassId: 'test-circle' });
    expect(b.choices['feat-choice:species:test-elfkin:0' as ChoiceKey]).toEqual({
      type: 'feat-choice',
      featId: 'test-grit',
    });
    // Without the library the same ids are unknown: a warning, the build stays readable, the decisions are kept.
    const warnings: string[] = [];
    const bare = reconstructBuild(identity, rows, [], (m) => warnings.push(m));
    expect(bare.speciesId).toBe('test-elfkin');
    expect(warnings.some((w) => w.includes('test-elfkin'))).toBe(true);
    expect(bare.choices['feat-choice:species:test-elfkin:0' as ChoiceKey]).toEqual({
      type: 'feat-choice',
      featId: 'test-grit',
    });
    const resolved = collectBundles(bare);
    expect(resolved.warnings.some((w) => w.includes('test-elfkin'))).toBe(true);
  });
});

describe('story 9.3 review: engine hardening', () => {
  const rules = buildRuleSet('2024', LIBRARY);

  it('never takes a lineage from Object.prototype, nor one the grant does not offer', () => {
    for (const lineageId of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const b = build({
        speciesId: 'test-elfkin',
        choices: {
          ['lineage-choice:species:test-elfkin:0' as ChoiceKey]: { type: 'lineage-choice' as const, lineageId },
        },
      });
      const { bundles, warnings } = collectBundles(b, rules);
      expect(bundles.every((x) => Array.isArray(x.grants))).toBe(true);
      expect(warnings.some((w) => w.includes(lineageId))).toBe(true);
    }
    const elf = build({
      speciesId: 'elf',
      choices: {
        ['lineage-choice:species:elf:0' as ChoiceKey]: { type: 'lineage-choice' as const, lineageId: 'dusk' },
      },
    });
    expect(collectBundles(elf, rules).warnings.some((w) => w.includes('dusk'))).toBe(true);
  });

  it('resolves a library cantrip as a cantrip (spellcasting reads the rule set)', () => {
    const b = build({
      levels: [{ classId: 'bard', classLevel: 1, hpRoll: null }],
      choices: {
        ['spell-choice:class:bard:0' as ChoiceKey]: { type: 'spell-choice' as const, spellIds: ['test-spark'] },
      },
    });
    const { bundles, expandedFeats } = collectBundles(b, rules);
    const resolved = resolveCharacter({
      baseAbilities: ABILITIES,
      level: 1,
      bundles,
      choices: b.choices,
      expandedFeats,
      rules,
    });
    expect(resolved.spellcasting?.cantrips).toContain('test-spark');
    expect(resolved.spellcasting?.knownSpells.some((k) => k.spellId === 'test-spark')).toBe(false);
  });

  it('honours a library spell that replaces a built-in one (its level)', () => {
    const builtinCantrip = spellsForList(builtin2024RuleSet(), 'bard', 0)[0];
    const replaced = withChange(SPELL_ENTRY, (c) => {
      c.id = builtinCantrip.id;
      (c.body as Record<string, unknown>).level = 1;
    });
    const over = buildRuleSet('2024', [row(replaced as typeof SPELL_ENTRY)]);
    expect(over.spells.get(builtinCantrip.id)?.level).toBe(1);
    expect(over.entries.get(ruleKey('spell', builtinCantrip.id))?.overrides).toBe(true);
  });

  it('keeps the quick-build hints of a class it replaces', () => {
    const over = buildRuleSet('2024', [row(CLASS_ENTRY)]);
    const builtin = CLASS_SOURCES.find((c) => c.id === 'wizard');
    expect(over.classes.get('wizard')?.quickBuild).toBe(builtin?.quickBuild);
  });

  it('is frozen at the top level', () => {
    expect(Object.isFrozen(rules)).toBe(true);
    expect(Object.isFrozen(rules.invalid)).toBe(true);
  });
});

describe('display names', () => {
  const rules = buildRuleSet('2024', [...LIBRARY, row(CLASS_ENTRY)]);
  const t = (key: string) => `t(${key})`;

  it('shows the own name of a library entry, in French when the interface is French', () => {
    expect(ruleDisplayName(rules, 'species', 'test-elfkin', 'fr', t)).toBe('Elfelin');
    expect(ruleDisplayName(rules, 'species', 'test-elfkin', 'en', t)).toBe('Elfkin');
    expect(ruleDisplayName(rules, 'class', 'wizard', 'fr-FR', t)).toBe('Magicien de test');
  });

  it('falls back to English when the entry has no French name', () => {
    expect(ruleDisplayName(rules, 'background', 'test-hermitage', 'fr', t)).toBe('Hermitage');
  });

  it('uses the gamedata key for a built-in entity, the raw id for an unknown one', () => {
    expect(ruleDisplayName(rules, 'species', 'human', 'fr', t)).toBe('t(species.human)');
    expect(ruleDisplayName(rules, 'subclass', 'champion', 'en', t)).toBe('t(subclasses.champion.name)');
    expect(ruleDisplayName(rules, 'feat', 'alert', 'en', t)).toBe('t(feats.alert.name)');
    expect(ruleDisplayName(rules, 'feat', 'no-such-feat', 'en', t)).toBe('no-such-feat');
  });

  it('does not rename a built-in rule after an unverified entry that would replace it', () => {
    const pending = withChange(FEAT_ENTRY, (c) => {
      c.id = 'alert';
      c.needsReview = ['check'];
    });
    const rules = buildRuleSet('2024', [row(pending as typeof FEAT_ENTRY)]);
    expect(ruleDisplayName(rules, 'feat', 'alert', 'fr', t)).toBe('t(feats.alert.name)');
  });

  it('names an unverified entry with a new id, so the DM recognizes it', () => {
    const pending = withChange(FEAT_ENTRY, (c) => (c.needsReview = ['check']));
    expect(
      ruleDisplayName(buildRuleSet('2024', [row(pending as typeof FEAT_ENTRY)]), 'feat', 'test-grit', 'fr', t)
    ).toBe('Cran');
  });

  it('gives the own summary in the interface language', () => {
    expect(ruleSummary(rules, 'species', 'test-elfkin', 'fr')).toBe('Petit peuple des bois de test.');
    expect(ruleSummary(rules, 'subclass', 'test-circle', 'fr')).toBe('Druids who test everything twice.');
    expect(ruleSummary(rules, 'species', 'human', 'en')).toBeUndefined();
  });
});

describe('ruleAwareT', () => {
  const rules = buildRuleSet('2024', [...LIBRARY, row(CLASS_ENTRY)]);
  const calls: unknown[][] = [];
  const t = (key: string, options?: { defaultValue?: string }) => {
    calls.push([key, options]);
    return `t(${key})`;
  };

  it('answers entity keys of library entries with their own text, verbatim', () => {
    const rt = ruleAwareT(rules, 'fr', t);
    expect(rt('species.test-elfkin')).toBe('Elfelin');
    expect(rt('feats.test-grit.name')).toBe('Cran');
    expect(rt('subclasses.test-circle.description')).toBe('Druids who test everything twice.');
    expect(rt('classes.wizard')).toBe('Magicien de test');
  });

  it('passes built-in keys and other keys to the translator unchanged', () => {
    calls.length = 0;
    const rt = ruleAwareT(rules, 'en', t);
    expect(rt('species.human')).toBe('t(species.human)');
    expect(rt('skills.arcana', { defaultValue: 'x' })).toBe('t(skills.arcana)');
    expect(calls).toEqual([
      ['species.human', undefined],
      ['skills.arcana', { defaultValue: 'x' }],
    ]);
  });

  it('never returns a raw key for an unknown id', () => {
    const rt = ruleAwareT(rules, 'en', t);
    expect(rt('species.no-such-folk')).toBe('no-such-folk');
    expect(rt('feats.no-such-feat.description')).toBe('');
    expect(rt('backgrounds.no-such-bg', { defaultValue: 'fallback' })).toBe('fallback');
  });
});
