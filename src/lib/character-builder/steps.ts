import type { RulesetId } from '@/lib/ruleset';
import type { StepType } from '@/types/character-builder';

const STEPS_2024: readonly StepType[] = ['basics', 'class', 'origin', 'abilities', 'details', 'equipment', 'backstory'];

/**
 * 2014 order (story 9.7): species and class (basics, class), the ability scores with the species bonus, the background
 * (the `origin` step: no ability bonus and no feat in 2014), then proficiencies, equipment and backstory. In 2024 the
 * background comes first because it carries the ability bonus.
 */
const STEPS_2014: readonly StepType[] = ['basics', 'class', 'abilities', 'origin', 'details', 'equipment', 'backstory'];

/** The steps of the character builder, in order, for a rules edition. */
export function builderSteps(ruleset: RulesetId): readonly { id: StepType }[] {
  return (ruleset === '2014' ? STEPS_2014 : STEPS_2024).map((id) => ({ id }));
}
