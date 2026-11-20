import { describe, expect, it } from 'vitest';
import {
  GRANT_TYPES,
  grantSchema,
  parseRuleEntry,
  RULE_ENTRY_KINDS,
  RULE_LIMITS,
  type RuleEntryParseResult,
} from '@/lib/rules/schemas';
import { BACKGROUND_SOURCES } from '@/lib/sources/backgrounds';
import { CLASS_SOURCES } from '@/lib/sources/classes';
import { FEAT_SOURCES } from '@/lib/sources/feats';
import { FIGHTING_STYLE_SOURCES } from '@/lib/sources/fighting-styles';
import { LINEAGE_GRANTS_REGISTRY, SPECIES_SOURCES } from '@/lib/sources/species';
import { SUBCLASS_SOURCES } from '@/lib/sources/subclasses';
import type { Grant } from '@/types/grants';
import {
  ALL_ENTRIES,
  BACKGROUND_ENTRY,
  CLASS_ENTRY,
  FEAT_ENTRY,
  SPECIES_ENTRY,
  SUBCLASS_ENTRY,
  withChange,
} from '@/test/rule-fixtures';

function issues(result: RuleEntryParseResult): string {
  return result.ok ? '' : result.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
}

function builtinGrants(): { where: string; grant: Grant }[] {
  const out: { where: string; grant: Grant }[] = [];
  const add = (where: string, grants: readonly Grant[]) => grants.forEach((grant) => out.push({ where, grant }));
  SPECIES_SOURCES.forEach((s) => add(`species ${s.id}`, s.grants));
  Object.entries(LINEAGE_GRANTS_REGISTRY).forEach(([species, lineages]) =>
    Object.entries(lineages).forEach(([lineage, grants]) => add(`lineage ${species}/${lineage}`, grants ?? []))
  );
  CLASS_SOURCES.forEach((c) => c.levels.forEach((l, i) => add(`class ${c.id} L${i + 1}`, l.grants)));
  Object.entries(SUBCLASS_SOURCES).forEach(([id, s]) =>
    s.features.forEach((f) => add(`subclass ${id} L${f.classLevel}`, f.grants))
  );
  BACKGROUND_SOURCES.forEach((b) => add(`background ${b.id}`, b.grants));
  FEAT_SOURCES.forEach((f) => add(`feat ${f.id}`, f.grants));
  FIGHTING_STYLE_SOURCES.forEach((f) => add(`fighting style ${f.id}`, f.grants));
  return out;
}

describe('grant schemas', () => {
  it('cover exactly the 33 variants of Grant', () => {
    expect(GRANT_TYPES).toHaveLength(33);
  });

  it('accept every grant of the built-in 2024 rules (the schemas match what the engine already uses)', () => {
    const failures = builtinGrants()
      .map(({ where, grant }) => ({ where, result: grantSchema.safeParse(grant) }))
      .filter(({ result }) => !result.success)
      .map(
        ({ where, result }) =>
          `${where}: ${result.error?.issues[0]?.path.join('.')} ${result.error?.issues[0]?.message}`
      );
    expect(failures).toEqual([]);
  });

  it.each([
    ['unknown ability', { type: 'ability-bonus', ability: 'luck', bonus: 1 }],
    ['unknown skill', { type: 'proficiency', category: 'skill', id: 'hacking' }],
    ['unknown damage type', { type: 'resistance', damageType: 'sonic' }],
    ['unknown language', { type: 'proficiency', category: 'language', id: 'klingon' }],
    ['unknown weapon category', { type: 'proficiency', category: 'weapon', id: 'lasers' }],
    ['unknown armor category', { type: 'proficiency', category: 'armor', id: 'power-armor' }],
    [
      'unknown fighting style',
      { type: 'fighting-style-choice', key: 'fighting-style-choice:class:fighter:0', count: 1, from: ['kung-fu'] },
    ],
    ['unknown grant type', { type: 'teleport', range: 30 }],
    ['unknown key in a grant', { type: 'hp-bonus', perLevel: 1, script: 'x' }],
    ['malformed choice key', { type: 'asi', key: 'pick-anything', points: 2, from: null }],
    ['choice key with a non kebab id', { type: 'asi', key: 'asi:class:Wizard:0', points: 2, from: null }],
    [
      'unknown class for a spell list',
      { type: 'spell-choice', key: 'spell-choice:class:wizard:0', count: 1, spellList: 'artificer', spellLevel: 0 },
    ],
    ['out of range bonus', { type: 'ability-bonus', ability: 'str', bonus: 99 }],
    ['markup in a feature description', { type: 'feature', feature: { id: 'x', description: '<img src=x>' } }],
    ['non kebab feat id', { type: 'feat', featId: 'Great Weapon Master' }],
  ])('refuse %s', (_label, grant) => {
    expect(grantSchema.safeParse(grant).success).toBe(false);
  });
});

describe('parseRuleEntry: valid entries', () => {
  it('lists the eight kinds', () => {
    expect(RULE_ENTRY_KINDS).toEqual([
      'species',
      'subspecies',
      'class',
      'subclass',
      'background',
      'feat',
      'spell',
      'item',
    ]);
  });

  it.each(ALL_ENTRIES.map((e) => [e.kind, e] as const))('accepts an invented %s entry', (_kind, entry) => {
    const result = parseRuleEntry(entry);
    expect(issues(result)).toBe('');
    expect(result.ok).toBe(true);
  });

  it('accepts review notes (the entry is then unverified, see ruleset tests)', () => {
    const entry = withChange(FEAT_ENTRY, (c) => {
      c.needsReview = ['dice read from a scan, to confirm'];
    });
    expect(parseRuleEntry(entry).ok).toBe(true);
  });
});

describe('parseRuleEntry: refusals (security and bounds)', () => {
  const refused: [string, unknown, string][] = [
    ['an unknown envelope key', withChange(FEAT_ENTRY, (c) => (c.html = 'x')), ''],
    ['an unknown body key', withChange(FEAT_ENTRY, (c) => ((c.body as Record<string, unknown>).hp = 3)), 'body'],
    ['another schema version', withChange(FEAT_ENTRY, (c) => (c.schema = 2)), 'schema'],
    ['an unknown kind', withChange(FEAT_ENTRY, (c) => (c.kind = 'potion')), 'kind'],
    ['a body of another kind', withChange(FEAT_ENTRY, (c) => (c.kind = 'species')), 'body'],
    ['an id that is not kebab-case', withChange(FEAT_ENTRY, (c) => (c.id = 'Test_Grit')), 'id'],
    ['an id that is too short', withChange(FEAT_ENTRY, (c) => (c.id = 'ab')), 'id'],
    ['an id that is too long', withChange(FEAT_ENTRY, (c) => (c.id = 'a'.repeat(61))), 'id'],
    ['a name without English', withChange(FEAT_ENTRY, (c) => (c.name = { fr: 'Cran' })), 'name.en'],
    ['a name in another language', withChange(FEAT_ENTRY, (c) => (c.name = { en: 'Grit', de: 'Mut' })), 'name'],
    ['a too long name', withChange(FEAT_ENTRY, (c) => (c.name = { en: 'x'.repeat(121) })), 'name.en'],
    ['an HTML tag in a name', withChange(FEAT_ENTRY, (c) => (c.name = { en: '<b>Grit</b>' })), 'name.en'],
    ['a ">" in a summary', withChange(FEAT_ENTRY, (c) => (c.summary = { en: 'a > b' })), 'summary.en'],
    ['a javascript: URL', withChange(FEAT_ENTRY, (c) => (c.summary = { fr: 'JavaScript:alert(1)' })), 'summary.fr'],
    ['a data: URL', withChange(FEAT_ENTRY, (c) => (c.summary = { en: 'see data:text/html;base64,x' })), 'summary.en'],
    [
      'a link',
      withChange(FEAT_ENTRY, (c) => (c.needsReview = ['compare with https://example.invalid'])),
      'needsReview.0',
    ],
    ['too many review notes', withChange(FEAT_ENTRY, (c) => (c.needsReview = Array(21).fill('check'))), 'needsReview'],
    ['a too long review note', withChange(FEAT_ENTRY, (c) => (c.needsReview = ['x'.repeat(201)])), 'needsReview.0'],
    ['a book that is not an id', withChange(FEAT_ENTRY, (c) => (c.source = { book: 'Some Book' })), 'source.book'],
    [
      'too many grants',
      withChange(
        FEAT_ENTRY,
        (c) => ((c.body as Record<string, unknown>).grants = Array(61).fill({ type: 'hp-bonus', perLevel: 1 }))
      ),
      'body.grants',
    ],
    ['a class that is not built-in', withChange(CLASS_ENTRY, (c) => (c.id = 'artificer')), 'id'],
    [
      'more than 20 class levels',
      withChange(CLASS_ENTRY, (c) => ((c.body as Record<string, unknown>).levels = Array(21).fill({ grants: [] }))),
      'body.levels',
    ],
    [
      'a subclass of an unknown class',
      withChange(SUBCLASS_ENTRY, (c) => ((c.body as Record<string, unknown>).class = 'artificer')),
      'body.class',
    ],
    [
      'an unknown size',
      withChange(SPECIES_ENTRY, (c) => ((c.body as Record<string, unknown>).size = 'colossal')),
      'body.size',
    ],
    [
      'a grant with an unknown skill',
      withChange(
        BACKGROUND_ENTRY,
        (c) => ((c.body as { grants: unknown[] }).grants[0] = { type: 'proficiency', category: 'skill', id: 'hacking' })
      ),
      'body.grants.0',
    ],
  ];

  it.each(refused)('refuses %s', (_label, content, path) => {
    const result = parseRuleEntry(content);
    expect(result.ok).toBe(false);
    if (!result.ok && path) expect(result.issues.some((i) => i.path.startsWith(path))).toBe(true);
  });

  it.each([
    ['a vbscript: URL', 'VBScript:msgbox(1)'],
    ['a value starting with www.', '  www.example.invalid'],
    ['a value starting with //', '//example.invalid'],
    ['HTTP in any case', 'see HtTp now'],
    ['javascript: in any case', 'JaVaScRiPt:alert(1)'],
    ['java<tab>script:', 'java\tscript:alert(1)'],
    ['a zero-width space', 'Gr\u200bit'],
    ['a right-to-left override', 'Grit\u202e'],
    ['a line break in a name', 'Gr\nit'],
  ])('refuses %s in a name', (_label, text) => {
    expect(parseRuleEntry(withChange(FEAT_ENTRY, (c) => (c.name = { en: text }))).ok).toBe(false);
  });

  it('allows a line break in a long text (summary, description), nothing else invisible', () => {
    expect(parseRuleEntry(withChange(FEAT_ENTRY, (c) => (c.summary = { en: 'Line one\nline two' }))).ok).toBe(true);
    expect(parseRuleEntry(withChange(FEAT_ENTRY, (c) => (c.summary = { en: 'Line\u0007bell' }))).ok).toBe(false);
  });

  it('finds dangerous text at any depth (a feature description inside a feature choice)', () => {
    const deep = withChange(SUBCLASS_ENTRY, (c) => {
      (c.body as { features: unknown[] }).features = [
        {
          classLevel: 3,
          grants: [
            {
              type: 'feature-choice',
              key: 'feature-choice:subclass:test-circle:0',
              options: [
                {
                  optionId: 'a',
                  featureId: 'a',
                  grants: [{ type: 'feature', feature: { id: 'a', description: 'click http://x.invalid' } }],
                },
              ],
            },
          ],
        },
      ];
    });
    const result = parseRuleEntry(deep);
    expect(result.ok).toBe(false);
    expect(issues(result)).toContain('body.features.0.grants.0.options.0.grants.0.feature.description');
  });

  it('refuses an unknown key inside a grant (the database floor lets it through, Zod does not)', () => {
    const bad = withChange(BACKGROUND_ENTRY, (c) => {
      (c.body as { grants: Record<string, unknown>[] }).grants[0].onclick = 'x';
    });
    expect(parseRuleEntry(bad).ok).toBe(false);
  });

  it('refuses content nested deeper than 12 levels', () => {
    let nested: unknown = 'x';
    for (let i = 0; i < 14; i++) nested = { a: nested };
    const deep = withChange(FEAT_ENTRY, (c) => ((c.body as Record<string, unknown>).deep = nested));
    const result = parseRuleEntry(deep);
    expect(result.ok).toBe(false);
    expect(issues(result)).toMatch(/deeper/);
  });

  it('keeps the size bound under the database one (jsonb text is a little longer)', () => {
    expect(RULE_LIMITS.contentBytesMax).toBeLessThan(65536);
  });

  it('refuses content over the size bound before parsing it', () => {
    const big = withChange(FEAT_ENTRY, (c) => (c.summary = { en: 'x'.repeat(RULE_LIMITS.contentBytesMax) }));
    const result = parseRuleEntry(big);
    expect(result.ok).toBe(false);
    expect(issues(result)).toMatch(/bytes/);
  });

  it('refuses content that is not an object', () => {
    expect(parseRuleEntry([FEAT_ENTRY]).ok).toBe(false);
    expect(parseRuleEntry('feat').ok).toBe(false);
    expect(parseRuleEntry(null).ok).toBe(false);
  });

  it('reports the path of the faulty field', () => {
    const bad = withChange(SPECIES_ENTRY, (c) => {
      (c.body as { grants: Record<string, unknown>[] }).grants[0].ability = 'luck';
    });
    const result = parseRuleEntry(bad);
    expect(result.ok).toBe(false);
    expect(issues(result)).toContain('body.grants.0.ability');
  });
});
