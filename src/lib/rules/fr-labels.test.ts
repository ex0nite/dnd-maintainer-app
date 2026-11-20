import { describe, expect, it } from 'vitest';
import enGamedata from '@/locales/en/gamedata.json';
import {
  ABILITY_VOCAB,
  DAMAGE_TYPE_VOCAB,
  LANGUAGE_VOCAB,
  SIZE_VOCAB,
  SKILL_VOCAB,
  SPELL_SCHOOL_VOCAB,
} from '@/lib/rules/vocab';
import { SRD_2014_ENTRIES } from '@/lib/rules/srd-2014';
import {
  FR_TABLE_2014,
  applyFrNames,
  frGamedataLabels,
  gamedataPaths,
  withFrLabels2014,
  type FrSection,
} from '@/lib/rules/fr-labels';

const SECTIONS = Object.keys(FR_TABLE_2014) as FrSection[];

function hasPath(tree: unknown, path: string): boolean {
  let node = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

/** Table ids with no label in the English `gamedata` of the repository (reported, never invented). */
const NOT_IN_GAMEDATA: Readonly<Record<string, readonly string[]>> = {
  // Shown through the SRD entry's own name, not through a gamedata key.
  'sous-especes': ['hill-dwarf', 'high-elf', 'lightfoot-halfling', 'rock-gnome'],
  // 2014 species of the SRD that `gamedata` (2024) does not know.
  especes: ['half-elf', 'half-orc'],
  // Weapon properties of the SRD that `gamedata` has no entry for.
  'proprietes-armes': ['monk', 'range'],
  // Alignment and languages without a `gamedata` entry.
  alignements: ['unaligned'],
  langues: ['thieves-cant', 'druidic'],
};

const SKILL_TABLE_ID: Readonly<Record<string, string>> = {
  animalhandling: 'animal-handling',
  sleightofhand: 'sleight-of-hand',
};

describe('French labels of the 2014 rules (D-39)', () => {
  it('holds only the allowed sections: no spell, no equipment, no glossary', () => {
    expect([...SECTIONS].sort()).toEqual(
      [
        'alignements',
        'caracteristiques',
        'categories-armes-armures',
        'classes',
        'competences',
        'degats',
        'ecoles',
        'especes',
        'etats',
        'langues',
        'proprietes-armes',
        'sexes',
        'sous-classes',
        'sous-especes',
        'tailles',
      ].sort()
    );
  });

  it('has a non-empty label for every id', () => {
    for (const section of SECTIONS) {
      for (const [id, label] of Object.entries(FR_TABLE_2014[section])) {
        expect(label.trim(), `${section}.${id}`).not.toBe('');
      }
    }
  });

  it('applies the validated corrections', () => {
    const t = FR_TABLE_2014;
    expect(t.langues).toMatchObject({
      elvish: 'Elfe',
      orc: 'Ore',
      sylvan: 'Sylvain',
      deepspeech: 'Profond',
      undercommon: 'Commun des profondeurs',
      'thieves-cant': 'Argot des voleurs',
      druidic: 'Druidique',
    });
    expect(t.especes['half-orc']).toBe('Demi-ore');
    expect(t.sexes).toEqual({ male: 'Masculin', female: 'Féminin' });
    expect(Object.values(t.alignements)).toEqual([
      'Loyal bon',
      'Neutre bon',
      'Chaotique bon',
      'Loyal neutre',
      'Neutre',
      'Chaotique neutre',
      'Loyal mauvais',
      'Neutre mauvais',
      'Chaotique mauvais',
      'Sans alignement',
    ]);
  });

  it('has no orphan key: each id feeds an existing gamedata path or is a documented exception', () => {
    const orphans: string[] = [];
    for (const section of SECTIONS) {
      const allowed = NOT_IN_GAMEDATA[section] ?? [];
      for (const id of Object.keys(FR_TABLE_2014[section])) {
        const paths = gamedataPaths(section, id);
        const known = paths.length > 0 && paths.every((p) => hasPath(enGamedata, p));
        if (!known && !allowed.includes(id)) orphans.push(`${section}.${id}`);
      }
    }
    // The 2014 subclasses `gamedata` (2024) has no key for are only shown through the SRD entry's own name.
    expect(orphans.filter((o) => !o.startsWith('sous-classes.'))).toEqual([]);
  });

  it('covers every SRD id of the imported sections', () => {
    const idsOf = (kind: string) =>
      SRD_2014_ENTRIES.map((e) => e as { kind: string; id: string })
        .filter((e) => e.kind === kind)
        .map((e) => e.id);
    const missing = (section: FrSection, ids: readonly string[], except: readonly string[] = []) =>
      ids.filter((id) => !(id in FR_TABLE_2014[section]) && !except.includes(id));
    expect({
      species: missing('especes', idsOf('species')),
      subspecies: missing('sous-especes', idsOf('subspecies')),
      classes: missing('classes', idsOf('class')),
      subclasses: missing('sous-classes', idsOf('subclass')),
      abilities: missing('caracteristiques', ABILITY_VOCAB),
      skills: missing(
        'competences',
        SKILL_VOCAB.map((s) => SKILL_TABLE_ID[s] ?? s)
      ),
      damage: missing('degats', DAMAGE_TYPE_VOCAB),
      sizes: missing('tailles', SIZE_VOCAB),
      schools: missing('ecoles', SPELL_SCHOOL_VOCAB),
      // common-sign has no entry in the source table.
      languages: missing('langues', LANGUAGE_VOCAB, ['common-sign']),
    }).toEqual({
      species: [],
      subspecies: [],
      classes: [],
      subclasses: [],
      abilities: [],
      skills: [],
      damage: [],
      sizes: [],
      schools: [],
      languages: [],
    });
  });

  it('builds the gamedata overlay with capitalized labels and the right ids', () => {
    const labels = frGamedataLabels();
    expect(labels.get('abilities.str')).toBe('Force');
    expect(labels.get('skills.animalhandling')).toBe('Dressage');
    expect(labels.get('skills.sleightofhand')).toBe('Escamotage');
    expect(labels.get('alignments.lg')).toBe('Loyal bon');
    expect(labels.get('alignments.n')).toBe('Neutre');
    expect(labels.get('damageTypes.acid')).toBe('Acide');
    expect(labels.get('conditions.blinded.name')).toBe('Aveuglé');
    expect(labels.get('schools.conjuration')).toBe('Invocation');
    expect(labels.get('weaponCategories.simple')).toBe('Armes courantes');
    expect(labels.get('armor.shields')).toBe('Boucliers');
    expect(labels.get('gender.female')).toBe('Féminin');
    expect(labels.get('languages.orc')).toBe('Ore');
  });

  it('never mutates the bundle it is given and keeps untouched keys', () => {
    const bundle = structuredClone(enGamedata);
    const out = withFrLabels2014(bundle);
    expect(bundle).toEqual(enGamedata);
    expect(out.abilities.str).toBe('Force');
    expect(out.conditions.blinded.description).toBe(enGamedata.conditions.blinded.description);
    expect(out.languages['common-sign']).toBe(enGamedata.languages['common-sign']);
    expect(out.weaponProperties.reach).toBe('Allonge');
  });

  it('lays the table names over the SRD entries without touching other kinds', () => {
    const entries = applyFrNames(SRD_2014_ENTRIES) as { kind: string; id: string; name: { en: string; fr?: string } }[];
    const get = (kind: string, id: string) => entries.find((e) => e.kind === kind && e.id === id)!;
    expect(get('species', 'half-orc').name).toEqual({ en: 'Half-Orc', fr: 'Demi-ore' });
    expect(get('subclass', 'berserker').name.fr).toBe('Voie du berserker');
    expect(get('subspecies', 'high-elf').name.fr).toBe('Haut-elfe');
    expect(get('class', 'fighter').name.fr).toBe('Guerrier');
    const spell = SRD_2014_ENTRIES.find((e) => (e as { kind: string }).kind === 'spell');
    expect(entries.find((e) => e.kind === 'spell')).toBe(spell);
  });
});
