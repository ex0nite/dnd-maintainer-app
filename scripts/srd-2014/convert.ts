/**
 * Converters from the SRD 5.1 data set (`5e-database`, see ./upstream.ts) to rule entries of the app (envelope +
 * `body`, docs/dnd-2024.md "Rule entries"). Pure and deterministic: same snapshot, same entries, same order.
 *
 * One converter per entry kind, registered in `CONVERTERS`. Story 9.5 converts species, subspecies and backgrounds;
 * story 9.6 classes and subclasses; items (9.7) and spells (9.8) add their converter here and their file to the snapshot.
 *
 * Every entry is validated by `parseRuleEntry` (the strict schema the app reads it with) before it is returned: a
 * conversion that produces an invalid entry throws, nothing is written. A value the closed vocabularies of the engine
 * do not know (proficiency, language, damage type...) throws too: the converter never guesses.
 *
 * What the engine can not express is kept as text (the trait becomes a `feature` with its SRD name and description)
 * and listed in `ConversionResult.unexpressed`, never silently dropped.
 */
import { parseRuleEntry, type RuleEntry, type RuleEntryKind } from '@/lib/rules/schemas';
import {
  ABILITY_VOCAB,
  DAMAGE_TYPE_VOCAB,
  FIGHTING_STYLE_VOCAB,
  LANGUAGE_VOCAB,
  SIZE_VOCAB,
  SKILL_VOCAB,
  TOOL_VOCAB,
  WEAPON_VOCAB,
} from '@/lib/rules/vocab';
import type { Snapshot, SrdRecord } from './upstream';

/** Book id of every SRD entry (`source.book`). */
export const SRD_BOOK = 'srd-5-1';

type Json = Record<string, unknown>;
type Grant = Json;

interface Ref {
  readonly index: string;
  readonly name?: string;
}

interface OptionSet {
  readonly choose: number;
  readonly from: {
    readonly option_set_type: string;
    readonly options?: readonly {
      readonly option_type: string;
      readonly item?: Ref;
      readonly ability_score?: Ref;
      readonly bonus?: number;
      readonly choice?: OptionSet;
    }[];
  };
}

/** An effect of the SRD that the engine can not compute: the text is kept as a feature. */
export interface Unexpressed {
  readonly kind: RuleEntryKind;
  readonly id: string;
  readonly what: string;
}

export interface ConversionResult {
  /** Validated entries per kind, sorted by id. */
  readonly entries: Readonly<Partial<Record<RuleEntryKind, readonly RuleEntry[]>>>;
  readonly unexpressed: readonly Unexpressed[];
}

// ---------------------------------------------------------------------------
// Vocabulary mapping: SRD index → closed vocabulary of the engine (throws on an unknown value)
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`SRD 2014 conversion: ${message}`);
}

function member<T extends string>(vocab: readonly T[], value: string, what: string): T {
  if ((vocab as readonly string[]).includes(value)) return value as T;
  return fail(`${what} "${value}" is not in the engine vocabulary`);
}

const LANGUAGE_IDS: Readonly<Record<string, string>> = { 'deep-speech': 'deepspeech' };

export function mapLanguage(index: string): string {
  return member(LANGUAGE_VOCAB, LANGUAGE_IDS[index] ?? index, 'language');
}

/** Tool proficiencies whose engine id is not the SRD index without hyphens. */
const TOOL_IDS: Readonly<Record<string, string>> = {
  'brewers-supplies': 'brewersupplies',
  'calligraphers-supplies': 'calligrapherstools',
  'carpenters-tools': 'carpentertools',
  'painters-supplies': 'painterstools',
  'dice-set': 'gaming-set-dice',
  'playing-card-set': 'gaming-set-cards',
  'land-vehicles': 'vehicles-land',
  'water-vehicles': 'vehicles-water',
};

/** Weapon proficiencies: the SRD names them in the plural ("battleaxes"), the engine in the singular ("battleaxe"). */
const WEAPON_IDS: Readonly<Record<string, string>> = {
  'simple-weapons': 'simple',
  'martial-weapons': 'martial',
  'hand-crossbows': 'handcrossbow',
  'light-crossbows': 'lightcrossbow',
  'crossbows-light': 'lightcrossbow',
};

const ARMOR_IDS: Readonly<Record<string, string>> = {
  'light-armor': 'light',
  'medium-armor': 'medium',
  'heavy-armor': 'heavy',
  shields: 'shields',
};

type ProficiencyCategory = 'skill' | 'weapon' | 'tool' | 'armor' | 'saving-throw';

/** An SRD proficiency index as `{ category, id }` of a `proficiency` grant. */
export function mapProficiency(index: string): { readonly category: ProficiencyCategory; readonly id: string } {
  if (index.startsWith('skill-')) {
    return { category: 'skill', id: member(SKILL_VOCAB, index.slice(6).replace(/-/g, ''), 'skill') };
  }
  if (index.startsWith('saving-throw-')) {
    return { category: 'saving-throw', id: member(ABILITY_VOCAB, index.slice(13), 'ability') };
  }
  if (ARMOR_IDS[index]) return { category: 'armor', id: ARMOR_IDS[index] };
  const weapon = WEAPON_IDS[index] ?? index.replace(/s$/, '').replace(/-/g, '');
  if ((WEAPON_VOCAB as readonly string[]).includes(weapon)) return { category: 'weapon', id: weapon };
  const tool = TOOL_IDS[index] ?? index.replace(/-/g, '');
  if ((TOOL_VOCAB as readonly string[]).includes(tool)) return { category: 'tool', id: tool };
  return fail(`proficiency "${index}" is not in the engine vocabulary`);
}

function mapAbility(index: string): string {
  return member(ABILITY_VOCAB, index, 'ability');
}

function mapDamageType(index: string): string {
  return member(DAMAGE_TYPE_VOCAB, index, 'damage type');
}

function mapSize(name: string): string {
  return member(SIZE_VOCAB, name.toLowerCase(), 'size');
}

// ---------------------------------------------------------------------------
// Facts the data set does not carry in a structured form
// ---------------------------------------------------------------------------

/**
 * French names (names are facts; descriptions stay in English, the only CC-BY text). An id missing here gets no
 * French name.
 */
const FRENCH_NAMES: Readonly<Record<string, string>> = {
  dragonborn: 'Drakéide',
  dwarf: 'Nain',
  elf: 'Elfe',
  gnome: 'Gnome',
  'half-elf': 'Demi-elfe',
  'half-orc': 'Demi-orque',
  halfling: 'Halfelin',
  human: 'Humain',
  tiefling: 'Tieffelin',
  'hill-dwarf': 'Nain des collines',
  'high-elf': 'Haut-elfe',
  'lightfoot-halfling': 'Halfelin pied-léger',
  'rock-gnome': 'Gnome des roches',
  acolyte: 'Acolyte',
};

const FRENCH_DRAGON_COLORS: Readonly<Record<string, string>> = {
  black: 'Noir',
  blue: 'Bleu',
  brass: 'Airain',
  bronze: 'Bronze',
  copper: 'Cuivre',
  gold: 'Or',
  green: 'Vert',
  red: 'Rouge',
  silver: 'Argent',
  white: 'Blanc',
};

/**
 * Mechanical effects written only in a trait's text, added to the trait's `feature` (which keeps the text). Each one is
 * read from the SRD text quoted in the comment.
 */
const TRAIT_MECHANICS: Readonly<Record<string, readonly Grant[]>> = {
  // "you have resistance against poison damage"
  'dwarven-resilience': [{ type: 'resistance', damageType: 'poison' }],
  // "You have resistance to fire damage."
  'hellish-resistance': [{ type: 'resistance', damageType: 'fire' }],
  // "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level."
  'dwarven-toughness': [{ type: 'hp-bonus', perLevel: 1 }],
};

/** Feature fields the engine computes (uses per rest, save DC), read from the trait text quoted in the comment. */
const FEATURE_EXTRAS: Readonly<Record<string, Json>> = {
  // "you can't use it again until you complete a short or long rest" / "The DC ... equals 8 + your Constitution
  // modifier + your proficiency bonus"
  'breath-weapon': { usesPerRest: 'short', usesCount: 1, saveDC: { dcAbility: 'con' } },
  // "You can't use this feature again until you finish a long rest."
  'relentless-endurance': { usesPerRest: 'long', usesCount: 1 },
};

/**
 * Trait effects with no engine grant: kept as the trait's text (the feature), listed in the conversion report. Keyed by
 * trait index. Advantage on saves or checks, senses and per-day spells are not modeled by the engine.
 */
const TEXT_ONLY: Readonly<Record<string, string>> = {
  darkvision: 'darkvision 60 ft. (no senses in the engine)',
  'dwarven-resilience': 'advantage on saving throws against poison (the poison resistance is a grant)',
  stonecunning: 'double proficiency bonus on History checks about stonework',
  trance: 'four hours of trance instead of sleep',
  'fey-ancestry': 'advantage against being charmed, no magical sleep',
  'high-elf-cantrip': 'one wizard cantrip of choice, Intelligence (SRD spells arrive with story 9.8)',
  lucky: 'reroll a 1 on attack rolls, ability checks and saving throws',
  brave: 'advantage on saving throws against being frightened',
  'halfling-nimbleness': 'move through the space of larger creatures',
  'naturally-stealthy': 'hide behind a larger creature',
  'draconic-ancestry': 'breath weapon shape, size and saving throw per ancestry (shown in the ancestry feature)',
  'breath-weapon': 'breath weapon damage dice by character level (2d6 to 5d6)',
  'gnome-cunning': 'advantage on Intelligence, Wisdom and Charisma saves against magic',
  'artificers-lore': 'double proficiency bonus on History checks about magic items, alchemical objects or devices',
  tinker: 'clockwork devices (the tinker’s tools proficiency is a grant)',
  'relentless-endurance': 'drop to 1 hit point instead of 0 (uses per long rest are tracked)',
  'savage-attacks': 'one extra weapon damage die on a melee critical hit',
  'infernal-legacy': 'thaumaturgy, hellish rebuke and darkness, Charisma (SRD spells arrive with story 9.8)',
};

/**
 * Background text the data set leaves out: the full SRD 5.1 equipment line (the data set lists only part of it as
 * equipment records). Items become grants with story 9.7.
 */
const BACKGROUND_EQUIPMENT: Readonly<Record<string, string>> = {
  acolyte:
    'A holy symbol (a gift to you when you entered the priesthood), a prayer book or prayer wheel, 5 sticks of incense, vestments, a set of common clothes, and a pouch containing 15 gp.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function refs(value: unknown): readonly Ref[] {
  return Array.isArray(value) ? (value as Ref[]) : [];
}

function text(desc: unknown): string {
  if (!Array.isArray(desc)) return fail('a description is not a list of paragraphs');
  return (desc as string[]).map((p) => p.trim()).join('\n\n');
}

function name(id: string, en: string): Json {
  const fr = FRENCH_NAMES[id];
  return fr ? { en, fr } : { en };
}

/** Choice keys `category:origin:id:n`, numbered per category and owner in grant order. */
class ChoiceKeys {
  private readonly next = new Map<string, number>();
  constructor(
    private readonly origin: 'species' | 'background' | 'class' | 'subclass',
    private readonly owner: string
  ) {}
  key(category: string): string {
    const n = this.next.get(category) ?? 0;
    this.next.set(category, n + 1);
    return `${category}:${this.origin}:${this.owner}:${n}`;
  }
}

function optionItems(set: OptionSet, what: string): Ref[] {
  if (set.from.option_set_type !== 'options_array' || !set.from.options) {
    return fail(`${what}: option set "${set.from.option_set_type}" is not supported`);
  }
  // A nested choice ("one type of artisan's tools or one musical instrument", monk) is flattened: any of its items.
  return set.from.options.flatMap((o) =>
    o.option_type === 'choice' && o.choice
      ? optionItems(o.choice, what)
      : [o.item ?? fail(`${what}: option without an item`)]
  );
}

function languageChoice(set: OptionSet, keys: ChoiceKeys, what: string): Grant {
  const from =
    set.from.option_set_type === 'resource_list' ? null : optionItems(set, what).map((i) => mapLanguage(i.index));
  return {
    type: 'proficiency-choice',
    category: 'language',
    key: keys.key('language-choice'),
    count: set.choose,
    from,
  };
}

function proficiencyChoice(set: OptionSet, keys: ChoiceKeys, what: string): Grant {
  const mapped = optionItems(set, what).map((i) => mapProficiency(i.index));
  const category = mapped[0]?.category ?? fail(`${what}: empty choice`);
  if (mapped.some((m) => m.category !== category)) fail(`${what}: a choice mixes proficiency categories`);
  if (category === 'armor') fail(`${what}: armor choices are not converted`);
  return {
    type: 'proficiency-choice',
    category,
    key: keys.key(`${category}-choice`),
    count: set.choose,
    from: mapped.map((m) => m.id),
  };
}

function abilityBonuses(record: SrdRecord): Grant[] {
  return refs(record.ability_bonuses).map((b) => {
    const bonus = b as unknown as { ability_score: Ref; bonus: number };
    return { type: 'ability-bonus', ability: mapAbility(bonus.ability_score.index), bonus: bonus.bonus };
  });
}

function abilityChoice(record: SrdRecord, keys: ChoiceKeys): Grant[] {
  const set = record.ability_bonus_options as OptionSet | undefined;
  if (!set) return [];
  const options = set.from.options ?? fail(`${record.index}: ability bonus options without a list`);
  const bonuses = new Set(options.map((o) => o.bonus));
  if (bonuses.size !== 1) fail(`${record.index}: ability bonus options with different bonuses`);
  return [
    {
      type: 'ability-choice',
      key: keys.key('ability-choice'),
      count: set.choose,
      bonus: options[0].bonus,
      from: options.map((o) => mapAbility((o.ability_score ?? fail(`${record.index}: option without ability`)).index)),
    },
  ];
}

function languages(record: SrdRecord, keys: ChoiceKeys): Grant[] {
  const fixed = refs(record.languages).map((l) => ({
    type: 'proficiency',
    category: 'language',
    id: mapLanguage(l.index),
  }));
  const set = record.language_options as OptionSet | undefined;
  return set ? [...fixed, languageChoice(set, keys, `${record.index} languages`)] : fixed;
}

function startingProficiencies(record: SrdRecord): Grant[] {
  return refs(record.starting_proficiencies).map((p) => ({ type: 'proficiency', ...mapProficiency(p.index) }));
}

// ---------------------------------------------------------------------------
// Traits (species and subspecies)
// ---------------------------------------------------------------------------

interface TraitContext {
  readonly kind: 'species' | 'subspecies';
  readonly owner: string;
  readonly keys: ChoiceKeys;
  readonly traits: ReadonlyMap<string, SrdRecord>;
  readonly unexpressed: Unexpressed[];
  /** Lineages a trait with sub-traits opens (draconic ancestry), collected for the species body. */
  readonly lineages: Json[];
}

const ABILITY_NAMES: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A sub-trait chosen through a lineage (one draconic ancestry): its resistance and its breath weapon. */
function lineageOf(parent: SrdRecord, sub: SrdRecord): Json {
  const prefix = `${parent.index}-`;
  if (!sub.index.startsWith(prefix)) fail(`sub-trait ${sub.index} does not start with ${prefix}`);
  const id = sub.index.slice(prefix.length);
  const specific = (sub.trait_specific ?? {}) as {
    damage_type?: Ref;
    breath_weapon?: { area_of_effect?: { size: number; type: string }; dc?: { dc_type: Ref } };
  };
  const damage = specific.damage_type ?? fail(`${sub.index}: no damage type`);
  const area = specific.breath_weapon?.area_of_effect ?? fail(`${sub.index}: no breath weapon area`);
  const save = specific.breath_weapon?.dc?.dc_type ?? fail(`${sub.index}: no breath weapon save`);
  const saveName = ABILITY_NAMES[mapAbility(save.index)];
  const fr = FRENCH_DRAGON_COLORS[id];
  return {
    id,
    name: fr ? { en: capitalize(id), fr } : { en: capitalize(id) },
    grants: [
      { type: 'resistance', damageType: mapDamageType(damage.index) },
      {
        type: 'feature',
        feature: {
          id: sub.index,
          name: sub.name,
          description: `${capitalize(id)} dragon. Damage type: ${damage.name ?? damage.index}. Breath weapon: ${area.size} ft. ${area.type}, ${saveName} saving throw.`,
        },
      },
    ],
  };
}

function traitGrants(ref: Ref, ctx: TraitContext): Grant[] {
  const trait = ctx.traits.get(ref.index) ?? fail(`${ctx.owner}: unknown trait ${ref.index}`);
  const grants: Grant[] = [
    {
      type: 'feature',
      feature: {
        id: trait.index,
        name: trait.name,
        description: text(trait.desc),
        ...(FEATURE_EXTRAS[trait.index] ?? {}),
      },
    },
  ];
  for (const p of refs(trait.proficiencies)) grants.push({ type: 'proficiency', ...mapProficiency(p.index) });
  const profChoice = trait.proficiency_choices as OptionSet | undefined;
  if (profChoice) grants.push(proficiencyChoice(profChoice, ctx.keys, `${ctx.owner} ${trait.index}`));
  const langChoice = trait.language_options as OptionSet | undefined;
  if (langChoice) grants.push(languageChoice(langChoice, ctx.keys, `${ctx.owner} ${trait.index}`));
  grants.push(...(TRAIT_MECHANICS[trait.index] ?? []));

  const specific = (trait.trait_specific ?? {}) as { subtrait_options?: OptionSet; spell_options?: OptionSet };
  if (specific.subtrait_options) {
    if (ctx.kind !== 'species') fail(`${ctx.owner}: sub-traits are converted on species only`);
    const subs = optionItems(specific.subtrait_options, `${ctx.owner} ${trait.index}`).map(
      (i) => ctx.traits.get(i.index) ?? fail(`${ctx.owner}: unknown sub-trait ${i.index}`)
    );
    const lineages = subs.map((sub) => lineageOf(trait, sub));
    ctx.lineages.push(...lineages);
    grants.push({
      type: 'lineage-choice',
      key: ctx.keys.key('lineage-choice'),
      speciesId: ctx.owner,
      from: lineages.map((l) => l.id),
    });
  }
  const textOnly = TEXT_ONLY[trait.index];
  if (textOnly) ctx.unexpressed.push({ kind: ctx.kind, id: ctx.owner, what: `${trait.name}: ${textOnly}` });
  else if (specific.spell_options) fail(`${ctx.owner}: ${trait.index} offers spells; list it in TEXT_ONLY`);
  return grants;
}

// ---------------------------------------------------------------------------
// Converters, one per kind
// ---------------------------------------------------------------------------

type Converter = (snapshot: Snapshot, unexpressed: Unexpressed[]) => Json[];

function traitIndex(snapshot: Snapshot): ReadonlyMap<string, SrdRecord> {
  return new Map(snapshot.traits.map((t) => [t.index, t]));
}

const convertSpecies: Converter = (snapshot, unexpressed) => {
  const traits = traitIndex(snapshot);
  return snapshot.races.map((race) => {
    const keys = new ChoiceKeys('species', race.index);
    const ctx: TraitContext = { kind: 'species', owner: race.index, keys, traits, unexpressed, lineages: [] };
    const speed = race.speed as number;
    const grants: Grant[] = [
      { type: 'speed', mode: 'walk', value: speed },
      ...abilityBonuses(race),
      ...abilityChoice(race, keys),
      ...languages(race, keys),
      ...startingProficiencies(race),
      ...refs(race.traits).flatMap((t) => traitGrants(t, ctx)),
    ];
    return {
      schema: 1,
      kind: 'species',
      id: race.index,
      name: name(race.index, race.name),
      source: { book: SRD_BOOK },
      body: {
        size: mapSize(race.size as string),
        speed,
        grants,
        ...(ctx.lineages.length > 0 ? { lineages: ctx.lineages } : {}),
      },
    };
  });
};

const convertSubspecies: Converter = (snapshot, unexpressed) => {
  const traits = traitIndex(snapshot);
  const races = new Set(snapshot.races.map((r) => r.index));
  return snapshot.subraces.map((sub) => {
    const parent = (sub.race as Ref | undefined)?.index ?? fail(`${sub.index}: no parent race`);
    if (!races.has(parent)) fail(`${sub.index}: parent race ${parent} is not converted`);
    const keys = new ChoiceKeys('species', sub.index);
    const ctx: TraitContext = { kind: 'subspecies', owner: sub.index, keys, traits, unexpressed, lineages: [] };
    const grants: Grant[] = [
      ...abilityBonuses(sub),
      ...abilityChoice(sub, keys),
      ...languages(sub, keys),
      ...startingProficiencies(sub),
      ...refs(sub.racial_traits).flatMap((t) => traitGrants(t, ctx)),
    ];
    return {
      schema: 1,
      kind: 'subspecies',
      id: sub.index,
      name: name(sub.index, sub.name),
      source: { book: SRD_BOOK },
      ...(typeof sub.desc === 'string' ? { summary: { en: sub.desc } } : {}),
      body: { parent, grants },
    };
  });
};

const convertBackgrounds: Converter = (snapshot, unexpressed) =>
  snapshot.backgrounds.map((bg) => {
    const keys = new ChoiceKeys('background', bg.index);
    const feature = bg.feature as { name: string; desc: string[] } | undefined;
    const equipment = BACKGROUND_EQUIPMENT[bg.index] ?? fail(`${bg.index}: no equipment text`);
    unexpressed.push({
      kind: 'background',
      id: bg.index,
      what: 'starting equipment: text only (SRD items arrive with story 9.7)',
    });
    unexpressed.push({
      kind: 'background',
      id: bg.index,
      what: 'personality traits, ideals, bonds and flaws: not converted',
    });
    const slug = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const grants: Grant[] = [
      ...startingProficiencies(bg),
      ...languages(bg, keys),
      ...(feature
        ? [
            {
              type: 'feature',
              feature: { id: `${bg.index}-${slug(feature.name)}`, name: feature.name, description: text(feature.desc) },
            },
          ]
        : []),
      { type: 'feature', feature: { id: `${bg.index}-equipment`, name: 'Equipment', description: equipment } },
    ];
    return {
      schema: 1,
      kind: 'background',
      id: bg.index,
      name: name(bg.index, bg.name),
      source: { book: SRD_BOOK },
      body: { grants },
    };
  });

// ---------------------------------------------------------------------------
// Classes and subclasses (story 9.6)
// ---------------------------------------------------------------------------

/** French names of the classes and subclasses (names are facts, descriptions stay in English). */
const FRENCH_CLASS_NAMES: Readonly<Record<string, string>> = {
  barbarian: 'Barbare',
  bard: 'Barde',
  cleric: 'Clerc',
  druid: 'Druide',
  fighter: 'Guerrier',
  monk: 'Moine',
  paladin: 'Paladin',
  ranger: 'Rôdeur',
  rogue: 'Roublard',
  sorcerer: 'Ensorceleur',
  warlock: 'Occultiste',
  wizard: 'Magicien',
  berserker: 'Voie du Berserker',
  lore: 'Collège du Savoir',
  life: 'Domaine de la Vie',
  land: 'Cercle de la Terre',
  champion: 'Champion',
  'open-hand': 'Voie de la Main ouverte',
  devotion: 'Serment de dévotion',
  hunter: 'Chasseur',
  thief: 'Voleur',
  draconic: 'Lignée draconique',
  fiend: 'Fiélon',
  evocation: 'École d’évocation',
};

/**
 * The class feature that opens the subclass choice. The SRD 5.1 data set does not say it in a structured form; the level
 * of the feature is the class level at which the subclass is chosen (1, 2 or 3), checked against the first level of
 * every subclass of the data set.
 */
const SUBCLASS_CHOICE_FEATURE: Readonly<Record<string, string>> = {
  barbarian: 'primal-path',
  bard: 'bard-college',
  cleric: 'divine-domain',
  druid: 'druid-circle',
  fighter: 'martial-archetype',
  monk: 'monastic-tradition',
  paladin: 'sacred-oath',
  ranger: 'ranger-archetype',
  rogue: 'roguish-archetype',
  sorcerer: 'sorcerous-origin',
  warlock: 'otherworldly-patron',
  wizard: 'arcane-tradition',
};

/** Engine feature id of an SRD feature whose id the resolver knows (`resolveBardicInspiration` reads this id). */
const FEATURE_IDS: Readonly<Record<string, string>> = {
  'bardic-inspiration-d6': 'bard-bardic-inspiration',
};

/**
 * Uses per rest of class features, read from the SRD text quoted in the comment. Only features that have no
 * progression twin are listed (Action Surge, Indomitable and Channel Divinity of the cleric come as one SRD feature
 * per number of uses, which a sheet would list side by side): those keep their text only.
 */
const CLASS_FEATURE_EXTRAS: Readonly<Record<string, Json>> = {
  // "you must finish a short or long rest before you can use it again"
  'second-wind': { usesPerRest: 'short', usesCount: 1 },
  // "You must finish a long rest before you can use this feature again."
  'wholeness-of-body': { usesPerRest: 'long', usesCount: 1 },
  // "Once per day when you finish a short rest"
  'arcane-recovery': { usesPerRest: 'long', usesCount: 1 },
  // "You can't use this feature again until you finish a long rest."
  'natural-recovery': { usesPerRest: 'long', usesCount: 1 },
  // "you can't use it again until you finish a short or long rest."
  'stroke-of-luck': { usesPerRest: 'short', usesCount: 1 },
  // "you must finish a long rest before you can do so again."
  'eldritch-master': { usesPerRest: 'long', usesCount: 1 },
  // "You must then finish a short or long rest to use your Channel Divinity again." (paladin)
  'channel-divinity': { usesPerRest: 'short', usesCount: 1 },
};

const ALL_SIX_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** Effects of class and subclass features the engine computes, read from the SRD text quoted in the comment. */
type Mechanics = (keys: ChoiceKeys, fightingStyles: readonly string[]) => Grant[];

const expertise =
  (fromTools: readonly string[]): Mechanics =>
  (keys) => [{ type: 'expertise-choice', key: keys.key('expertise-choice'), count: 2, from: null, fromTools }];
const fightingStyle: Mechanics = (keys, styles) => [
  { type: 'fighting-style-choice', key: keys.key('fighting-style-choice'), count: 1, from: styles },
];
const savingThrow = (ability: string): Grant => ({ type: 'proficiency', category: 'saving-throw', id: ability });

const CLASS_MECHANICS: Readonly<Record<string, Mechanics>> = {
  // "your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier"
  'barbarian-unarmored-defense': () => [
    { type: 'armor-class', calculation: { mode: 'unarmored', formula: 'barbarian' } },
  ],
  // "your AC equals 10 + your Dexterity modifier + your Wisdom modifier"
  'monk-unarmored-defense': () => [{ type: 'armor-class', calculation: { mode: 'unarmored', formula: 'monk' } }],
  // "choose two of your skill proficiencies, or one of your skill proficiencies and your proficiency with thieves' tools"
  'rogue-expertise-1': expertise(['thievestools']),
  'rogue-expertise-2': expertise(['thievestools']),
  // "choose two of your skill proficiencies"
  'bard-expertise-1': expertise([]),
  'bard-expertise-2': expertise([]),
  // "add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your
  // proficiency bonus"
  'jack-of-all-trades': () => [
    {
      type: 'ability-check-bonus',
      abilities: [...ALL_SIX_ABILITIES],
      value: 'half-proficiency',
      onlyWhenNotProficient: true,
      featureId: 'jack-of-all-trades',
    },
  ],
  // "you gain proficiency in all saving throws"
  'diamond-soul': () => ALL_SIX_ABILITIES.map(savingThrow),
  // "You gain proficiency in Wisdom saving throws."
  'slippery-mind': () => [savingThrow('wis')],
  'fighter-fighting-style': fightingStyle,
  'paladin-fighting-style': fightingStyle,
  'ranger-fighting-style': fightingStyle,
};

const SUBCLASS_MECHANICS: Readonly<Record<string, Mechanics>> = {
  // "you gain proficiency with heavy armor"
  'life:bonus-proficiency': () => [{ type: 'proficiency', category: 'armor', id: 'heavy' }],
  // "you gain proficiency with three skills of your choice"
  'lore:bonus-proficiencies': (keys) => [
    { type: 'proficiency-choice', category: 'skill', key: keys.key('skill-choice'), count: 3, from: null },
  ],
  // "you can choose a second option from the Fighting Style class feature" (the Fighter's list)
  'champion:additional-fighting-style': fightingStyle,
  // "your hit point maximum increases by 1 and increases by 1 again whenever you gain a level in this class"
  // (counted on the character level: exact for a single-class character)
  'draconic:draconic-resilience': () => [{ type: 'hp-bonus', perLevel: 1 }],
};

/** `dragon-ancestor-black---acid-damage` is a valid id once its runs of hyphens are collapsed. */
const slugId = (index: string): string => index.replace(/-+/g, '-');

/** Armor proficiencies: the SRD says "all armor" for fighter and paladin; druids avoid metal (SRD class text). */
function classArmor(classId: string, index: string): string[] {
  if (index === 'all-armor') return ['light', 'medium', 'heavy'];
  if (classId === 'druid') {
    // "Druids will not wear armor or use shields made of metal."
    if (index === 'medium-armor') return ['medium-nonmetal'];
    if (index === 'shields') return ['shields-nonmetal'];
  }
  return [ARMOR_IDS[index] ?? fail(`armor "${index}" is not in the engine vocabulary`)];
}

function classProficiencies(record: SrdRecord): Grant[] {
  return refs(record.proficiencies).flatMap((p): Grant[] => {
    if (p.index === 'all-armor' || p.index in ARMOR_IDS) {
      return classArmor(record.index, p.index).map((id) => ({ type: 'proficiency', category: 'armor', id }));
    }
    return [{ type: 'proficiency', ...mapProficiency(p.index) }];
  });
}

/** Starting equipment as text: items become grants with story 9.7 (SRD equipment). */
function startingEquipmentText(record: SrdRecord): string {
  const fixed = ((record.starting_equipment as readonly { equipment: Ref; quantity: number }[] | undefined) ?? []).map(
    (e) => {
      const label = e.equipment.name ?? e.equipment.index;
      return e.quantity > 1 ? `${e.quantity} ${label}` : label;
    }
  );
  const options = ((record.starting_equipment_options as readonly { desc: string }[] | undefined) ?? []).map(
    (o) => o.desc
  );
  return `You start with the following equipment: ${[...fixed, ...options].join('; ')}.`;
}

interface ClassLevel {
  readonly level: number;
  readonly bonuses: number;
  readonly features: readonly Ref[];
}

function classLevelsOf(snapshot: Snapshot, classId: string): ClassLevel[] {
  const rows = snapshot.levels
    .filter((l) => (l.class as Ref).index === classId && !l.subclass)
    .map((l) => ({
      level: l.level as number,
      bonuses: l.ability_score_bonuses as number,
      features: refs(l.features),
    }))
    .sort((a, b) => a.level - b.level);
  if (rows.length !== 20 || rows.some((r, i) => r.level !== i + 1))
    fail(`${classId}: levels 1 to 20 are not all there`);
  return rows;
}

function featureText(feature: SrdRecord, extra: Json | undefined): Json {
  return {
    id: FEATURE_IDS[feature.index] ?? slugId(feature.index),
    name: feature.name,
    description: text(feature.desc),
    ...(extra ?? {}),
  };
}

const isAsiFeature = (index: string): boolean => /ability-score-improvement/.test(index);

/** Class levels where the SRD table adds an Ability Score Improvement (its cumulative count goes up). */
function asiLevels(levels: readonly ClassLevel[]): number[] {
  return levels.filter((l, i) => l.bonuses > (i === 0 ? 0 : levels[i - 1].bonuses)).map((l) => l.level);
}

function featuresOfClass(snapshot: Snapshot, classId: string): ReadonlyMap<string, SrdRecord> {
  return new Map(
    snapshot.features.filter((f) => (f.class as Ref).index === classId && !f.subclass).map((f) => [f.index, f])
  );
}

function primaryAbility(cls: SrdRecord): string {
  const multi = cls.multi_classing as { prerequisites?: { ability_score: Ref }[]; prerequisite_options?: OptionSet };
  const ref =
    multi.prerequisites?.[0]?.ability_score ??
    multi.prerequisite_options?.from.options?.[0]?.ability_score ??
    fail(`${cls.index}: no primary ability`);
  return mapAbility(ref.index);
}

const convertClasses: Converter = (snapshot, unexpressed) =>
  snapshot.classes.map((cls) => {
    const classId = cls.index;
    const levels = classLevelsOf(snapshot, classId);
    const features = featuresOfClass(snapshot, classId);
    const keys = new ChoiceKeys('class', classId);
    const choiceFeatureIndex = SUBCLASS_CHOICE_FEATURE[classId] ?? fail(`${classId}: no subclass choice feature`);
    const styles = [...features.keys()]
      .sort()
      .map((i) => /^(?:fighter-|ranger-)?fighting-style-(.+)$/.exec(i)?.[1])
      .filter((s): s is string => s !== undefined)
      .map((s) => member(FIGHTING_STYLE_VOCAB, s, 'fighting style'));
    const asi = asiLevels(levels);
    const asiFeatureLevels = levels.filter((l) => l.features.some((f) => isAsiFeature(f.index))).map((l) => l.level);
    if (JSON.stringify(asi) !== JSON.stringify(asiFeatureLevels)) {
      fail(`${classId}: Ability Score Improvement features ${asiFeatureLevels} differ from the table ${asi}`);
    }

    const outLevels = levels.map((row) => {
      const grants: Grant[] = [];
      if (row.level === 1) {
        grants.push({ type: 'hit-die', die: cls.hit_die as number });
        grants.push(...classProficiencies(cls));
        for (const choice of (cls.proficiency_choices as readonly OptionSet[] | undefined) ?? []) {
          grants.push(proficiencyChoice(choice, keys, `${classId} proficiency choice`));
        }
        grants.push({ type: 'armor-class', calculation: { mode: 'armored' } });
        grants.push({
          type: 'feature',
          feature: {
            id: `${classId}-starting-equipment`,
            name: 'Starting equipment',
            description: startingEquipmentText(cls),
          },
        });
        unexpressed.push({
          kind: 'class',
          id: classId,
          what: 'starting equipment: text only (SRD items arrive with story 9.7)',
        });
      }
      for (const ref of row.features) {
        if (isAsiFeature(ref.index)) continue;
        const feature = features.get(ref.index) ?? fail(`${classId}: unknown feature ${ref.index}`);
        grants.push({ type: 'feature', feature: featureText(feature, CLASS_FEATURE_EXTRAS[ref.index]) });
        grants.push(...(CLASS_MECHANICS[ref.index]?.(keys, styles) ?? []));
        if (ref.index === choiceFeatureIndex) {
          grants.push({ type: 'subclass', classId, key: keys.key('subclass') });
        }
      }
      if (asi.includes(row.level)) {
        grants.push({ type: 'asi', key: keys.key('asi'), points: 2, from: null });
      }
      return { grants };
    });

    const textOnly = levels
      .flatMap((l) => l.features)
      .filter((f) => !isAsiFeature(f.index) && !CLASS_MECHANICS[f.index] && !CLASS_FEATURE_EXTRAS[f.index]);
    unexpressed.push({
      kind: 'class',
      id: classId,
      what: `${textOnly.length} features kept as text only (resources, spellcasting and invocations arrive with story 9.8)`,
    });
    return {
      schema: 1,
      kind: 'class',
      id: classId,
      name: classNameOf(classId, cls.name),
      source: { book: SRD_BOOK },
      body: { primaryAbility: primaryAbility(cls), levels: outLevels },
    };
  });

function classNameOf(id: string, en: string): Json {
  const fr = FRENCH_CLASS_NAMES[id];
  return fr ? { en, fr } : { en };
}

const FIGHTER_STYLES = ['archery', 'defense', 'dueling', 'great-weapon-fighting', 'protection', 'two-weapon-fighting'];

const convertSubclasses: Converter = (snapshot, unexpressed) =>
  snapshot.subclasses.map((sub) => {
    const classId = (sub.class as Ref).index;
    const classLevels = classLevelsOf(snapshot, classId);
    const choiceFeature = SUBCLASS_CHOICE_FEATURE[classId] ?? fail(`${classId}: no subclass choice feature`);
    const chosenAt =
      classLevels.find((l) => l.features.some((f) => f.index === choiceFeature))?.level ??
      fail(`${classId}: ${choiceFeature} is at no level`);
    const own = snapshot.features.filter((f) => (f.subclass as Ref | undefined)?.index === sub.index);
    // `supreme-healing` is missing its `subclass` field in the data set: level rows name features by index, so look them up in all.
    const byIndex = new Map(snapshot.features.map((f) => [f.index, f]));
    const levelRows = snapshot.levels
      .filter((l) => (l.subclass as Ref | undefined)?.index === sub.index)
      .sort((a, b) => (a.level as number) - (b.level as number));
    const first = levelRows[0]?.level as number | undefined;
    if (first !== chosenAt) fail(`${sub.index}: first feature level ${first} is not the choice level ${chosenAt}`);

    const inLevels = new Set(levelRows.flatMap((l) => refs(l.features).map((f) => f.index)));
    // A feature of the subclass in no level row either is an option of another one (`hunters-prey-*` under
    // `hunters-prey`, the `dragon-ancestor-*` colors) or stands on its own at its own level (`circle-spells-1`).
    const unused = own.filter((f) => !inLevels.has(f.index)).sort((a, b) => (a.index < b.index ? -1 : 1));
    const optionsOf = (parent: string): SrdRecord[] => unused.filter((f) => f.index.startsWith(`${parent}-`));
    const isOption = (f: SrdRecord): boolean =>
      own.some((p) => p.index !== f.index && f.index.startsWith(`${p.index}-`));
    const keys = new ChoiceKeys('subclass', sub.index);

    const entries: { level: number; feature: SrdRecord }[] = [
      ...levelRows.flatMap((l) =>
        refs(l.features).map((r) => ({
          level: l.level as number,
          feature: byIndex.get(r.index) ?? fail(`${sub.index}: unknown feature ${r.index}`),
        }))
      ),
      ...unused.filter((f) => !isOption(f)).map((f) => ({ level: f.level as number, feature: f })),
    ].sort((a, b) => a.level - b.level);

    const byLevel = new Map<number, Grant[]>();
    for (const { level, feature } of entries) {
      const grants = byLevel.get(level) ?? [];
      grants.push({ type: 'feature', feature: featureText(feature, undefined) });
      grants.push(...(SUBCLASS_MECHANICS[`${sub.index}:${feature.index}`]?.(keys, FIGHTER_STYLES) ?? []));
      const options = optionsOf(feature.index);
      if (options.length > 0) {
        grants.push({
          type: 'feature-choice',
          key: keys.key('feature-choice'),
          options: options.map((o) => ({
            optionId: slugId(o.index.slice(feature.index.length + 1)),
            featureId: slugId(o.index),
            grants: [{ type: 'feature', feature: featureText(o, undefined) }],
          })),
        });
      }
      byLevel.set(level, grants);
    }
    unexpressed.push({
      kind: 'subclass',
      id: sub.index,
      what: `${entries.length} features kept as text (domain, oath and expanded spell lists arrive with story 9.8)`,
    });
    return {
      schema: 1,
      kind: 'subclass',
      id: sub.index,
      name: classNameOf(sub.index, sub.name),
      source: { book: SRD_BOOK },
      summary: { en: text(sub.desc) },
      body: {
        class: classId,
        chosenAtClassLevel: chosenAt,
        features: [...byLevel.entries()]
          .sort(([a], [b]) => a - b)
          .map(([classLevel, grants]) => ({ classLevel, grants })),
      },
    };
  });

/** Converters in output order. Stories 9.7 and 9.8 add items and spells here. */
export const CONVERTERS: readonly { readonly kind: RuleEntryKind; readonly convert: Converter }[] = [
  { kind: 'species', convert: convertSpecies },
  { kind: 'subspecies', convert: convertSubspecies },
  { kind: 'background', convert: convertBackgrounds },
  { kind: 'class', convert: convertClasses },
  { kind: 'subclass', convert: convertSubclasses },
];

/** Converts a snapshot and validates every entry with the app's strict schema. Throws on the first invalid entry. */
export function convertSrd2014(snapshot: Snapshot): ConversionResult {
  const unexpressed: Unexpressed[] = [];
  const entries: Partial<Record<RuleEntryKind, RuleEntry[]>> = {};
  for (const { kind, convert } of CONVERTERS) {
    const list = convert(snapshot, unexpressed).map((raw) => {
      const parsed = parseRuleEntry(raw);
      if (!parsed.ok) {
        const issue = parsed.issues[0];
        return fail(`${kind} ${String(raw.id)} is invalid: ${issue?.path ?? ''}: ${issue?.message ?? ''}`);
      }
      return parsed.entry;
    });
    const ids = list.map((e) => e.id);
    if (new Set(ids).size !== ids.length) fail(`duplicate ${kind} id`);
    entries[kind] = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return { entries, unexpressed };
}
