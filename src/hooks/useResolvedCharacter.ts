import { getLogger } from '@/lib/logger';
import { useMemo } from 'react';
import type { CharacterBuild } from '@/types/choices';
import type { ResolvedCharacter } from '@/types/resolved';
import { resolveCharacter } from '@/lib/resolver';
import { collectBundles } from '@/lib/sources';
import { useActiveRuleSet } from '@/hooks/useRuleSet';

const logger = getLogger('resolved-character');

// NOTE: The `build` reference should be stabilized by the caller (e.g. via useMemo or
// by storing a stable object reference) to avoid unnecessary re-resolution on each render.
export function useResolvedCharacter(build: CharacterBuild | null): ResolvedCharacter | null {
  const rules = useActiveRuleSet();
  return useMemo(() => {
    if (!build) return null;
    const { bundles, warnings, expandedFeats } = collectBundles(build, rules);
    if (warnings.length > 0) {
      logger.warn('collectBundles warnings:', warnings);
    }
    return resolveCharacter({
      baseAbilities: build.baseAbilities,
      level: build.levels.length,
      bundles,
      choices: build.choices,
      levels: build.levels,
      expandedFeats,
      rules,
    });
  }, [build, rules]);
}
