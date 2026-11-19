import { ABILITY_KEYS, POINT_BUY_TOTAL, STANDARD_ARRAY, getPointBuyCost } from '@/lib/dnd-helpers';
import type { AbilityScores } from '@/types/database';

/**
 * How the base scores of a character were obtained (story 9.7 adds `manual`: values rolled or decided at the table and
 * typed in, 2014 as well as 2024).
 */
export const ABILITY_METHODS = ['standard-array', 'point-buy', 'rolling', 'manual'] as const;
export type AbilityMethod = (typeof ABILITY_METHODS)[number];

export function isAbilityMethod(value: unknown): value is AbilityMethod {
  return typeof value === 'string' && (ABILITY_METHODS as readonly string[]).includes(value);
}

/** Bounds of a score typed in by hand, before any species bonus (3 = the lowest 3d6, 20 = the cap of a score). */
export const MANUAL_SCORE_MIN = 3;
export const MANUAL_SCORE_MAX = 20;
/** Bounds of a rolled score (4d6 drop the lowest, or 3d6). */
export const ROLLED_SCORE_MIN = 3;
export const ROLLED_SCORE_MAX = 18;

export type AbilityScoreIssue =
  | { readonly code: 'not-integer' }
  | { readonly code: 'standard-array'; readonly expected: readonly number[] }
  | { readonly code: 'point-buy-range'; readonly min: number; readonly max: number }
  | { readonly code: 'point-buy-total'; readonly cost: number; readonly limit: number }
  | { readonly code: 'range'; readonly min: number; readonly max: number };

/**
 * Checks base scores against the method that produced them. Returns no issue when they are valid. Pure: the screen shows
 * the issues, the builder refuses to finalize on them, the MCP refuses to save them.
 */
export function validateBaseAbilities(method: AbilityMethod, scores: AbilityScores): readonly AbilityScoreIssue[] {
  const values = ABILITY_KEYS.map((key) => scores[key]);
  if (values.some((v) => !Number.isInteger(v))) return [{ code: 'not-integer' }];

  if (method === 'standard-array') {
    const sorted = [...values].sort((a, b) => b - a);
    const expected = [...STANDARD_ARRAY].sort((a, b) => b - a);
    return sorted.every((v, i) => v === expected[i]) ? [] : [{ code: 'standard-array', expected: STANDARD_ARRAY }];
  }
  if (method === 'point-buy') {
    if (values.some((v) => v < 8 || v > 15)) return [{ code: 'point-buy-range', min: 8, max: 15 }];
    const cost = values.reduce((sum, v) => sum + getPointBuyCost(v), 0);
    return cost <= POINT_BUY_TOTAL ? [] : [{ code: 'point-buy-total', cost, limit: POINT_BUY_TOTAL }];
  }
  const [min, max] = method === 'rolling' ? [ROLLED_SCORE_MIN, ROLLED_SCORE_MAX] : [MANUAL_SCORE_MIN, MANUAL_SCORE_MAX];
  return values.some((v) => v < min || v > max) ? [{ code: 'range', min, max }] : [];
}

/** One English sentence per issue, for API clients (the MCP) and logs; the screens translate the codes themselves. */
export function describeAbilityIssue(issue: AbilityScoreIssue): string {
  switch (issue.code) {
    case 'not-integer':
      return 'Every ability score must be a whole number.';
    case 'standard-array':
      return `The standard array uses exactly ${issue.expected.join(', ')}, each once, in any order.`;
    case 'point-buy-range':
      return `Point buy scores must each be between ${issue.min} and ${issue.max}.`;
    case 'point-buy-total':
      return `Point buy costs ${issue.cost} points, the limit is ${issue.limit}.`;
    case 'range':
      return `Scores must each be between ${issue.min} and ${issue.max}.`;
  }
}
