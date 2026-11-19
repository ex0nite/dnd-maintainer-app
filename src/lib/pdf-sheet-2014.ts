/**
 * The printable character sheet of the 2014 rules (story 9.9).
 *
 * The 2014 sheet of Wizards of the Coast is not free to redistribute (the SRD 5.1 does not include it), so the PDF is drawn
 * from scratch with `pdf-lib`: no template to supply, and the fields are those of the 2014 sheet (identity, six abilities,
 * inspiration, proficiency bonus, saving throws, eighteen skills, passive Wisdom (Perception), AC, initiative, speed, hit
 * points, hit dice, attacks, equipment, personality traits, ideals, bonds, flaws, features and traits, other proficiencies
 * and languages, then the spellcasting block). Two layers, like the 2024 export:
 *
 *  1. {@link buildSheet2014}: a pure function from the resolved character to the text of every field (no DOM, no PDF);
 *  2. {@link renderSheet2014}: draws that data on A4 pages (Helvetica, WinAnsi text only).
 *
 * When SRD 5.1 content figures on the sheet, every page carries the CC-BY 4.0 notice (docs/rules-as-data.md section 7).
 */
import type { TFunction } from 'i18next';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Character } from '@/types/database';
import type { ResolvedCharacter } from '@/types/resolved';
import { getItemNameKey } from '@/lib/sources/items';
import { getSourceDisplayName } from '@/lib/source-display';
import type { RuleSet } from '@/lib/rules/types';
import type { RuleEntryKind } from '@/lib/rules/schemas';
import { PDF_ABILITIES, PDF_SKILLS, signed, type FeatGrantInfo, type GamedataT } from '@/lib/pdf-field-map';

/** The SRD 5.1 notice printed on the sheet (English: the only language of the SRD). */
export const SRD_ATTRIBUTION_2014 =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and ' +
  'available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative ' +
  'Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

/** The labels of the sheet (keys of `characterSheet.pdf2014` in the `common` namespace). */
export const PDF_LABEL_KEYS = [
  'title',
  'name',
  'classLevel',
  'background',
  'player',
  'species',
  'alignment',
  'experience',
  'inspiration',
  'proficiencyBonus',
  'savingThrows',
  'skills',
  'passivePerception',
  'armorClass',
  'initiative',
  'speed',
  'hitPointMax',
  'hitDice',
  'attacks',
  'attackName',
  'attackBonus',
  'attackDamage',
  'equipment',
  'personalityTraits',
  'ideals',
  'bonds',
  'flaws',
  'featuresAndTraits',
  'proficienciesAndLanguages',
  'armorProficiencies',
  'weaponProficiencies',
  'toolProficiencies',
  'languages',
  'appearance',
  'backstory',
  'spellcasting',
  'spellcastingClass',
  'spellcastingAbility',
  'spellSaveDc',
  'spellAttackBonus',
  'spellSlots',
  'pactMagic',
  'cantrips',
  'spellLevel',
  'page',
] as const;

export type PdfLabelKey = (typeof PDF_LABEL_KEYS)[number];
export type PdfLabels2014 = Readonly<Record<PdfLabelKey, string>>;

/** Build the labels from a `common` translator. */
export function pdfLabels2014(tc: TFunction<'common'>): PdfLabels2014 {
  const call = tc as unknown as (key: string) => string;
  return Object.fromEntries(PDF_LABEL_KEYS.map((k) => [k, call(`characterSheet.pdf2014.${k}`)])) as PdfLabels2014;
}

export interface Sheet2014 {
  readonly labels: PdfLabels2014;
  readonly identity: {
    readonly name: string;
    readonly classLevel: string;
    readonly background: string;
    readonly player: string;
    readonly species: string;
    readonly alignment: string;
  };
  readonly abilities: readonly { readonly label: string; readonly score: string; readonly modifier: string }[];
  readonly proficiencyBonus: string;
  readonly inspiration: boolean;
  readonly savingThrows: readonly { readonly label: string; readonly bonus: string; readonly proficient: boolean }[];
  readonly skills: readonly {
    readonly label: string;
    readonly ability: string;
    readonly bonus: string;
    readonly proficient: boolean;
  }[];
  readonly passivePerception: string;
  readonly armorClass: string;
  readonly initiative: string;
  readonly speed: string;
  readonly hitPointMax: string;
  readonly hitDice: string;
  readonly attacks: readonly { readonly name: string; readonly bonus: string; readonly damage: string }[];
  /** Text blocks, in printing order (they flow over as many pages as needed). */
  readonly sections: readonly { readonly title: string; readonly lines: readonly string[] }[];
  /** The notice to print on every page, or null when no SRD content figures on the sheet. */
  readonly attribution: string | null;
}

function featureLine(f: ResolvedCharacter['features'][number], t: GamedataT): string {
  const name =
    f.feature.name ?? t(`features.${f.feature.id}.name` as `features.${string}.name`, { defaultValue: f.feature.id });
  const desc =
    f.feature.description ??
    t(`features.${f.feature.id}.description` as `features.${string}.description`, { defaultValue: '' });
  return desc ? `${name} - ${desc}` : name;
}

/** True when the entry of the rules is a built-in SRD 2014 one (so SRD text is printed). */
function isSrd(rules: RuleSet, kind: RuleEntryKind, id: string | null | undefined): boolean {
  return !!id && rules.entries.get(`${kind}:${id}`)?.layer === 'srd-2014';
}

/**
 * The data of the 2014 sheet. `t` is the (rule-aware) `gamedata` translator, `labels` the `pdf2014` labels in the language of
 * the reader. Pure.
 */
export function buildSheet2014(
  resolved: ResolvedCharacter,
  character: Character,
  t: GamedataT,
  featSources: ReadonlyMap<string, FeatGrantInfo>,
  rules: RuleSet,
  labels: PdfLabels2014
): Sheet2014 {
  const tr = t as unknown as (key: string, options?: { defaultValue?: string }) => string;
  const name = (key: string, id: string): string => tr(key, { defaultValue: id });
  const className = character.class ? name(`classes.${character.class}`, character.class) : '';
  const subclassName = character.subclass ? name(`subclasses.${character.subclass}.name`, character.subclass) : '';
  const classLevel = [className, subclassName ? `(${subclassName})` : '', String(character.level)]
    .filter(Boolean)
    .join(' ');

  const abilityAbbr = (a: string): string => name(`abilityAbbreviations.${a}`, a.toUpperCase());

  const skills = PDF_SKILLS.flatMap((s) => {
    const sk = resolved.skills[s];
    if (!sk) return [];
    return [
      {
        label: name(`skills.${s}`, s) + (sk.expertise ? ' (x2)' : ''),
        ability: abilityAbbr(sk.ability),
        bonus: signed(sk.bonus),
        proficient: sk.proficient,
      },
    ];
  });

  const speedParts: string[] = [];
  for (const mode of ['walk', 'fly', 'climb', 'swim', 'burrow'] as const) {
    const s = resolved.speed[mode];
    if (!s) continue;
    const base = mode === 'walk' ? `${s.value} ft` : `${mode.charAt(0).toUpperCase()}${mode.slice(1)} ${s.value} ft`;
    speedParts.push(s.condition ? `${base} (${s.condition})` : base);
  }

  const attacks = resolved.attacks.map((atk) => {
    const bonus = atk.damageBonus !== 0 ? signed(atk.damageBonus) : '';
    const type = name(`damageTypes.${atk.damageType}`, atk.damageType);
    return {
      name: name(getItemNameKey('weapon', atk.weaponId), atk.weaponId),
      bonus: signed(atk.attackBonus),
      damage: `${atk.damageDice}${bonus} ${type}`.trim(),
    };
  });

  const join = (list: readonly { readonly value: string }[], key: string): string =>
    list.map((p) => name(`${key}.${p.value}`, p.value)).join(', ');

  // Features and traits: class, subclass, species, background and others, then feats.
  const featureLines = resolved.features.map((f) => featureLine(f, t));
  const featLines = Array.from(featSources.entries()).map(([featId, info]) => {
    const featName = name(`feats.${featId}.name`, featId);
    const granter = getSourceDisplayName(info.source, t);
    const desc = name(`feats.${featId}.description`, '');
    return `${granter ? `${featName} (${granter})` : featName}${desc ? ` - ${desc}` : ''}`;
  });
  if (character.exhaustion_level > 0) featureLines.push(`Exhaustion: ${character.exhaustion_level}`);

  const sections: { title: string; lines: string[] }[] = [];
  const add = (title: string, lines: readonly string[]): void => {
    const kept = lines.filter((l) => l.trim().length > 0);
    if (kept.length > 0) sections.push({ title, lines: kept });
  };

  add(labels.featuresAndTraits, [...featureLines, ...featLines]);
  add(labels.proficienciesAndLanguages, [
    resolved.armorProficiencies.length > 0
      ? `${labels.armorProficiencies}: ${join(resolved.armorProficiencies, 'armor')}`
      : '',
    resolved.weaponProficiencies.length > 0
      ? `${labels.weaponProficiencies}: ${join(resolved.weaponProficiencies, 'weapons')}`
      : '',
    resolved.toolProficiencies.length > 0
      ? `${labels.toolProficiencies}: ${join(resolved.toolProficiencies, 'tools')}`
      : '',
    resolved.languages.length > 0 ? `${labels.languages}: ${join(resolved.languages, 'languages')}` : '',
  ]);
  add(
    labels.equipment,
    resolved.equipment.map((it) => {
      const itemName = name(getItemNameKey(it.itemDef.type, it.itemId), it.itemId);
      return it.quantity > 1 ? `${itemName} (x${it.quantity})` : itemName;
    })
  );
  add(labels.personalityTraits, [character.personality_traits ?? '']);
  add(labels.ideals, [character.ideals ?? '']);
  add(labels.bonds, [character.bonds ?? '']);
  add(labels.flaws, [character.flaws ?? '']);
  add(labels.appearance, [character.appearance ?? '']);
  add(labels.backstory, [character.backstory ?? '']);

  // Spellcasting block.
  const spellIds: string[] = [];
  const sc = resolved.spellcasting;
  if (sc) {
    const head: string[] = [];
    if (className) head.push(`${labels.spellcastingClass}: ${className}`);
    if (sc.ability) head.push(`${labels.spellcastingAbility}: ${name(`abilities.${sc.ability}`, sc.ability)}`);
    if (sc.spellSaveDC != null) head.push(`${labels.spellSaveDc}: ${sc.spellSaveDC}`);
    if (sc.spellAttackBonus != null) head.push(`${labels.spellAttackBonus}: ${signed(sc.spellAttackBonus)}`);
    const slotParts = sc.pactMagic
      ? []
      : sc.slots.flatMap((n, i) => (n > 0 ? [`${labels.spellLevel} ${i + 1}: ${n}`] : []));
    const lines: string[] = [head.join(' | ')];
    if (slotParts.length > 0) lines.push(`${labels.spellSlots}: ${slotParts.join(' | ')}`);
    if (sc.pactMagic) {
      lines.push(`${labels.pactMagic}: ${sc.pactMagic.count} x ${labels.spellLevel} ${sc.pactMagic.slotLevel}`);
    }

    const byLevel = new Map<number, string[]>();
    const push = (level: number, id: string): void => {
      spellIds.push(id);
      const list = byLevel.get(level) ?? [];
      const spellName = name(`spells.${id}.name`, id);
      if (!list.includes(spellName)) list.push(spellName);
      byLevel.set(level, list);
    };
    for (const id of sc.cantrips) push(0, id);
    for (const s of sc.knownSpells) push(s.spellLevel, s.spellId);
    for (const id of sc.alwaysPreparedSpells) push(rules.spells.get(id)?.level ?? 0, id);
    for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
      const label = level === 0 ? labels.cantrips : `${labels.spellLevel} ${level}`;
      lines.push(`${label}: ${(byLevel.get(level) ?? []).join(', ')}`);
    }
    add(labels.spellcasting, lines);
  }

  const srdUsed =
    isSrd(rules, 'species', character.species) ||
    isSrd(rules, 'class', character.class) ||
    isSrd(rules, 'subclass', character.subclass) ||
    isSrd(rules, 'background', character.background) ||
    spellIds.some((id) => isSrd(rules, 'spell', id)) ||
    Array.from(featSources.keys()).some((id) => isSrd(rules, 'feat', id)) ||
    resolved.equipment.some((it) => isSrd(rules, 'item', it.itemId));

  return {
    labels,
    identity: {
      name: character.name,
      classLevel,
      background: character.background ? name(`backgrounds.${character.background}`, character.background) : '',
      player: character.player_name ?? '',
      species: character.species ? name(`species.${character.species}`, character.species) : '',
      alignment: character.alignment ? name(`alignments.${character.alignment}`, character.alignment) : '',
    },
    abilities: PDF_ABILITIES.map((a) => ({
      label: name(`abilities.${a}`, a),
      score: String(resolved.abilities[a].total),
      modifier: signed(resolved.abilities[a].modifier),
    })),
    proficiencyBonus: signed(resolved.proficiencyBonus),
    inspiration: character.heroic_inspiration,
    savingThrows: PDF_ABILITIES.map((a) => ({
      label: name(`abilities.${a}`, a),
      bonus: signed(resolved.savingThrows[a].bonus),
      proficient: resolved.savingThrows[a].proficient,
    })),
    skills,
    passivePerception: String(10 + (resolved.skills.perception?.bonus ?? 0)),
    armorClass: String(resolved.armorClass.effective),
    initiative: signed(resolved.initiative),
    speed: speedParts.join(', '),
    hitPointMax: String(resolved.hitPoints.max),
    // The resolver grants one hit die per class (level 1): with a single die size, every level adds one die.
    hitDice: resolved.hitDie
      .map((hd) => `${resolved.hitDie.length === 1 ? character.level : hd.count}d${hd.die}`)
      .join(' + '),
    attacks,
    sections,
    attribution: srdUsed ? SRD_ATTRIBUTION_2014 : null,
  };
}

// --- drawing -------------------------------------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;
const FOOTER_H = 44;
const INK = rgb(0.1, 0.1, 0.1);
const LIGHT = rgb(0.4, 0.4, 0.4);

interface Pen {
  readonly doc: PDFDocument;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  readonly pages: PDFPage[];
}

/** Text the standard font can encode: other characters become '?'; typographic dashes and spaces are folded. */
export function toWinAnsi(text: string, font: PDFFont): string {
  const folded = text
    .replace(/[−‐‑‒]/g, '-')
    .replace(/[  ]/g, ' ')
    .replace(/\t/g, ' ');
  const set = new Set(font.getCharacterSet());
  let out = '';
  for (const ch of folded) out += set.has(ch.codePointAt(0)!) ? ch : '?';
  return out;
}

/** Word-wrap `text` to `width` points (newlines kept; a word longer than the width is cut). */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const candidate = line ? `${line} ${w}` : w;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function newPage(pen: Pen): PDFPage {
  const page = pen.doc.addPage([PAGE_W, PAGE_H]);
  pen.pages.push(page);
  return page;
}

function drawText(
  pen: Pen,
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  opts: { bold?: boolean; color?: ReturnType<typeof rgb>; center?: number } = {}
): void {
  const font = opts.bold ? pen.bold : pen.font;
  const safe = toWinAnsi(text, font);
  const dx = opts.center ? (opts.center - font.widthOfTextAtSize(safe, size)) / 2 : 0;
  page.drawText(safe, { x: x + dx, y, size, font, color: opts.color ?? INK });
}

function box(page: PDFPage, x: number, y: number, w: number, h: number): void {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: INK, borderWidth: 0.8 });
}

function check(page: PDFPage, x: number, y: number, on: boolean): void {
  page.drawCircle({ x, y, size: 3, borderColor: INK, borderWidth: 0.7, color: on ? INK : undefined });
}

/** A labelled value in a box: the value on top (shrunk to fit), the label under it. */
function field(pen: Pen, page: PDFPage, label: string, value: string, x: number, y: number, w: number, h = 30): void {
  box(page, x, y, w, h);
  let size = 11;
  const safe = toWinAnsi(value, pen.font);
  while (size > 6 && pen.font.widthOfTextAtSize(safe, size) > w - 8) size -= 0.5;
  drawText(pen, page, value, x + 4, y + h - 15, size);
  drawText(pen, page, label.toUpperCase(), x + 4, y + 4, 6, { color: LIGHT });
}

/** Draw the sheet. Page 1 holds the fixed fields; the text blocks flow from it onto as many pages as needed. */
export async function renderSheet2014(sheet: Sheet2014): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pen: Pen = { doc, font, bold, pages: [] };
  const L = sheet.labels;
  doc.setTitle(toWinAnsi(`${sheet.identity.name} - ${L.title}`, font));
  doc.setCreator('D&D Maintainer');

  let page = newPage(pen);
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  let y = PAGE_H - MARGIN;

  // Header: the name, then the identity boxes.
  drawText(pen, page, sheet.identity.name || '-', left, y - 22, 22, { bold: true });
  drawText(pen, page, L.name.toUpperCase(), left, y - 32, 6, { color: LIGHT });
  y -= 40;
  const colW = (right - left - 10) / 4;
  const idRows: [string, string][][] = [
    [
      [L.classLevel, sheet.identity.classLevel],
      [L.background, sheet.identity.background],
      [L.player, sheet.identity.player],
      [L.experience, ''],
    ],
    [
      [L.species, sheet.identity.species],
      [L.alignment, sheet.identity.alignment],
      [L.proficiencyBonus, sheet.proficiencyBonus],
      [L.inspiration, sheet.inspiration ? 'X' : ''],
    ],
  ];
  for (const row of idRows) {
    row.forEach(([label, value], i) => field(pen, page, label, value, left + i * (colW + 3.3), y - 30, colW));
    y -= 34;
  }
  y -= 6;

  // Left column: abilities (modifier and score), saving throws beside them, skills under them.
  const leftW = 150;
  let ly = y;
  for (const a of sheet.abilities) {
    box(page, left, ly - 44, 56, 44);
    drawText(pen, page, a.label.toUpperCase(), left, ly - 9, 6.5, { center: 56, color: LIGHT });
    drawText(pen, page, a.modifier, left, ly - 28, 16, { bold: true, center: 56 });
    box(page, left + 18, ly - 44, 20, 12);
    drawText(pen, page, a.score, left + 18, ly - 41, 8, { center: 20 });
    ly -= 48;
  }
  const stripX = left + 64;
  let sy = y;
  drawText(pen, page, L.savingThrows.toUpperCase(), stripX, sy - 8, 7, { bold: true });
  sy -= 14;
  for (const s of sheet.savingThrows) {
    check(page, stripX + 4, sy - 2, s.proficient);
    drawText(pen, page, s.bonus, stripX + 12, sy - 5, 9, { bold: true });
    drawText(pen, page, s.label, stripX + 34, sy - 5, 8.5);
    sy -= 13;
  }
  let ky = Math.min(ly, sy - 6) - 2;
  drawText(pen, page, L.skills.toUpperCase(), left, ky - 8, 7, { bold: true });
  ky -= 14;
  for (const s of sheet.skills) {
    check(page, left + 4, ky - 2, s.proficient);
    drawText(pen, page, s.bonus, left + 12, ky - 5, 8.5, { bold: true });
    drawText(pen, page, `${s.label} (${s.ability})`, left + 34, ky - 5, 8);
    ky -= 12;
  }
  drawText(pen, page, L.passivePerception, left, ky - 8, 7.5);
  drawText(pen, page, sheet.passivePerception, left + leftW - 20, ky - 8, 9, { bold: true });

  // Right area: combat boxes, attacks, then the flowing text blocks.
  const rx = left + leftW + 14;
  const rw = right - rx;
  const w3 = (rw - 8) / 3;
  const combat: [string, string][] = [
    [L.armorClass, sheet.armorClass],
    [L.initiative, sheet.initiative],
    [L.speed, sheet.speed],
  ];
  combat.forEach(([label, value], i) => field(pen, page, label, value, rx + i * (w3 + 4), y - 32, w3, 32));
  let ry = y - 36;
  field(pen, page, L.hitPointMax, sheet.hitPointMax, rx, ry - 32, w3 * 1.5, 32);
  field(pen, page, L.hitDice, sheet.hitDice, rx + w3 * 1.5 + 4, ry - 32, rw - w3 * 1.5 - 4, 32);
  ry -= 40;

  drawText(pen, page, L.attacks.toUpperCase(), rx, ry - 8, 7, { bold: true });
  ry -= 12;
  const nameW = rw - 190;
  drawText(pen, page, L.attackName, rx, ry - 7, 6.5, { color: LIGHT });
  drawText(pen, page, L.attackBonus, rx + nameW, ry - 7, 6.5, { color: LIGHT });
  drawText(pen, page, L.attackDamage, rx + nameW + 50, ry - 7, 6.5, { color: LIGHT });
  ry -= 11;
  const rows = Math.max(3, Math.min(sheet.attacks.length, 6));
  for (let i = 0; i < rows; i++) {
    const a = sheet.attacks[i];
    page.drawLine({ start: { x: rx, y: ry - 13 }, end: { x: right, y: ry - 13 }, thickness: 0.5, color: LIGHT });
    if (a) {
      drawText(pen, page, a.name, rx, ry - 10, 8.5);
      drawText(pen, page, a.bonus, rx + nameW, ry - 10, 8.5);
      drawText(pen, page, a.damage, rx + nameW + 50, ry - 10, 8.5);
    }
    ry -= 15;
  }
  ry -= 6;

  // Flowing blocks: the right area of page 1 first, then full-width pages.
  let curX = rx;
  let curW = rw;
  let cy = ry;
  const bottom = MARGIN + FOOTER_H;
  const size = 8.5;
  const lead = 11;
  const ensure = (needed: number): void => {
    if (cy - needed >= bottom) return;
    page = newPage(pen);
    curX = left;
    curW = right - left;
    cy = PAGE_H - MARGIN;
  };
  for (const section of sheet.sections) {
    ensure(lead * 2 + 8);
    drawText(pen, page, section.title.toUpperCase(), curX, cy - 8, 7.5, { bold: true });
    page.drawLine({ start: { x: curX, y: cy - 11 }, end: { x: curX + curW, y: cy - 11 }, thickness: 0.6, color: INK });
    cy -= 16;
    for (const para of section.lines) {
      for (const line of wrapText(toWinAnsi(para, font), font, size, curW)) {
        ensure(lead);
        drawText(pen, page, line, curX, cy - 8, size);
        cy -= lead;
      }
      cy -= 2;
    }
    cy -= 6;
  }

  // Footer of every page: the page number and the SRD notice.
  const total = pen.pages.length;
  pen.pages.forEach((p, i) => {
    drawText(pen, p, `${L.title} - ${L.page} ${i + 1}/${total}`, MARGIN, MARGIN - 8, 7, { color: LIGHT });
    if (sheet.attribution) {
      wrapText(toWinAnsi(sheet.attribution, font), font, 6.5, PAGE_W - 2 * MARGIN).forEach((line, j) => {
        drawText(pen, p, line, MARGIN, MARGIN + 22 - j * 8, 6.5, { color: LIGHT });
      });
    }
  });

  return doc.save();
}
