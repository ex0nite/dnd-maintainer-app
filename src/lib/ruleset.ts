/**
 * The rules edition a campaign follows (story 9.1). The 2024 rules are the engine that exists today; the 2014 rules are
 * added by the rest of epic 9. Stored in `campaigns.ruleset`; the database refuses to change it once a character is
 * finalized.
 */
export const RULESET_IDS = ['2014', '2024'] as const;
export type RulesetId = (typeof RULESET_IDS)[number];

export const DEFAULT_RULESET: RulesetId = '2024';

/**
 * Editions whose character engine is implemented. 2014 joined in story 9.7 (species, classes and backgrounds of the
 * SRD 5.1 and the builder); its spells and spellcasting come with 9.8. Keep `ruleset_has_engine()` (SQL) in step.
 */
export const SUPPORTED_CHARACTER_RULESETS: readonly RulesetId[] = ['2014', '2024'];

export function isRulesetId(value: unknown): value is RulesetId {
  return typeof value === 'string' && (RULESET_IDS as readonly string[]).includes(value);
}

/** True when sheets of that edition can be built and computed today. */
export function canBuildCharacters(ruleset: RulesetId): boolean {
  return SUPPORTED_CHARACTER_RULESETS.includes(ruleset);
}
