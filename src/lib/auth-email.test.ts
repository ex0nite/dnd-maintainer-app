import { describe, expect, it } from 'vitest';
import { pseudoToEmail } from './auth-email';

describe('pseudoToEmail', () => {
  it('derives the address, trimming and lower-casing the input', () => {
    expect(pseudoToEmail('  Maitre ', 'table')).toBe('maitre@table.invalid');
  });
  it('uses the default domain', () => {
    expect(pseudoToEmail('maitre')).toBe('maitre@table.invalid');
  });
  it.each(['', 'ab', 'a b', 'a@b.c', 'x'.repeat(21), 'café'])('rejects %j', (input) => {
    expect(pseudoToEmail(input)).toBeNull();
  });
});
