/**
 * Story 9.9: the printable sheet of the 2014 rules. The fields are those of the 2014 sheet, the SRD 5.1 notice is printed
 * when SRD content figures on it, and the PDF is drawn without any template.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import i18n from '@/lib/i18n';
import { buildRuleSet, builtin2024RuleSet } from '@/lib/rules/ruleset';
import { ruleAwareT } from '@/lib/rules/display';
import { collectBundles } from '@/lib/sources';
import { resolveCharacter } from '@/lib/resolver';
import { exportCharacterPdf } from '@/lib/pdf-export';
import {
  buildSheet2014,
  pdfLabels2014,
  renderSheet2014,
  SRD_ATTRIBUTION_2014,
  toWinAnsi,
  wrapText,
  PDF_LABEL_KEYS,
} from '@/lib/pdf-sheet-2014';
import type { GamedataT } from '@/lib/pdf-field-map';
import type { AbilityScores, Character } from '@/types/database';
import type { BuildLevel, CharacterBuild, ChoiceKey, ChoiceDecision } from '@/types/choices';

const RULES = buildRuleSet('2014');
const BASE: AbilityScores = { str: 10, dex: 12, con: 14, int: 16, wis: 10, cha: 8 };

const tc = i18n.getFixedT('en', 'common');
const tcFr = i18n.getFixedT('fr', 'common');
const LABELS = pdfLabels2014(tc);
const tg = ruleAwareT(RULES, 'en', i18n.getFixedT('en', 'gamedata')) as GamedataT;

function wizard(level = 3) {
  const levels: BuildLevel[] = Array.from({ length: level }, (_, i) => ({
    classId: 'wizard',
    classLevel: i + 1,
    hpRoll: null,
  }));
  const build = {
    speciesId: 'human',
    backgroundId: 'acolyte',
    baseAbilities: BASE,
    abilityMethod: 'manual',
    levels,
    choices: {} as Record<ChoiceKey, ChoiceDecision>,
    feats: [],
    activeItems: [],
  } satisfies CharacterBuild;
  const { bundles, expandedFeats } = collectBundles(build, RULES);
  return resolveCharacter({
    baseAbilities: BASE,
    level,
    bundles,
    choices: build.choices,
    levels,
    expandedFeats,
    rules: RULES,
  });
}

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    slug: 's',
    previous_slugs: [],
    created_at: '',
    updated_at: '',
    campaign_id: 'camp',
    name: 'Søren',
    player_name: 'Camille',
    character_type: 'pc',
    species: 'human',
    class: 'wizard',
    subclass: null,
    level: 3,
    background: 'acolyte',
    alignment: 'ng',
    gender: null,
    size: null,
    age: null,
    height: null,
    weight: null,
    eye_color: null,
    hair_color: null,
    skin_color: null,
    hit_points_max: 20,
    armor_class: 11,
    speed: 30,
    proficiency_bonus: 2,
    personality_traits: 'Always curious',
    ideals: 'Knowledge',
    bonds: 'My spellbook',
    flaws: 'Overconfident ∞',
    appearance: null,
    backstory: 'Raised in a tower.',
    notes: null,
    portrait_url: null,
    is_active: true,
    status: 'ready',
    weapon_masteries: null,
    heroic_inspiration: false,
    exhaustion_level: 0,
    conditions: [],
    hit_dice_used: null,
    spell_slots_used: null,
    ...over,
  } as Character;
}

describe('buildSheet2014', () => {
  const sheet = buildSheet2014(wizard(), character(), tg, new Map(), RULES, LABELS);

  it('carries the fields of the 2014 sheet', () => {
    expect(sheet.identity).toMatchObject({ name: 'Søren', player: 'Camille', species: 'Human' });
    expect(sheet.identity.classLevel).toBe('Wizard 3');
    expect(sheet.abilities.map((a) => a.label)).toEqual([
      'Strength',
      'Dexterity',
      'Constitution',
      'Intelligence',
      'Wisdom',
      'Charisma',
    ]);
    // Human: +1 everywhere.
    expect(sheet.abilities[3]).toMatchObject({ score: '17', modifier: '+3' });
    expect(sheet.proficiencyBonus).toBe('+2');
    expect(sheet.savingThrows).toHaveLength(6);
    expect(sheet.savingThrows.filter((s) => s.proficient).map((s) => s.label)).toEqual(['Intelligence', 'Wisdom']);
    expect(sheet.skills).toHaveLength(18);
    expect(sheet.hitDice).toBe('3d6');
    expect(sheet.speed).toBe('30 ft');
  });

  it('prints the spellcasting block with the 2014 slots', () => {
    const block = sheet.sections.find((s) => s.title === LABELS.spellcasting);
    expect(block).toBeDefined();
    const text = (block?.lines ?? []).join('\n');
    expect(text).toContain('Intelligence');
    expect(text).toContain('Spell save DC: 13');
    expect(text).toContain('Level 1: 4');
    expect(text).toContain('Level 2: 2');
  });

  it('prints the personality blocks and the backstory', () => {
    const titles = sheet.sections.map((s) => s.title);
    expect(titles).toEqual(
      expect.arrayContaining([LABELS.personalityTraits, LABELS.ideals, LABELS.bonds, LABELS.flaws, LABELS.backstory])
    );
    expect(sheet.sections.find((s) => s.title === LABELS.featuresAndTraits)?.lines.length).toBeGreaterThan(0);
  });

  it('attributes the SRD 5.1 when SRD content figures on the sheet', () => {
    expect(sheet.attribution).toBe(SRD_ATTRIBUTION_2014);
    expect(sheet.attribution).toContain('Creative Commons Attribution 4.0');
  });

  it('prints no notice when nothing on the sheet comes from the SRD', () => {
    const own = buildSheet2014(
      wizard(),
      character({ species: 'zzz', class: null, background: 'zzz' }),
      tg,
      new Map(),
      builtin2024RuleSet(),
      LABELS
    );
    expect(own.attribution).toBeNull();
  });

  it('has a label in both languages for every key', () => {
    for (const k of PDF_LABEL_KEYS) {
      expect(tcFr(`characterSheet.pdf2014.${k}`), k).not.toBe(`characterSheet.pdf2014.${k}`);
      expect(tc(`characterSheet.pdf2014.${k}`), k).not.toBe(`characterSheet.pdf2014.${k}`);
    }
  });
});

describe('renderSheet2014', () => {
  it('draws a PDF without a template, over several pages when the text is long', async () => {
    const sheet = buildSheet2014(
      wizard(),
      character({ backstory: 'Long tale. '.repeat(900) }),
      tg,
      new Map(),
      RULES,
      LABELS
    );
    const bytes = await renderSheet2014(sheet);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('survives characters the standard font can not encode', async () => {
    const sheet = buildSheet2014(wizard(), character({ name: 'Nox ☃ 中' }), tg, new Map(), RULES, LABELS);
    await expect(renderSheet2014(sheet)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('text helpers', () => {
  it('folds what WinAnsi can not hold and wraps to the width', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(toWinAnsi('a−b ø ☃', font)).toBe('a-b ø ?');
    const lines = wrapText('one two three four five six', font, 10, 50);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 50)).toBe(true);
  });
});

describe('exportCharacterPdf for the 2014 rules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('needs no template: it never fetches one and downloads the drawn sheet', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const blobs: Blob[] = [];
    const url = globalThis.URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: () => void };
    url.createObjectURL = (b: Blob) => (blobs.push(b), 'blob:x');
    url.revokeObjectURL = () => undefined;
    const result = await exportCharacterPdf(wizard(), character(), tg, new Map(), { rules: RULES, labels: LABELS });
    expect(result.missingFields).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('application/pdf');
  });
});
