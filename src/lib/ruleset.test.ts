import { describe, it, expect } from 'vitest';
import { DEFAULT_RULESET, RULESET_IDS, canBuildCharacters, isRulesetId } from '@/lib/ruleset';

describe('ruleset', () => {
  it('defaults to an edition the picker offers', () => {
    expect(RULESET_IDS).toContain(DEFAULT_RULESET);
  });

  it.each([
    ['2014', true],
    ['2024', true],
    ['2020', false],
    ['', false],
    [2014, false],
    [null, false],
    [undefined, false],
  ])('isRulesetId(%j) is %s', (value, expected) => {
    expect(isRulesetId(value)).toBe(expected);
  });

  it('builds characters only for editions whose engine exists, and never for an unknown one', () => {
    expect(canBuildCharacters('2024')).toBe(true);
    expect(canBuildCharacters('2014')).toBe(false);
    expect(canBuildCharacters('2020' as never)).toBe(false);
  });
});
