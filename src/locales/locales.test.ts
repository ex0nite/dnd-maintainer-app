import { describe, expect, it } from 'vitest';
import en from '@/locales/en/common.json';
import fr from '@/locales/fr/common.json';

type Tree = { [key: string]: string | Tree };

/** Every leaf of a translation file, by its dotted path. */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const flatEn = flatten(en as Tree);
const flatFr = flatten(fr as Tree);

describe('interface translations (story 6.2)', () => {
  it('a key present in one language and missing from the other fails the build', () => {
    const missingInFr = Object.keys(flatEn).filter((k) => !(k in flatFr));
    const missingInEn = Object.keys(flatFr).filter((k) => !(k in flatEn));
    expect({ missingInFr, missingInEn }).toEqual({ missingInFr: [], missingInEn: [] });
  });

  it('both languages use the same placeholders for each key', () => {
    const different = Object.keys(flatEn)
      .filter((k) => k in flatFr && placeholders(flatEn[k]).join() !== placeholders(flatFr[k]).join())
      .map((k) => `${k}: ${placeholders(flatEn[k])} / ${placeholders(flatFr[k])}`);
    expect(different).toEqual([]);
  });

  it('both languages use the same markup tags for each key', () => {
    const tags = (text: string) => [...text.matchAll(/<\/?\w+>/g)].map((m) => m[0]).join();
    expect(Object.keys(flatEn).filter((k) => k in flatFr && tags(flatEn[k]) !== tags(flatFr[k]))).toEqual([]);
  });

  it('plural forms use the i18next suffixes (_one, _other), never the legacy _plural that is never read', () => {
    expect([...Object.keys(flatEn), ...Object.keys(flatFr)].filter((k) => k.endsWith('_plural'))).toEqual([]);
  });

  it('no French value is empty', () => {
    expect(Object.keys(flatFr).filter((k) => flatFr[k].trim() === '')).toEqual([]);
  });
});
