import { describe, expect, it } from 'vitest';
import {
  ABILITY_METHODS,
  MANUAL_SCORE_MAX,
  MANUAL_SCORE_MIN,
  describeAbilityIssue,
  isAbilityMethod,
  validateBaseAbilities,
} from '@/lib/ability-scores';
import type { AbilityScores } from '@/types/database';

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number): AbilityScores => ({
  str,
  dex,
  con,
  int,
  wis,
  cha,
});

describe('validateBaseAbilities', () => {
  it('accepts the standard array in any order, and nothing else', () => {
    expect(validateBaseAbilities('standard-array', scores(8, 10, 12, 13, 14, 15))).toEqual([]);
    expect(validateBaseAbilities('standard-array', scores(15, 15, 13, 12, 10, 8))).toHaveLength(1);
    // Every score still at its default of 10: the array is not assigned yet.
    expect(validateBaseAbilities('standard-array', scores(10, 10, 10, 10, 10, 10))).toHaveLength(1);
  });

  it('checks the point buy range and budget', () => {
    expect(validateBaseAbilities('point-buy', scores(15, 15, 15, 8, 8, 8))).toEqual([]);
    expect(validateBaseAbilities('point-buy', scores(8, 8, 8, 8, 8, 8))).toEqual([]);
    expect(validateBaseAbilities('point-buy', scores(15, 15, 15, 15, 8, 8))).toEqual([
      { code: 'point-buy-total', cost: 36, limit: 27 },
    ]);
    expect(validateBaseAbilities('point-buy', scores(16, 8, 8, 8, 8, 8))).toEqual([
      { code: 'point-buy-range', min: 8, max: 15 },
    ]);
    expect(validateBaseAbilities('point-buy', scores(7, 8, 8, 8, 8, 8))[0].code).toBe('point-buy-range');
  });

  it('bounds rolled scores to 3-18', () => {
    expect(validateBaseAbilities('rolling', scores(18, 3, 10, 12, 14, 9))).toEqual([]);
    expect(validateBaseAbilities('rolling', scores(19, 3, 10, 12, 14, 9))).toEqual([
      { code: 'range', min: 3, max: 18 },
    ]);
    expect(validateBaseAbilities('rolling', scores(2, 3, 10, 12, 14, 9))).toHaveLength(1);
  });

  it('bounds typed scores to 3-20, each edge included', () => {
    expect(validateBaseAbilities('manual', scores(MANUAL_SCORE_MIN, MANUAL_SCORE_MAX, 10, 12, 14, 9))).toEqual([]);
    expect(validateBaseAbilities('manual', scores(MANUAL_SCORE_MIN - 1, 10, 10, 10, 10, 10))).toHaveLength(1);
    expect(validateBaseAbilities('manual', scores(10, 10, 10, 10, 10, MANUAL_SCORE_MAX + 1))).toHaveLength(1);
  });

  it('refuses a score that is not a whole number, whatever the method', () => {
    for (const method of ABILITY_METHODS) {
      expect(validateBaseAbilities(method, scores(10.5, 10, 10, 10, 10, 10))).toEqual([{ code: 'not-integer' }]);
      expect(validateBaseAbilities(method, scores(Number.NaN, 10, 10, 10, 10, 10))).toEqual([{ code: 'not-integer' }]);
    }
  });

  it('describes every issue in one sentence', () => {
    for (const issue of [
      { code: 'not-integer' },
      { code: 'standard-array', expected: [15, 14, 13, 12, 10, 8] },
      { code: 'point-buy-range', min: 8, max: 15 },
      { code: 'point-buy-total', cost: 30, limit: 27 },
      { code: 'range', min: 3, max: 20 },
    ] as const) {
      expect(describeAbilityIssue(issue)).toMatch(/\.$/);
    }
  });

  it('recognizes the four methods', () => {
    expect(ABILITY_METHODS).toEqual(['standard-array', 'point-buy', 'rolling', 'manual']);
    expect(isAbilityMethod('manual')).toBe(true);
    expect(isAbilityMethod('dice')).toBe(false);
    expect(isAbilityMethod(null)).toBe(false);
  });
});
