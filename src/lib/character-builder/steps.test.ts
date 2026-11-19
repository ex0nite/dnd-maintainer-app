import { describe, expect, it } from 'vitest';
import { builderSteps } from './steps';

describe('builderSteps', () => {
  it('follows the 2014 creation order: species, class, scores, background, then equipment', () => {
    expect(builderSteps('2014').map((s) => s.id)).toEqual([
      'basics',
      'class',
      'abilities',
      'origin',
      'details',
      'equipment',
      'backstory',
    ]);
  });

  it('keeps the 2024 order, where the background comes before the scores', () => {
    const ids = builderSteps('2024').map((s) => s.id);
    expect(ids.indexOf('origin')).toBeLessThan(ids.indexOf('abilities'));
  });

  it('offers the same seven steps in both editions', () => {
    expect(
      builderSteps('2014')
        .map((s) => s.id)
        .sort()
    ).toEqual(
      builderSteps('2024')
        .map((s) => s.id)
        .sort()
    );
  });
});
