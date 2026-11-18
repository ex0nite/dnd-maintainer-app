import { describe, it, expect } from 'vitest';
import { DEFAULT_RULESET, RULESET_IDS, canBuildCharacters, isRulesetId } from '@/lib/ruleset';

describe('ruleset', () => {
  it('offers the 2014 and the 2024 rules, 2024 by default', () => {
    expect([...RULESET_IDS]).toEqual(['2014', '2024']);
    expect(DEFAULT_RULESET).toBe('2024');
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

  it('only builds characters for the editions whose engine exists', () => {
    expect(canBuildCharacters('2024')).toBe(true);
    expect(canBuildCharacters('2014')).toBe(false);
  });
});
