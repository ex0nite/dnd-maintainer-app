import type { Grant } from '@/types/grants';
import { getLogger } from '@/lib/logger';

const logger = getLogger('sources.level-grants');
import type { ClassId } from '@/lib/dnd-helpers';
import { builtin2024RuleSet } from '@/lib/rules/ruleset';
import type { RuleSet } from '@/lib/rules/types';

export interface LevelGrantPreview {
  readonly classGrants: readonly Grant[];
  readonly subclassGrants: readonly Grant[];
}

/**
 * Return all grants a class level will produce, without committing any rows.
 * Used by the LevelUpDialog to show what the level grants before the user confirms. `rules` is the campaign's rule
 * set (story 9.8: a 2014 class levels up with its own grants); the built-in 2024 rules by default.
 */
export function getGrantsForLevel(
  classId: ClassId,
  targetClassLevel: number,
  subclassId: string | null,
  rules: RuleSet = builtin2024RuleSet()
): LevelGrantPreview {
  const classSource = rules.classes.get(classId);
  if (!classSource) {
    logger.warn(`getGrantsForLevel: no class source for "${classId}"`);
  }
  const classGrants = classSource?.levels[targetClassLevel - 1]?.grants ?? [];

  let subclassGrants: readonly Grant[] = [];
  if (subclassId && (rules.subclassesByClass.get(classId) ?? []).includes(subclassId)) {
    const subclassSource = rules.subclasses.get(subclassId);
    const feature = subclassSource?.features.find((f) => f.classLevel === targetClassLevel);
    subclassGrants = feature?.grants ?? [];
  }

  return { classGrants, subclassGrants };
}
