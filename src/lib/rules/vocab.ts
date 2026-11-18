/**
 * Closed mechanical vocabularies a rule entry is validated against (story 9.3, docs/rules-as-data.md §3.4).
 *
 * Entity ids (species, subclasses, backgrounds, feats, spells, items) are open kebab-case strings. The mechanical
 * vocabulary below stays in code: a rule that needs a new ability, skill, damage type, size, proficiency, spell school
 * or fighting style is a code change, not a data entry. Every list is derived from the engine's own constants, so the
 * schemas can never drift from what the resolver understands.
 */
import {
  ABILITY_KEYS,
  DND_ARMOR_PROFICIENCIES,
  DND_CLASSES,
  DND_LANGUAGES,
  DND_SIZES,
  DND_SKILLS,
  DND_TOOL_PROFICIENCIES,
  DND_WEAPON_PROFICIENCIES,
  FIGHTING_STYLE_IDS,
  type AbilityKey,
  type ArmorProficiencyId,
  type ClassId,
  type FightingStyleId,
  type LanguageId,
  type SizeId,
  type SkillId,
  type ToolProficiencyId,
  type WeaponProficiencyId,
} from '@/lib/dnd-helpers';
import { DAMAGE_TYPES, type DamageTypeId, type SpeedMode, type UnarmoredFormula } from '@/types/grants';
import { BUNDLE_CATEGORIES, type BundleCategory } from '@/types/items';
import { FEAT_CATEGORIES, type FeatCategory } from '@/types/sources';
import type { SpellSchool } from '@/types/spells';

type NonEmpty<T> = readonly [T, ...T[]];

function nonEmpty<T>(values: readonly T[]): NonEmpty<T> {
  if (values.length === 0) throw new Error('rules vocabulary: empty list');
  return values as NonEmpty<T>;
}

export const ABILITY_VOCAB: NonEmpty<AbilityKey> = nonEmpty(ABILITY_KEYS);
export const SKILL_VOCAB: NonEmpty<SkillId> = nonEmpty(DND_SKILLS.map((s) => s.id));
export const TOOL_VOCAB: NonEmpty<ToolProficiencyId> = nonEmpty(DND_TOOL_PROFICIENCIES);
export const LANGUAGE_VOCAB: NonEmpty<LanguageId> = nonEmpty(DND_LANGUAGES);
export const ARMOR_VOCAB: NonEmpty<ArmorProficiencyId> = nonEmpty(DND_ARMOR_PROFICIENCIES);
export const WEAPON_VOCAB: NonEmpty<WeaponProficiencyId> = nonEmpty(DND_WEAPON_PROFICIENCIES);
export const DAMAGE_TYPE_VOCAB: NonEmpty<DamageTypeId> = nonEmpty(DAMAGE_TYPES);
export const SIZE_VOCAB: NonEmpty<SizeId> = nonEmpty(DND_SIZES);
export const FIGHTING_STYLE_VOCAB: NonEmpty<FightingStyleId> = nonEmpty(FIGHTING_STYLE_IDS);
export const BUNDLE_CATEGORY_VOCAB: NonEmpty<BundleCategory> = nonEmpty(BUNDLE_CATEGORIES);
export const FEAT_CATEGORY_VOCAB: NonEmpty<FeatCategory> = nonEmpty(FEAT_CATEGORIES);

/**
 * Class ids stay closed in story 9.3: spell lists, spell slot tables, class icons and resource pools are keyed on
 * `ClassId` across the engine. A DM entry of kind `class` may only override a built-in class (decision recorded in
 * docs/rules-as-data.md §9).
 */
export const CLASS_VOCAB: NonEmpty<ClassId> = nonEmpty(DND_CLASSES.map((c) => c.id));

const SPELL_SCHOOL_LIST = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const satisfies readonly SpellSchool[];
// Compile-time exhaustiveness: a school added to `SpellSchool` without being listed here fails typecheck.
type MissingSchool = Exclude<SpellSchool, (typeof SPELL_SCHOOL_LIST)[number]>;
const SCHOOLS_COMPLETE: MissingSchool extends never ? true : false = true;
void SCHOOLS_COMPLETE;
export const SPELL_SCHOOL_VOCAB: NonEmpty<SpellSchool> = SPELL_SCHOOL_LIST;

const SPEED_MODE_LIST = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const satisfies readonly SpeedMode[];
type MissingSpeed = Exclude<SpeedMode, (typeof SPEED_MODE_LIST)[number]>;
const SPEEDS_COMPLETE: MissingSpeed extends never ? true : false = true;
void SPEEDS_COMPLETE;
export const SPEED_MODE_VOCAB: NonEmpty<SpeedMode> = SPEED_MODE_LIST;

const UNARMORED_LIST = ['barbarian', 'monk', 'dance'] as const satisfies readonly UnarmoredFormula[];
type MissingUnarmored = Exclude<UnarmoredFormula, (typeof UNARMORED_LIST)[number]>;
const UNARMORED_COMPLETE: MissingUnarmored extends never ? true : false = true;
void UNARMORED_COMPLETE;
export const UNARMORED_FORMULA_VOCAB: NonEmpty<UnarmoredFormula> = UNARMORED_LIST;
