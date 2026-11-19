/**
 * Strict Zod schemas of a rule entry (story 9.3, docs/rules-as-data.md §3.3): the envelope, the body of each kind and
 * each of the 29 `Grant` variants. No unknown key anywhere (`z.strictObject`), bounded strings and arrays, closed
 * mechanical vocabularies (`./vocab`), open kebab-case entity ids.
 *
 * The same rules are enforced, more coarsely, by `public.validate_rule_entry` in the database: keep both in step
 * (limits are the constants below and the SQL function's header).
 */
import { z } from 'zod';
import { parseChoiceKey, type ChoiceKey } from '@/types/choices';
import type { Grant } from '@/types/grants';
import {
  ABILITY_VOCAB,
  ARMOR_VOCAB,
  BUNDLE_CATEGORY_VOCAB,
  CLASS_VOCAB,
  DAMAGE_TYPE_VOCAB,
  FEAT_CATEGORY_VOCAB,
  FIGHTING_STYLE_VOCAB,
  LANGUAGE_VOCAB,
  SIZE_VOCAB,
  SKILL_VOCAB,
  SPEED_MODE_VOCAB,
  SPELL_SCHOOL_VOCAB,
  TOOL_VOCAB,
  UNARMORED_FORMULA_VOCAB,
  WEAPON_VOCAB,
} from '@/lib/rules/vocab';

// ---------------------------------------------------------------------------
// Limits (mirrored in supabase/migrations/*_rule_entries.sql)
// ---------------------------------------------------------------------------

export const RULE_LIMITS = {
  /** Envelope schema version understood by this code. */
  schemaVersion: 1,
  entryIdMin: 3,
  entryIdMax: 60,
  refIdMax: 60,
  nameMax: 120,
  summaryMax: 4000,
  descriptionMax: 4000,
  shortTextMax: 120,
  /** Material component of a spell (a few spells list a long set of materials). */
  materialMax: 400,
  needsReviewMax: 20,
  needsReviewNoteMax: 200,
  grantsMax: 60,
  listMax: 100,
  classLevels: 20,
  subclassFeaturesMax: 40,
  lineagesMax: 20,
  featureChoiceOptionsMax: 30,
  featurePicksOptionsMax: 40,
  sourceBookMax: 20,
  sourcePageMax: 2000,
  /** Bytes of the JSON text (`octet_length(content::text)` in SQL). */
  /**
   * Bytes of `JSON.stringify(content)`, a little under the database bound (`octet_length(content::text) <= 65536`):
   * jsonb normalizes the text (spaces after `:` and `,`), so the same entry is a little longer there.
   */
  contentBytesMax: 60000,
  /** Nesting depth of the JSON (objects and arrays). */
  depthMax: 12,
  /** Entries per (ruleset, kind) in the DM library. */
  entriesPerKindMax: 2000,
} as const;

export const RULE_ENTRY_KINDS = [
  'species',
  'subspecies',
  'class',
  'subclass',
  'background',
  'feat',
  'spell',
  'item',
] as const;
export type RuleEntryKind = (typeof RULE_ENTRY_KINDS)[number];

export function isRuleEntryKind(value: unknown): value is RuleEntryKind {
  return typeof value === 'string' && (RULE_ENTRY_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Anything that could be read as markup, a link or a script is refused in rule text. Text is always displayed as
 * plain text (React escapes it), this is defence in depth and keeps entries free of links to copyrighted sources.
 */
export const UNSAFE_TEXT = /[<>]|javascript:|vbscript:|data:|http|^\s*(\/\/|www\.)/i;

export const UNSAFE_TEXT_MESSAGE =
  'markup, links and scripts are not allowed in rule text (<, >, javascript:, vbscript:, data:, http, www., //)';

/** Control and invisible formatting characters (Unicode Cc and Cf): they can hide a scheme or reorder text. */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

export const CONTROL_TEXT_MESSAGE = 'control and invisible formatting characters are not allowed in rule text';

/**
 * Plain text of a rule entry. `multiline` (summaries, descriptions) allows line breaks, nothing else of Cc/Cf.
 * The database floor (`validate_rule_entry`) applies the same patterns.
 */
export function safeText(max: number, { multiline = false }: { readonly multiline?: boolean } = {}) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !CONTROL_OR_FORMAT.test(multiline ? s.replace(/\r?\n/g, '') : s), {
      message: CONTROL_TEXT_MESSAGE,
    })
    .refine((s) => !UNSAFE_TEXT.test(s), { message: UNSAFE_TEXT_MESSAGE });
}

/** True for a well-formed entity id (kebab-case, 3 to 60 characters), known or not. */
export function isEntityId(value: string): boolean {
  return value.length >= 3 && value.length <= 60 && KEBAB.test(value);
}

/** Id of an entry (envelope `id`): kebab-case, 3 to 60 characters. */
export const entryIdSchema = z
  .string()
  .min(RULE_LIMITS.entryIdMin)
  .max(RULE_LIMITS.entryIdMax)
  .regex(KEBAB, 'ids are kebab-case: lowercase letters and digits separated by single hyphens');

/** Reference to another entity (feat, spell, item, feature, pool...): kebab-case, 1 to 60 characters. */
export const refIdSchema = z
  .string()
  .min(1)
  .max(RULE_LIMITS.refIdMax)
  .regex(KEBAB, 'ids are kebab-case: lowercase letters and digits separated by single hyphens');

const choiceKeySchema = z
  .string()
  .max(120)
  .refine(
    (key) => {
      try {
        const parsed = parseChoiceKey(key);
        return KEBAB.test(parsed.id);
      } catch {
        return false;
      }
    },
    { message: 'choice keys are "category:origin:id:index", e.g. "skill-choice:species:my-species:0"' }
  )
  .transform((key) => key as ChoiceKey);

const count = z.number().int().min(1).max(20);
const classLevel = z.number().int().min(1).max(RULE_LIMITS.classLevels);
const list = <T extends z.ZodType>(item: T) => z.array(item).max(RULE_LIMITS.listMax);

export const localizedNameSchema = z.strictObject({
  en: safeText(RULE_LIMITS.nameMax),
  fr: safeText(RULE_LIMITS.nameMax).optional(),
});

export const localizedSummarySchema = z.strictObject({
  en: safeText(RULE_LIMITS.summaryMax, { multiline: true }).optional(),
  fr: safeText(RULE_LIMITS.summaryMax, { multiline: true }).optional(),
});

const abilityEnum = z.enum(ABILITY_VOCAB);
const skillEnum = z.enum(SKILL_VOCAB);
const toolEnum = z.enum(TOOL_VOCAB);
const languageEnum = z.enum(LANGUAGE_VOCAB);
const armorEnum = z.enum(ARMOR_VOCAB);
const weaponEnum = z.enum(WEAPON_VOCAB);
const damageEnum = z.enum(DAMAGE_TYPE_VOCAB);
const classEnum = z.enum(CLASS_VOCAB);

// ---------------------------------------------------------------------------
// Grants: one schema per variant of `Grant` (src/types/grants.ts)
// ---------------------------------------------------------------------------

const featureDefSchema = z.strictObject({
  id: refIdSchema,
  name: safeText(RULE_LIMITS.nameMax).optional(),
  description: safeText(RULE_LIMITS.descriptionMax, { multiline: true }).optional(),
  usesPerRest: z.enum(['short', 'long']).optional(),
  usesCount: z.number().int().min(1).max(20).optional(),
  saveDC: z.strictObject({ dcAbility: abilityEnum }).optional(),
});

const proficiencyGrantSchema = z.discriminatedUnion('category', [
  z.strictObject({ type: z.literal('proficiency'), category: z.literal('armor'), id: armorEnum }),
  z.strictObject({ type: z.literal('proficiency'), category: z.literal('weapon'), id: weaponEnum }),
  z.strictObject({ type: z.literal('proficiency'), category: z.literal('tool'), id: toolEnum }),
  z.strictObject({ type: z.literal('proficiency'), category: z.literal('skill'), id: skillEnum }),
  z.strictObject({ type: z.literal('proficiency'), category: z.literal('saving-throw'), id: abilityEnum }),
  z.strictObject({ type: z.literal('proficiency'), category: z.literal('language'), id: languageEnum }),
]);

const choiceBase = { key: choiceKeySchema, count };
const proficiencyChoiceGrantSchema = z.discriminatedUnion('category', [
  z.strictObject({
    type: z.literal('proficiency-choice'),
    category: z.literal('armor'),
    ...choiceBase,
    from: list(armorEnum).nullable(),
  }),
  z.strictObject({
    type: z.literal('proficiency-choice'),
    category: z.literal('weapon'),
    ...choiceBase,
    from: list(weaponEnum).nullable(),
  }),
  z.strictObject({
    type: z.literal('proficiency-choice'),
    category: z.literal('tool'),
    ...choiceBase,
    from: list(toolEnum).nullable(),
  }),
  z.strictObject({
    type: z.literal('proficiency-choice'),
    category: z.literal('skill'),
    ...choiceBase,
    from: list(skillEnum).nullable(),
  }),
  z.strictObject({
    type: z.literal('proficiency-choice'),
    category: z.literal('language'),
    ...choiceBase,
    from: list(languageEnum).nullable(),
  }),
  z.strictObject({
    type: z.literal('proficiency-choice'),
    category: z.literal('saving-throw'),
    ...choiceBase,
    from: list(abilityEnum).nullable(),
  }),
]);

const levelKeyedClass = { classId: classEnum };
const resourcePoolMaxSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('class-level'), ...levelKeyedClass }),
  z.strictObject({ mode: z.literal('fixed'), value: z.number().int().min(0).max(100) }),
  z.strictObject({
    mode: z.literal('level-steps'),
    ...levelKeyedClass,
    steps: z
      .array(z.strictObject({ minLevel: classLevel, value: z.number().int().min(0).max(100) }))
      .min(1)
      .max(RULE_LIMITS.classLevels),
  }),
  z.strictObject({ mode: z.literal('proficiency-bonus'), ...levelKeyedClass }),
  z.strictObject({
    mode: z.literal('class-level-plus'),
    ...levelKeyedClass,
    offset: z.number().int().min(-20).max(20),
  }),
]);

const resourcePoolRegenSchema = z.union([
  z.literal('short-rest'),
  z.literal('long-rest'),
  z.strictObject({ mode: z.literal('compound'), shortRestAmount: z.number().int().min(1).max(20) }),
]);

// Recursive (feature-choice options carry grants): typed loosely here, the result is narrowed once in `toGrants`.
// eslint-disable-next-line prefer-const -- assigned below, referenced lazily by feature-choice
let grantSchemaRef: z.ZodType;

const featureChoiceOptionSchema = z.strictObject({
  optionId: refIdSchema,
  featureId: refIdSchema,
  grants: z.array(z.lazy(() => grantSchemaRef)).max(RULE_LIMITS.grantsMax),
  /** `feature-picks` only. */
  minClassLevel: classLevel.optional(),
});

export const GRANT_SCHEMAS = {
  'ability-bonus': z.strictObject({
    type: z.literal('ability-bonus'),
    ability: abilityEnum,
    bonus: z.number().int().min(-10).max(10),
  }),
  'ability-choice': z.strictObject({
    type: z.literal('ability-choice'),
    key: choiceKeySchema,
    count: z.number().int().min(1).max(6),
    bonus: z.number().int().min(1).max(10),
    from: list(abilityEnum).nullable(),
  }),
  proficiency: proficiencyGrantSchema,
  'proficiency-choice': proficiencyChoiceGrantSchema,
  'skill-expertise': z.strictObject({ type: z.literal('skill-expertise'), skill: skillEnum }),
  'expertise-choice': z.strictObject({
    type: z.literal('expertise-choice'),
    key: choiceKeySchema,
    count,
    from: list(skillEnum).nullable(),
    fromTools: list(toolEnum),
  }),
  feature: z.strictObject({ type: z.literal('feature'), feature: featureDefSchema }),
  speed: z.strictObject({
    type: z.literal('speed'),
    mode: z.enum(SPEED_MODE_VOCAB),
    value: z.union([z.number().int().min(0).max(240), z.literal('walk-equivalent')]),
    condition: z.literal('not-enclosed').optional(),
  }),
  'hit-die': z.strictObject({
    type: z.literal('hit-die'),
    die: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  }),
  'hp-bonus': z.strictObject({ type: z.literal('hp-bonus'), perLevel: z.number().int().min(-5).max(10) }),
  resistance: z.strictObject({ type: z.literal('resistance'), damageType: damageEnum }),
  'armor-class': z.strictObject({
    type: z.literal('armor-class'),
    calculation: z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('armored') }),
      z.strictObject({ mode: z.literal('unarmored'), formula: z.enum(UNARMORED_FORMULA_VOCAB) }),
      z.strictObject({ mode: z.literal('natural'), baseAc: z.number().int().min(0).max(30) }),
    ]),
  }),
  'ac-bonus': z.strictObject({ type: z.literal('ac-bonus'), bonus: z.number().int().min(-10).max(10) }),
  spellcasting: z.strictObject({
    type: z.literal('spellcasting'),
    ability: abilityEnum,
    source: z.enum(['class', 'species', 'feat']),
    prepared: z.strictObject({ levelDivisor: z.union([z.literal(1), z.literal(2)]) }).optional(),
  }),
  spell: z.strictObject({
    type: z.literal('spell'),
    spellId: refIdSchema,
    alwaysPrepared: z.boolean(),
    minClassLevel: classLevel.optional(),
  }),
  asi: z.strictObject({
    type: z.literal('asi'),
    key: choiceKeySchema,
    points: z.number().int().min(1).max(4),
    from: list(abilityEnum).nullable(),
  }),
  subclass: z.strictObject({ type: z.literal('subclass'), classId: classEnum, key: choiceKeySchema }),
  'ability-check-bonus': z.strictObject({
    type: z.literal('ability-check-bonus'),
    abilities: z.array(abilityEnum).min(1).max(6),
    value: z.literal('half-proficiency'),
    onlyWhenNotProficient: z.boolean(),
    featureId: refIdSchema,
  }),
  'fighting-style-choice': z.strictObject({
    type: z.literal('fighting-style-choice'),
    key: choiceKeySchema,
    count,
    from: z.array(z.enum(FIGHTING_STYLE_VOCAB)).min(1).max(RULE_LIMITS.listMax),
  }),
  'weapon-mastery-choice': z.strictObject({ type: z.literal('weapon-mastery-choice'), key: choiceKeySchema, count }),
  'damage-choice': z.strictObject({
    type: z.literal('damage-choice'),
    key: choiceKeySchema,
    count,
    from: z.array(damageEnum).min(1).max(DAMAGE_TYPE_VOCAB.length),
    featureIdPrefix: refIdSchema,
  }),
  equipment: z.strictObject({
    type: z.literal('equipment'),
    itemId: refIdSchema,
    quantity: z.number().int().min(1).max(1000),
  }),
  'bundle-choice': z.strictObject({
    type: z.literal('bundle-choice'),
    key: choiceKeySchema,
    category: z.enum(BUNDLE_CATEGORY_VOCAB),
    bundleIds: z.array(refIdSchema).min(1).max(RULE_LIMITS.listMax),
  }),
  'lineage-choice': z.strictObject({
    type: z.literal('lineage-choice'),
    key: choiceKeySchema,
    speciesId: entryIdSchema,
    from: z.array(refIdSchema).min(1).max(RULE_LIMITS.lineagesMax),
  }),
  'feat-choice': z.strictObject({
    type: z.literal('feat-choice'),
    key: choiceKeySchema,
    from: list(entryIdSchema).nullable(),
    category: z.enum(FEAT_CATEGORY_VOCAB),
  }),
  'feature-choice': z.strictObject({
    type: z.literal('feature-choice'),
    key: choiceKeySchema,
    options: z.array(featureChoiceOptionSchema).min(1).max(RULE_LIMITS.featureChoiceOptionsMax),
  }),
  feat: z.strictObject({ type: z.literal('feat'), featId: entryIdSchema }),
  'resource-pool': z.strictObject({
    type: z.literal('resource-pool'),
    poolId: refIdSchema,
    max: resourcePoolMaxSchema,
    regen: resourcePoolRegenSchema,
    dieSizeSteps: z
      .array(
        z.strictObject({
          minLevel: classLevel,
          dieSize: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
        })
      )
      .min(1)
      .max(RULE_LIMITS.classLevels)
      .optional(),
  }),
  'spell-choice': z.strictObject({
    type: z.literal('spell-choice'),
    key: choiceKeySchema,
    count,
    spellList: classEnum,
    spellLevel: z.number().int().min(0).max(9),
    maxSpellLevel: z.number().int().min(1).max(9).optional(),
  }),
  'spell-slots': z.strictObject({
    type: z.literal('spell-slots'),
    table: z
      .array(z.array(z.number().int().min(0).max(9)).max(9))
      .min(1)
      .max(RULE_LIMITS.classLevels),
  }),
  'pact-magic': z.strictObject({
    type: z.literal('pact-magic'),
    table: z
      .array(
        z.strictObject({
          count: z.number().int().min(0).max(9),
          slotLevel: z.number().int().min(0).max(9),
        })
      )
      .min(1)
      .max(RULE_LIMITS.classLevels),
  }),
  'spell-list-extension': z.strictObject({
    type: z.literal('spell-list-extension'),
    spellList: classEnum,
    spellIds: z.array(refIdSchema).min(1).max(RULE_LIMITS.listMax),
  }),
  'feature-picks': z.strictObject({
    type: z.literal('feature-picks'),
    key: choiceKeySchema,
    poolId: refIdSchema,
    count,
    options: z.array(featureChoiceOptionSchema).min(1).max(RULE_LIMITS.featurePicksOptionsMax).optional(),
  }),
} as const;

/** The grant `type`s a rule entry may use: exactly the 33 variants of `Grant`. */
export type GrantType = keyof typeof GRANT_SCHEMAS;
// Compile-time: the schema map and the `Grant` union list the same discriminants.
type SchemaMissing = Exclude<Grant['type'], GrantType>;
type SchemaExtra = Exclude<GrantType, Grant['type']>;
const GRANT_TYPES_MATCH: [SchemaMissing, SchemaExtra] extends [never, never] ? true : false = true;
void GRANT_TYPES_MATCH;

export const GRANT_TYPES = Object.keys(GRANT_SCHEMAS) as GrantType[];

export const grantSchema = z.discriminatedUnion('type', [
  GRANT_SCHEMAS['ability-bonus'],
  GRANT_SCHEMAS['ability-choice'],
  GRANT_SCHEMAS.proficiency,
  GRANT_SCHEMAS['proficiency-choice'],
  GRANT_SCHEMAS['skill-expertise'],
  GRANT_SCHEMAS['expertise-choice'],
  GRANT_SCHEMAS.feature,
  GRANT_SCHEMAS.speed,
  GRANT_SCHEMAS['hit-die'],
  GRANT_SCHEMAS['hp-bonus'],
  GRANT_SCHEMAS.resistance,
  GRANT_SCHEMAS['armor-class'],
  GRANT_SCHEMAS['ac-bonus'],
  GRANT_SCHEMAS.spellcasting,
  GRANT_SCHEMAS.spell,
  GRANT_SCHEMAS.asi,
  GRANT_SCHEMAS.subclass,
  GRANT_SCHEMAS['ability-check-bonus'],
  GRANT_SCHEMAS['fighting-style-choice'],
  GRANT_SCHEMAS['weapon-mastery-choice'],
  GRANT_SCHEMAS['damage-choice'],
  GRANT_SCHEMAS.equipment,
  GRANT_SCHEMAS['bundle-choice'],
  GRANT_SCHEMAS['lineage-choice'],
  GRANT_SCHEMAS['feat-choice'],
  GRANT_SCHEMAS['feature-choice'],
  GRANT_SCHEMAS.feat,
  GRANT_SCHEMAS['resource-pool'],
  GRANT_SCHEMAS['spell-choice'],
  GRANT_SCHEMAS['spell-slots'],
  GRANT_SCHEMAS['pact-magic'],
  GRANT_SCHEMAS['spell-list-extension'],
  GRANT_SCHEMAS['feature-picks'],
]);
grantSchemaRef = grantSchema;

const grantsSchema = z.array(grantSchema).max(RULE_LIMITS.grantsMax);

/**
 * A validated grant list as the engine type. The schemas above check every closed vocabulary and every bound; the
 * only differences with `Grant` are TypeScript-level (readonly tuples, `ChoiceKey` template type), so this is the
 * single place where parsed data is narrowed to `Grant`.
 */
export function toGrants(parsed: readonly z.infer<typeof grantSchema>[]): readonly Grant[] {
  return parsed as unknown as readonly Grant[];
}

// ---------------------------------------------------------------------------
// Bodies, one per kind
// ---------------------------------------------------------------------------

const featPrerequisiteSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('ability-minimum'),
    ability: abilityEnum,
    minimum: z.number().int().min(1).max(30),
  }),
  z.strictObject({
    type: z.literal('proficiency'),
    category: z.enum(['armor', 'weapon']),
    id: z.union([armorEnum, weaponEnum]),
  }),
  z.strictObject({ type: z.literal('spellcasting') }),
  z.strictObject({ type: z.literal('class-feature'), featureId: refIdSchema }),
  z.strictObject({ type: z.literal('level-minimum'), level: classLevel }),
]);

export const BODY_SCHEMAS = {
  species: z.strictObject({
    size: z.enum(SIZE_VOCAB),
    speed: z.number().int().min(0).max(120),
    grants: grantsSchema,
    lineages: z
      .array(z.strictObject({ id: refIdSchema, name: localizedNameSchema, grants: grantsSchema }))
      .max(RULE_LIMITS.lineagesMax)
      .optional(),
  }),
  subspecies: z.strictObject({ parent: entryIdSchema, grants: grantsSchema }),
  class: z.strictObject({
    primaryAbility: abilityEnum,
    levels: z
      .array(z.strictObject({ grants: grantsSchema }))
      .min(1)
      .max(RULE_LIMITS.classLevels),
  }),
  subclass: z.strictObject({
    class: classEnum,
    chosenAtClassLevel: classLevel,
    features: z.array(z.strictObject({ classLevel, grants: grantsSchema })).max(RULE_LIMITS.subclassFeaturesMax),
  }),
  background: z.strictObject({ grants: grantsSchema }),
  feat: z.strictObject({
    category: z.enum(FEAT_CATEGORY_VOCAB),
    prerequisites: z.array(featPrerequisiteSchema).max(10),
    grants: grantsSchema,
    repeatable: z.boolean().optional(),
  }),
  spell: z.strictObject({
    level: z.number().int().min(0).max(9),
    school: z.enum(SPELL_SCHOOL_VOCAB),
    ritual: z.boolean(),
    concentration: z.boolean(),
    castingTime: safeText(RULE_LIMITS.shortTextMax),
    range: safeText(RULE_LIMITS.shortTextMax),
    duration: safeText(RULE_LIMITS.shortTextMax),
    components: z.strictObject({
      verbal: z.boolean(),
      somatic: z.boolean(),
      material: z.union([safeText(RULE_LIMITS.materialMax), z.literal(false)]),
    }),
    classes: z.array(classEnum).min(1).max(CLASS_VOCAB.length),
  }),
  item: z.strictObject({ grants: grantsSchema, requiresAttunement: z.boolean() }),
} as const satisfies Record<RuleEntryKind, z.ZodType>;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

const envelope = {
  schema: z.literal(RULE_LIMITS.schemaVersion),
  id: entryIdSchema,
  name: localizedNameSchema,
  source: z
    .strictObject({
      book: z.string().min(2).max(RULE_LIMITS.sourceBookMax).regex(KEBAB, 'book ids are kebab-case, e.g. "phb-2014"'),
      page: z.number().int().min(1).max(RULE_LIMITS.sourcePageMax).optional(),
    })
    .optional(),
  summary: localizedSummarySchema.optional(),
  needsReview: z.array(safeText(RULE_LIMITS.needsReviewNoteMax)).max(RULE_LIMITS.needsReviewMax).optional(),
};

function entrySchemaFor<K extends RuleEntryKind>(kind: K) {
  return z.strictObject({ ...envelope, kind: z.literal(kind), body: BODY_SCHEMAS[kind] });
}

export const ENTRY_SCHEMAS = {
  species: entrySchemaFor('species'),
  subspecies: entrySchemaFor('subspecies'),
  // A class entry overrides a built-in class: its id must be a known class id (see `CLASS_VOCAB`).
  class: entrySchemaFor('class').extend({ id: classEnum }),
  subclass: entrySchemaFor('subclass'),
  background: entrySchemaFor('background'),
  feat: entrySchemaFor('feat'),
  spell: entrySchemaFor('spell'),
  item: entrySchemaFor('item'),
} as const;

export const ruleEntrySchema = z.discriminatedUnion('kind', [
  ENTRY_SCHEMAS.species,
  ENTRY_SCHEMAS.subspecies,
  ENTRY_SCHEMAS.class,
  ENTRY_SCHEMAS.subclass,
  ENTRY_SCHEMAS.background,
  ENTRY_SCHEMAS.feat,
  ENTRY_SCHEMAS.spell,
  ENTRY_SCHEMAS.item,
]);

export type RuleEntry = z.infer<typeof ruleEntrySchema>;
export type RuleEntryOf<K extends RuleEntryKind> = Extract<RuleEntry, { kind: K }>;
export type LocalizedName = z.infer<typeof localizedNameSchema>;
export type LocalizedSummary = z.infer<typeof localizedSummarySchema>;

export interface RuleIssue {
  /** Dotted path of the faulty field, e.g. `body.grants.0.ability`. */
  readonly path: string;
  readonly message: string;
}

export type RuleEntryParseResult =
  | { readonly ok: true; readonly entry: RuleEntry }
  | { readonly ok: false; readonly issues: readonly RuleIssue[] };

/** Nesting depth of a JSON value; stops counting past the limit. */
function depthOf(value: unknown, depth: number): number {
  if (depth > RULE_LIMITS.depthMax || value === null || typeof value !== 'object') return depth;
  let max = depth + 1;
  for (const child of Object.values(value as Record<string, unknown>)) {
    max = Math.max(max, depthOf(child, depth + 1));
    if (max > RULE_LIMITS.depthMax) break;
  }
  return max;
}

/**
 * Validates one entry: size bound, then the strict schema. Used before writing (app, MCP) and again on every read.
 */
export function parseRuleEntry(content: unknown): RuleEntryParseResult {
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(content) ?? '').length;
  } catch {
    return { ok: false, issues: [{ path: '', message: 'content is not serializable JSON' }] };
  }
  if (depthOf(content, 0) > RULE_LIMITS.depthMax) {
    return {
      ok: false,
      issues: [{ path: '', message: `content is nested deeper than ${RULE_LIMITS.depthMax} levels` }],
    };
  }
  if (size > RULE_LIMITS.contentBytesMax) {
    return {
      ok: false,
      issues: [{ path: '', message: `content is ${size} bytes, the limit is ${RULE_LIMITS.contentBytesMax}` }],
    };
  }
  const result = ruleEntrySchema.safeParse(content);
  if (result.success) return { ok: true, entry: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  };
}
