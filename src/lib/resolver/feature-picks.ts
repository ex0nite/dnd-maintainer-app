import type { FeatureChoiceOption } from '@/types/grants';
import type { GrantBundle } from '@/types/sources';
import type { ChoiceDecision, ChoiceKey } from '@/types/choices';
import { collectGrantsByType } from '@/lib/resolver/helpers';

/** The options of a `feature-picks` pool: listed by the first grant of the pool (the others only name the pool). */
export function featurePicksPool(bundles: readonly GrantBundle[], poolId: string): readonly FeatureChoiceOption[] {
  for (const { grant } of collectGrantsByType(bundles, 'feature-picks')) {
    if (grant.poolId === poolId && grant.options) return grant.options;
  }
  return [];
}

/**
 * Option ids picked through the other grants of the pool (an option is picked once per pool). `onlyEarlier`: count the
 * grants that come before this one only, so that when an option was picked twice the later pick is the one refused.
 */
export function otherPicks(
  bundles: readonly GrantBundle[],
  choices: Readonly<Record<ChoiceKey, ChoiceDecision>>,
  poolId: string,
  exceptKey: ChoiceKey,
  onlyEarlier = false
): readonly string[] {
  const out: string[] = [];
  for (const { grant } of collectGrantsByType(bundles, 'feature-picks')) {
    if (grant.poolId !== poolId) continue;
    if (grant.key === exceptKey) {
      if (onlyEarlier) break;
      continue;
    }
    const decision = choices[grant.key];
    if (decision?.type === 'feature-picks') out.push(...decision.optionIds);
  }
  return out;
}

/** Own name and text of an option of an SRD or library entry: the `feature` grant that carries its feature id. */
export function optionText(option: FeatureChoiceOption): { readonly name?: string; readonly description?: string } {
  for (const grant of option.grants) {
    if (grant.type === 'feature' && grant.feature.id === option.featureId) {
      return {
        ...(grant.feature.name !== undefined ? { name: grant.feature.name } : {}),
        ...(grant.feature.description !== undefined ? { description: grant.feature.description } : {}),
      };
    }
  }
  return {};
}
