import { describe, expect, it } from 'vitest';
import { portraitPath, portraitStoragePath } from './portrait-path';

describe('portraitStoragePath', () => {
  it('returns null for an empty value', () => {
    expect(portraitStoragePath(null)).toBeNull();
    expect(portraitStoragePath('')).toBeNull();
  });
  it('keeps a plain path', () => {
    expect(portraitStoragePath('abc/portrait.jpg')).toBe('abc/portrait.jpg');
  });
  it('extracts the path from a legacy public URL, ignoring any query string', () => {
    expect(
      portraitStoragePath('http://127.0.0.1:54321/storage/v1/object/public/character-portraits/abc/portrait.jpg?v=3')
    ).toBe('abc/portrait.jpg');
  });
  it('builds the path of a character', () => {
    expect(portraitPath('abc')).toBe('abc/portrait.jpg');
  });
});
