/**
 * French labels of the 2014 rules vocabulary (story: D-39). The table `src/locales/fr/srd-2014.json` holds only names
 * that come from the free-to-reuse core book (classes, species, subspecies, SRD subclasses, abilities, skills, damage
 * types, conditions, schools, weapon and armor categories, weapon properties, sizes) plus sexes, alignments and
 * languages. Spell and equipment names are NOT in it (their French source is not free): they stay English.
 *
 * The table is applied at render time only: ids and SRD data are untouched, and 2024 never sees it (the overlay is
 * built for a 2014 campaign by `RuleSetProvider`). A label that is missing falls back to the English `gamedata` text.
 */
import table from '@/locales/fr/srd-2014.json';

export type FrSection = keyof typeof table;
type Table = Readonly<Record<FrSection, Readonly<Record<string, string>>>>;
export const FR_TABLE_2014: Table = table;

type Tree = { [key: string]: string | Tree };

/** Table id -> `gamedata` ids, for the sections whose ids are spelled differently in `gamedata`. */
const SKILL_KEY: Readonly<Record<string, string>> = {
  'animal-handling': 'animalhandling',
  'sleight-of-hand': 'sleightofhand',
};
const ALIGNMENT_KEY: Readonly<Record<string, string>> = {
  'lawful-good': 'lg',
  'neutral-good': 'ng',
  'chaotic-good': 'cg',
  'lawful-neutral': 'ln',
  neutral: 'n',
  'chaotic-neutral': 'cn',
  'lawful-evil': 'le',
  'neutral-evil': 'ne',
  'chaotic-evil': 'ce',
};
/** Weapon / armor category ids of the table -> the `gamedata` paths showing them (proficiency lists and categories). */
const CATEGORY_KEYS: Readonly<Record<string, readonly string[]>> = {
  'simple-weapons': ['weaponCategories.simple', 'weapons.simple'],
  'martial-weapons': ['weaponCategories.martial', 'weapons.martial'],
  'light-armor': ['armorCategories.light', 'armor.light'],
  'medium-armor': ['armorCategories.medium', 'armor.medium'],
  'heavy-armor': ['armorCategories.heavy', 'armor.heavy'],
  shields: ['armorCategories.shield', 'armor.shields'],
};

/** `gamedata` paths a table entry feeds (several for a category), or none when `gamedata` has no such label. */
export function gamedataPaths(section: FrSection, id: string): readonly string[] {
  switch (section) {
    case 'classes':
      return [`classes.${id}`];
    case 'especes':
      return [`species.${id}`];
    case 'sous-especes':
      return []; // shown through the entry's own name (see `applyFrNames`)
    case 'sous-classes':
      return [`subclasses.${id}.name`];
    case 'caracteristiques':
      return [`abilities.${id}`];
    case 'competences':
      return [`skills.${SKILL_KEY[id] ?? id}`];
    case 'degats':
      return [`damageTypes.${id}`];
    case 'etats':
      return [`conditions.${id}.name`];
    case 'ecoles':
      return [`schools.${id}`];
    case 'categories-armes-armures':
      return CATEGORY_KEYS[id] ?? [];
    case 'proprietes-armes':
      return [`weaponProperties.${id}`];
    case 'tailles':
      return [`sizes.${id}`];
    case 'sexes':
      return [`gender.${id}`];
    case 'alignements':
      return ALIGNMENT_KEY[id] ? [`alignments.${ALIGNMENT_KEY[id]}`] : [];
    case 'langues':
      return [`languages.${id}`];
  }
}

/** Labels of `gamedata` are capitalized (the table keeps the book's lower case: "acide", "aveuglé"). */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The flat `gamedata` path -> French label map of the whole table. */
export function frGamedataLabels(): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const section of Object.keys(FR_TABLE_2014) as FrSection[]) {
    for (const [id, label] of Object.entries(FR_TABLE_2014[section])) {
      for (const path of gamedataPaths(section, id)) labels.set(path, capitalize(label));
    }
  }
  return labels;
}

function setPath(tree: Tree, path: string, value: string): void {
  const parts = path.split('.');
  let node = tree;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (typeof next === 'object') {
      node = next;
    } else {
      const created: Tree = {};
      node[part] = created;
      node = created;
    }
  }
  node[parts[parts.length - 1]] = value;
}

/**
 * A copy of a French `gamedata` bundle with the 2014 labels laid over it. The input is never mutated (it is the live
 * bundle shared with 2024); a path the table does not cover keeps the bundle's text.
 */
export function withFrLabels2014<T extends object>(bundle: T): T {
  const copy = structuredClone(bundle) as unknown as Tree;
  for (const [path, label] of frGamedataLabels()) setPath(copy, path, label);
  return copy as unknown as T;
}

type Named = { name?: { en?: string; fr?: string }; kind?: string; id?: string };
const NAME_SECTIONS: Readonly<Record<string, FrSection>> = {
  class: 'classes',
  species: 'especes',
  subspecies: 'sous-especes',
  subclass: 'sous-classes',
};

/**
 * SRD 2014 entries with the table's French name for the species, subspecies, classes and subclasses it covers (the
 * generated JSON is not edited: the table wins at render time). Entries of other kinds, or without a label, pass through.
 */
export function applyFrNames(entries: readonly unknown[]): readonly unknown[] {
  return entries.map((raw) => {
    const entry = raw as Named;
    const section = entry.kind ? NAME_SECTIONS[entry.kind] : undefined;
    const label = section && entry.id ? FR_TABLE_2014[section][entry.id] : undefined;
    return label && entry.name ? { ...entry, name: { ...entry.name, fr: label } } : raw;
  });
}
