/**
 * Reproducibility of the SRD 2014 generator (story 9.5): converting the committed snapshot of the SRD data set gives
 * exactly the committed entries, with no network. If this fails, run `npm run srd:generate` and review the diff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSrd2014, CONVERTERS, mapLanguage, mapProficiency } from './convert';
import { SNAPSHOT_FILES, sortRecords, type Snapshot, type SnapshotName, type SrdRecord } from './upstream';

const ROOT = join(__dirname, '..', '..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

function snapshot(): Snapshot {
  const out: Partial<Record<SnapshotName, SrdRecord[]>> = {};
  for (const name of Object.keys(SNAPSHOT_FILES) as SnapshotName[]) {
    out[name] = readJson(`scripts/srd-2014/snapshot/${name}.json`) as SrdRecord[];
  }
  return out as Snapshot;
}

describe('SRD 2014 generator', () => {
  it('the committed output is what the generator produces from the committed snapshot', () => {
    const { entries } = convertSrd2014(snapshot());
    for (const { kind } of CONVERTERS) {
      expect(readJson(`src/lib/rules/srd-2014/${kind}.json`)).toEqual(JSON.parse(JSON.stringify(entries[kind])));
    }
  });

  it('is deterministic and does not depend on the order of the records', () => {
    const snap = snapshot();
    const reversed = Object.fromEntries(
      Object.entries(snap).map(([k, v]) => [k, [...v].reverse()])
    ) as unknown as Snapshot;
    expect(JSON.stringify(convertSrd2014(reversed).entries)).toBe(JSON.stringify(convertSrd2014(snap).entries));
    for (const records of Object.values(snap)) expect(sortRecords(records)).toEqual(records);
  });

  it('lists every effect it keeps as text only', () => {
    const { unexpressed } = convertSrd2014(snapshot());
    expect(unexpressed.some((u) => u.id === 'high-elf' && /cantrip/i.test(u.what))).toBe(true);
    expect(unexpressed.some((u) => u.id === 'tiefling' && /Infernal Legacy/.test(u.what))).toBe(true);
  });

  it('maps SRD vocabulary to the closed engine vocabulary, and refuses what it does not know', () => {
    expect(mapProficiency('skill-sleight-of-hand')).toEqual({ category: 'skill', id: 'sleightofhand' });
    expect(mapProficiency('light-hammers')).toEqual({ category: 'weapon', id: 'lighthammer' });
    expect(mapProficiency('brewers-supplies')).toEqual({ category: 'tool', id: 'brewersupplies' });
    expect(mapProficiency('tinkers-tools')).toEqual({ category: 'tool', id: 'tinkerstools' });
    expect(mapLanguage('deep-speech')).toBe('deepspeech');
    expect(mapProficiency('alchemists-supplies')).toEqual({ category: 'tool', id: 'alchemistssupplies' });
    expect(mapProficiency('crossbows-light')).toEqual({ category: 'weapon', id: 'lightcrossbow' });
    expect(() => mapProficiency('mystery-tools')).toThrow(/not in the engine vocabulary/);
    expect(() => mapLanguage('thieves-cant')).toThrow(/not in the engine vocabulary/);
  });

  it('refuses a record that would make an invalid entry (nothing is written)', () => {
    const snap = snapshot();
    const evil = { ...snap, backgrounds: [{ ...snap.backgrounds[0], name: '<b>Acolyte</b>' }] };
    expect(() => convertSrd2014(evil)).toThrow(/background acolyte is invalid: name.en/);
  });

  it('converts the 12 classes and 12 subclasses of the SRD and reports what stays text (story 9.6)', () => {
    const { entries, unexpressed } = convertSrd2014(snapshot());
    expect(entries.class).toHaveLength(12);
    expect(entries.subclass).toHaveLength(12);
    expect(unexpressed.some((u) => u.kind === 'class' && u.id === 'wizard' && /text only/.test(u.what))).toBe(true);
    // Starting equipment is grants since story 9.7: no longer reported as text only.
    expect(unexpressed.some((u) => u.kind === 'class' && /starting equipment/.test(u.what))).toBe(false);
    const fighter = entries.class?.find((e) => e.id === 'fighter');
    const grants = (fighter?.body as { levels: { grants: { type: string }[] }[] }).levels[0].grants;
    expect(grants.filter((g) => g.type === 'bundle-choice')).toHaveLength(4);
  });

  it('refuses a class whose Ability Score Improvement features disagree with the level table', () => {
    const snap = snapshot();
    const levels = snap.levels.map((l) =>
      l.index === 'fighter-6' ? { ...l, ability_score_bonuses: 1 } : l
    ) as unknown as SrdRecord[];
    expect(() => convertSrd2014({ ...snap, levels })).toThrow(/Ability Score Improvement features/);
  });

  it('refuses a subclass whose first level is not the level of its class choice', () => {
    const snap = snapshot();
    const levels = snap.levels.filter((l) => l.index !== 'life-1') as unknown as SrdRecord[];
    expect(() => convertSrd2014({ ...snap, levels })).toThrow(/is not the choice level 1/);
  });

  it('refuses an equipment or proficiency value the engine does not know', () => {
    const snap = snapshot();
    const classes = snap.classes.map((c) =>
      c.index === 'wizard'
        ? { ...c, proficiencies: [...(c.proficiencies as unknown[]), { index: 'mystery-tools', name: 'Mystery' }] }
        : c
    ) as unknown as SrdRecord[];
    expect(() => convertSrd2014({ ...snap, classes })).toThrow(/not in the engine vocabulary/);
  });
});
