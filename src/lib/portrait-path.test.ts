import { describe, expect, it } from 'vitest';
import { newPortraitPath, ownPortraitPath, portraitStoragePath } from './portrait-path';

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
  it('builds a fresh path for a character, never twice the same', () => {
    const id = 'c1000000-0000-4000-8000-000000000001';
    const a = newPortraitPath(id);
    expect(a).toMatch(/^c1000000-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.jpg$/);
    expect(newPortraitPath(id)).not.toBe(a);
  });
});

describe('ownPortraitPath', () => {
  const id = 'c1000000-0000-4000-8000-000000000001';
  const other = 'c2000000-0000-4000-8000-000000000002';
  it.each([
    [`${id}/b0000000-0000-4000-8000-0000000000b1.jpg`, `${id}/b0000000-0000-4000-8000-0000000000b1.jpg`],
    [`${id}/portrait.jpg`, `${id}/portrait.jpg`],
    [`http://h/storage/v1/object/public/character-portraits/${id}/portrait.jpg?v=2`, `${id}/portrait.jpg`],
  ])('accepts %s', (stored, expected) => {
    expect(ownPortraitPath(id, stored)).toBe(expected);
  });
  it.each([
    null,
    '',
    `${other}/portrait.jpg`,
    `${id}/../${other}/portrait.jpg`,
    `${id}/not-a-uuid.jpg`,
    `${id}/b0000000-0000-4000-8000-0000000000b1.gif`,
    'https://example.com/x.jpg',
  ])('refuses %s', (stored) => {
    expect(ownPortraitPath(id, stored)).toBeNull();
  });
});
