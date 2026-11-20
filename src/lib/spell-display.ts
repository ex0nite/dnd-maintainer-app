import type { SpellSchool } from '@/types/spells';
import { builtin2024RuleSet } from '@/lib/rules/ruleset';
import type { RuleSet } from '@/lib/rules/types';

export interface SpellDisplayMeta {
  readonly level: number;
  readonly school: SpellSchool;
}

/**
 * Returns catalog-level metadata for a spell by id, or null when the rule set has no such spell (the built-in catalog
 * by default; library spells too when the campaign's rule set is given, story 9.3). Name translation is intentionally
 * left to the caller so this helper stays pure and framework-free.
 */
export function getSpellDisplayMeta(id: string, rules: RuleSet = builtin2024RuleSet()): SpellDisplayMeta | null {
  const def = rules.spells.get(id);
  if (!def) return null;
  return { level: def.level, school: def.school };
}
