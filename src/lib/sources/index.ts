import type { SpeciesId, ClassId, BackgroundId, FeatId } from '@/lib/dnd-helpers';
import { builtin2024RuleSet, missingReason, spellChoicePool, subspeciesChoice } from '@/lib/rules/ruleset';
import { collectGrantsByType, extraSpellIdsOf } from '@/lib/resolver/helpers';
import { featurePicksPool, otherPicks } from '@/lib/resolver/feature-picks';
import type { RuleSet } from '@/lib/rules/types';
import type { RuleEntryKind } from '@/lib/rules/schemas';
import { getLogger } from '@/lib/logger';

const logger = getLogger('sources');
import type {
  SpeciesSource,
  ClassSource,
  SubclassSource,
  BackgroundSource,
  FeatSource,
  ItemSource,
  GrantBundle,
  SourceTag,
} from '@/types/sources';
import type { SubclassId } from '@/lib/sources/subclasses';
import type {
  SubclassGrant,
  FightingStyleChoiceGrant,
  LineageChoiceGrant,
  DamageTypeChoiceGrant,
  FeatureChoiceGrant,
  FeatChoiceGrant,
  SpellChoiceGrant,
} from '@/types/grants';
import type { CharacterBuild } from '@/types/choices';
import { SPECIES_SOURCES } from '@/lib/sources/species';
import { CLASS_SOURCES } from '@/lib/sources/classes';
import { SUBCLASS_SOURCES, SUBCLASS_IDS, SUBCLASS_IDS_BY_CLASS, isSubclassId } from '@/lib/sources/subclasses';
import { BACKGROUND_SOURCES } from '@/lib/sources/backgrounds';
import { FEAT_SOURCES } from '@/lib/sources/feats';
import { ITEM_SOURCES } from '@/lib/sources/items';
import { FIGHTING_STYLE_SOURCES, getFightingStyleSource } from '@/lib/sources/fighting-styles';
import type { FightingStyleId } from '@/lib/dnd-helpers';

export type {
  SpeciesSource,
  ClassSource,
  SubclassSource,
  SubclassId,
  BackgroundSource,
  FeatSource,
  ItemSource,
  GrantBundle,
  SourceTag,
};

export {
  SPECIES_SOURCES,
  CLASS_SOURCES,
  SUBCLASS_SOURCES,
  SUBCLASS_IDS,
  SUBCLASS_IDS_BY_CLASS,
  isSubclassId,
  BACKGROUND_SOURCES,
  FEAT_SOURCES,
  ITEM_SOURCES,
  FIGHTING_STYLE_SOURCES,
};
export { getFightingStyleSource };

export function getSpeciesSource(id: SpeciesId): SpeciesSource | undefined {
  return SPECIES_SOURCES.find((r) => r.id === id);
}

export function getClassSource(id: ClassId): ClassSource | undefined {
  return CLASS_SOURCES.find((c) => c.id === id);
}

export function getSubclassSource(id: SubclassId): SubclassSource | undefined {
  return SUBCLASS_SOURCES[id];
}

export function getBackgroundSource(id: BackgroundId): BackgroundSource | undefined {
  return BACKGROUND_SOURCES.find((b) => b.id === id);
}

export function getFeatSource(id: FeatId): FeatSource | undefined {
  return FEAT_SOURCES.find((f) => f.id === id);
}

export { FEAT_CATEGORIES } from '@/types/sources';
export type { FeatCategory } from '@/types/sources';

export function getItemSource(id: string): ItemSource | undefined {
  return ITEM_SOURCES.find((i) => i.id === id);
}

/**
 * Level-gate grants by their optional `minClassLevel` (issue #189). A grant whose `minClassLevel`
 * exceeds the granting class's current level (from `classCounts`) is suppressed. This mirrors the
 * feature-level gate in `collectBundles` (`feature.classLevel <= levelCount`) at grant granularity —
 * e.g. Circle of the Land unlocks its higher circle spells at druid L5/L7/L9 instead of all at L3.
 *
 * Gating is on the *granting class's* level (subclass → its `classId`, class → its `id`), which is
 * multiclass-correct: a druid 5 / wizard 3 unlocks the druid-5 tier, not a total-level tier.
 *
 * If a grant carries `minClassLevel` but its source has no class level to gate against (e.g. a
 * feat/species/background origin), the grant is KEPT and a warning is surfaced rather than silently
 * dropped — `minClassLevel` is only meaningful on class/subclass grants, so this flags an authoring
 * error loudly instead of making a feature vanish. Exported for direct unit testing.
 */
export function gateGrantsByMinClassLevel(
  bundles: readonly GrantBundle[],
  classCounts: ReadonlyMap<ClassId, number>
): { readonly bundles: GrantBundle[]; readonly warnings: string[] } {
  const warnings: string[] = [];
  const classLevelOf = (source: SourceTag): number | undefined => {
    if (source.origin === 'subclass') return classCounts.get(source.classId);
    if (source.origin === 'class') return classCounts.get(source.id);
    return undefined;
  };
  const gated = bundles.map((bundle) => {
    const classLevel = classLevelOf(bundle.source);
    const kept = bundle.grants.filter((g) => {
      const min = (g as { readonly minClassLevel?: number }).minClassLevel;
      if (min == null) return true;
      if (classLevel == null) {
        warnings.push(
          `grant with minClassLevel=${min} on non-class source origin "${bundle.source.origin}" — minClassLevel ignored (no class level to gate against)`
        );
        return true;
      }
      return classLevel >= min;
    });
    return kept.length === bundle.grants.length ? bundle : { source: bundle.source, grants: kept };
  });
  return { bundles: gated, warnings };
}

export interface CollectBundlesResult {
  readonly bundles: readonly GrantBundle[];
  readonly warnings: readonly string[];
  readonly expandedFeats: ReadonlySet<string>;
}

/**
 * Assembles the grant bundles of a build from a rule set (story 9.3). `rules` defaults to the built-in 2024 rules, so
 * callers that predate the rules library behave exactly as before.
 */
export function collectBundles(build: CharacterBuild, rules: RuleSet = builtin2024RuleSet()): CollectBundlesResult {
  const bundles: GrantBundle[] = [];
  const warnings: string[] = [];
  // Extra context when an id is known to the library but not usable (needs review, invalid).
  const why = (kind: RuleEntryKind, id: string): string => {
    const reason = missingReason(rules, kind, id);
    return reason.startsWith('no ') ? '' : ` (${reason})`;
  };

  // Species
  const speciesSource = rules.species.get(build.speciesId);
  if (speciesSource) {
    const tag: SourceTag = { origin: 'species', id: build.speciesId };
    bundles.push({ source: tag, grants: speciesSource.grants });
    // Subspecies (story 9.5): a lineage choice whose decision expands, with the other lineages below, into the
    // subspecies grants, added to the species grants.
    const subspecies = subspeciesChoice(rules, build.speciesId);
    if (subspecies) bundles.push({ source: tag, grants: [subspecies] });
  } else {
    const msg = `No source data found for species "${build.speciesId}" — species grants will be empty${why('species', build.speciesId)}`;
    warnings.push(msg);
    logger.warn(msg);
  }

  // Class levels — count levels per class in order
  const classCounts = new Map<ClassId, number>();
  for (const level of build.levels) {
    const prev = classCounts.get(level.classId) ?? 0;
    classCounts.set(level.classId, prev + 1);
  }

  for (const [classId, levelCount] of classCounts) {
    const classSource = rules.classes.get(classId);
    if (!classSource) {
      const msg = `No source data found for class "${classId}" — class grants will be empty`;
      warnings.push(msg);
      logger.warn(msg);
      continue;
    }
    for (let i = 0; i < levelCount && i < classSource.levels.length; i++) {
      const level = i + 1;
      const tag: SourceTag = { origin: 'class', id: classId, level };
      bundles.push({ source: tag, grants: classSource.levels[i].grants });
    }
  }

  // Subclass features
  for (const [classId, levelCount] of classCounts) {
    const classSource = rules.classes.get(classId);
    if (!classSource) continue;

    // Collect subclass grants from class levels up to levelCount
    const subclassGrants: SubclassGrant[] = [];
    for (let i = 0; i < levelCount && i < classSource.levels.length; i++) {
      for (const grant of classSource.levels[i].grants) {
        if (grant.type === 'subclass') {
          subclassGrants.push(grant as SubclassGrant);
        }
      }
    }

    for (const subclassGrant of subclassGrants) {
      const subclassDecision = build.choices[subclassGrant.key];
      if (subclassDecision?.type === 'subclass') {
        const subclassSource = rules.subclasses.get(subclassDecision.subclassId);
        if (subclassSource && !(rules.subclassesByClass.get(classId) ?? []).includes(subclassDecision.subclassId)) {
          // A subclass chosen for the wrong class (stale stored choice, or a client that skipped the check): its
          // features belong to another class and are not applied.
          const msg = `Subclass "${subclassDecision.subclassId}" does not belong to class "${classId}" � its features are left out`;
          warnings.push(msg);
          logger.warn(msg);
        } else if (subclassSource) {
          for (const feature of subclassSource.features) {
            if (feature.classLevel <= levelCount) {
              const tag: SourceTag = {
                origin: 'subclass',
                id: subclassDecision.subclassId,
                classId,
                level: feature.classLevel,
              };
              bundles.push({ source: tag, grants: feature.grants });
            }
          }
        } else {
          const msg = `No source data found for subclass "${subclassDecision.subclassId}" — subclass features will be empty${why('subclass', subclassDecision.subclassId)}`;
          warnings.push(msg);
          logger.warn(msg);
        }
      }
    }
  }

  // Fighting style choices — expand chosen styles into grant bundles
  const allFightingStyleGrants: { grant: FightingStyleChoiceGrant; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === 'fighting-style-choice') {
        allFightingStyleGrants.push({ grant: grant as FightingStyleChoiceGrant, source: bundle.source });
      }
    }
  }

  for (const { grant, source } of allFightingStyleGrants) {
    const decision = build.choices[grant.key];
    if (decision?.type === 'fighting-style-choice') {
      for (const styleId of decision.styles) {
        const styleSource = getFightingStyleSource(styleId as FightingStyleId);
        if (styleSource) {
          bundles.push({ source, grants: styleSource.grants });
        } else {
          const msg = `No source data found for fighting style "${styleId}"`;
          warnings.push(msg);
          logger.warn(msg);
        }
      }
    }
  }

  // Spell-choice decisions — expand chosen spellIds into individual spell grants so the
  // resolver's collectGrantsByType('spell') loop picks them up.
  const allSpellChoiceGrants: { grant: SpellChoiceGrant; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === 'spell-choice') {
        allSpellChoiceGrants.push({ grant: grant as SpellChoiceGrant, source: bundle.source });
      }
    }
  }

  for (const { grant, source } of allSpellChoiceGrants) {
    const decision = build.choices[grant.key];
    if (decision?.type === 'spell-choice') {
      const pool = spellChoicePool(rules, { ...grant, extraSpellIds: extraSpellIdsOf(bundles, grant.spellList) });
      for (const spellId of decision.spellIds) {
        if (!pool.some((s) => s.id === spellId)) {
          const levels =
            grant.maxSpellLevel !== undefined ? `${grant.spellLevel} to ${grant.maxSpellLevel}` : grant.spellLevel;
          const msg = `spell-choice "${grant.key}" decision references spell "${spellId}" not in ${grant.spellList} list at level ${levels}`;
          warnings.push(msg);
          logger.warn(msg);
          continue;
        }
        bundles.push({
          source,
          grants: [{ type: 'spell', spellId, alwaysPrepared: false }],
        });
      }
    }
  }

  // Damage-type choices — expand chosen damage type into a feature grant whose id
  // is `${featureIdPrefix}-${chosenDamageType}` (e.g. zealot-divine-fury-radiant).
  const allDamageChoiceGrants: { grant: DamageTypeChoiceGrant; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === 'damage-choice') {
        allDamageChoiceGrants.push({ grant: grant as DamageTypeChoiceGrant, source: bundle.source });
      }
    }
  }

  for (const { grant, source } of allDamageChoiceGrants) {
    const decision = build.choices[grant.key];
    if (decision?.type === 'damage-choice') {
      for (const damageType of decision.damageTypes) {
        if (!grant.from.includes(damageType)) continue;
        bundles.push({
          source,
          grants: [{ type: 'feature', feature: { id: `${grant.featureIdPrefix}-${damageType}` } }],
        });
      }
    }
  }

  // Lineage choices — expand chosen lineage into grant bundles
  const allLineageChoiceGrants: { grant: LineageChoiceGrant; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === 'lineage-choice') {
        allLineageChoiceGrants.push({ grant: grant as LineageChoiceGrant, source: bundle.source });
      }
    }
  }

  for (const { grant, source } of allLineageChoiceGrants) {
    const decision = build.choices[grant.key];
    if (decision?.type === 'lineage-choice') {
      // Own keys only (a stored lineageId such as "constructor" must not reach Object.prototype), and only a lineage
      // the grant offers.
      const lineages = rules.lineages.get(grant.speciesId);
      const lineageId = decision.lineageId;
      const lineageGrants =
        lineages && grant.from.includes(lineageId) && Object.prototype.hasOwnProperty.call(lineages, lineageId)
          ? lineages[lineageId]
          : undefined;
      if (Array.isArray(lineageGrants)) {
        bundles.push({ source, grants: lineageGrants });
      } else {
        const msg = `No grants for lineage "${decision.lineageId}" of species "${grant.speciesId}"`;
        warnings.push(msg);
        logger.warn(msg);
      }
    }
  }

  // Background (a free-text background with no entry in the rule set has no grants, silently)
  if (build.backgroundId) {
    const backgroundSource = rules.backgrounds.get(build.backgroundId);
    if (backgroundSource) {
      const tag: SourceTag = { origin: 'background', id: build.backgroundId };
      bundles.push({ source: tag, grants: backgroundSource.grants });
    }
  }

  // Expand FeatGrant grants embedded in already-collected bundles (e.g. background origin feats).
  // Snapshot current length to avoid iterating bundles we add in this pass.
  const expandedFeats = new Set<string>();
  const preFeatExpansionLength = bundles.length;
  for (let i = 0; i < preFeatExpansionLength; i++) {
    const bundle = bundles[i];
    for (const grant of bundle.grants) {
      if (grant.type === 'feat') {
        const featSource = rules.feats.get(grant.featId);
        if (featSource) {
          const tag: SourceTag = { origin: 'feat', id: grant.featId };
          bundles.push({ source: tag, grants: featSource.grants });
          expandedFeats.add(grant.featId);
        } else {
          const msg = `No source data found for feat "${grant.featId}" — feat grants will be empty${why('feat', grant.featId)}`;
          warnings.push(msg);
          logger.warn(msg);
        }
      }
    }
  }

  // Feats explicitly listed in the build (manually chosen at level-up)
  for (const featId of build.feats) {
    if (expandedFeats.has(featId)) continue; // already expanded by background or a prior pass
    const featSource = rules.feats.get(featId);
    if (featSource) {
      const tag: SourceTag = { origin: 'feat', id: featId };
      bundles.push({ source: tag, grants: featSource.grants });
      expandedFeats.add(featId);
    } else {
      const msg = `No source data found for feat "${featId}" — feat grants will be empty${why('feat', featId)}`;
      warnings.push(msg);
      logger.warn(msg);
    }
  }

  // Feat-choice expansion — runs AFTER build.feats so that a chosen feat's own sub-grants
  // (feature-choice, proficiency-choice, etc.) are visible to the feature-choice pass below.
  // Snapshot bundles at the start of the pass to avoid iterating bundles added in this pass.
  const allFeatChoiceGrants: { grant: FeatChoiceGrant; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === 'feat-choice') {
        allFeatChoiceGrants.push({ grant: grant as FeatChoiceGrant, source: bundle.source });
      }
    }
  }

  for (const { grant } of allFeatChoiceGrants) {
    const decision = build.choices[grant.key];
    if (decision?.type === 'feat-choice') {
      if (expandedFeats.has(decision.featId)) continue; // already expanded by background or build.feats pass
      const featSource = rules.feats.get(decision.featId);
      if (featSource) {
        const tag: SourceTag = { origin: 'feat', id: decision.featId };
        bundles.push({ source: tag, grants: featSource.grants });
        expandedFeats.add(decision.featId);
      } else {
        const msg = `No source data found for feat-choice decision "${decision.featId}" — feat grants will be empty${why('feat', decision.featId)}`;
        warnings.push(msg);
        logger.warn(msg);
      }
    }
  }

  // Items
  for (const itemId of build.activeItems) {
    const itemSource = rules.items.get(itemId);
    if (itemSource) {
      const tag: SourceTag = { origin: 'item', id: itemId };
      bundles.push({ source: tag, grants: itemSource.grants });
    } else {
      const msg = `No source data found for item "${itemId}" — item grants will be empty${why('item', itemId)}`;
      warnings.push(msg);
      logger.warn(msg);
    }
  }

  // Feature-choice expansion — runs AFTER all sources (species, class, subclass, background, feat, item)
  // are pushed into bundles so feat-origin feature-choices (e.g. magic-initiate, elemental-adept,
  // resilient) are visible here.
  //
  // SINGLE-PASS SAFETY ASSUMPTION: expansion runs exactly once (not to a fixpoint) AND runs after
  // the feat and lineage expansion passes, so a chosen option whose own grants contain a grant of
  // type 'feat', 'lineage-choice', or 'feature-choice' would be silently dropped. This is safe ONLY
  // because all current feature-choice options expand to terminal grants (proficiency, feature, etc.)
  // — none nests another feat, lineage-choice, or feature-choice. The invariant is enforced by a
  // companion test in index.test.ts; if that test goes red, promote this to a fixpoint loop before
  // adding the new option.
  const allFeatureChoiceGrants: { grant: FeatureChoiceGrant; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === 'feature-choice') {
        allFeatureChoiceGrants.push({ grant: grant as FeatureChoiceGrant, source: bundle.source });
      }
    }
  }

  for (const { grant, source } of allFeatureChoiceGrants) {
    // ClassStep handles 'class' and 'subclass' origins; OriginStep handles 'feat'.
    // Any other origin (e.g. 'item') would produce an invisible pending choice;
    // surface as a warning so the CharacterBuilder amber banner shows it instead of failing silently.
    if (source.origin !== 'class' && source.origin !== 'feat' && source.origin !== 'subclass') {
      const msg = `feature-choice "${grant.key}" has non-class origin "${source.origin}" — no builder UI exists for this origin, choice will be invisible`;
      warnings.push(msg);
      logger.warn(msg);
    }

    const decision = build.choices[grant.key];
    if (decision?.type === 'feature-choice') {
      const option = grant.options.find((o) => o.optionId === decision.optionId);
      if (option) {
        bundles.push({
          source,
          grants: [{ type: 'feature', feature: { id: option.featureId } }, ...option.grants],
        });
      } else {
        const msg = `feature-choice "${grant.key}" decision references unknown option "${decision.optionId}"`;
        warnings.push(msg);
        logger.warn(msg);
      }
    }
  }

  // Feature-picks expansion (story 9.8: 2014 invocations and metamagic). Same single-pass rule as above: the options'
  // grants are terminal. A pick counts when the option exists in the pool, the class level allows it and no earlier
  // grant of the pool took it.
  for (const { grant, source } of collectGrantsByType(bundles, 'feature-picks')) {
    const decision = build.choices[grant.key];
    if (decision?.type !== 'feature-picks') continue;
    const pool = featurePicksPool(bundles, grant.poolId);
    const classLevel = source.origin === 'class' ? (classCounts.get(source.id) ?? 0) : Number.MAX_SAFE_INTEGER;
    const taken = new Set(otherPicks(bundles, build.choices, grant.poolId, grant.key, true));
    const seen = new Set<string>();
    for (const optionId of decision.optionIds) {
      const option = pool.find((o) => o.optionId === optionId);
      if (!option || (option.minClassLevel ?? 1) > classLevel || taken.has(optionId) || seen.has(optionId)) {
        const msg = `feature-picks "${grant.key}" decision references option "${optionId}" that is unknown, not yet allowed or already taken`;
        warnings.push(msg);
        logger.warn(msg);
        continue;
      }
      seen.add(optionId);
      bundles.push({ source, grants: [{ type: 'feature', feature: { id: option.featureId } }, ...option.grants] });
    }
  }

  // Level-gate grants by `minClassLevel` (issue #189). Runs after feature-choice expansion so
  // expanded option grants are gated too.
  const gateResult = gateGrantsByMinClassLevel(bundles, classCounts);
  for (const msg of gateResult.warnings) {
    warnings.push(msg);
    logger.warn(msg);
  }

  return { bundles: gateResult.bundles, warnings, expandedFeats };
}
