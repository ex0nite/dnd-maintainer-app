/**
 * The `RuleSet` (story 9.3, docs/rules-as-data.md §3.1): every rule the engine reads for one edition, built from
 * layers (built-in code, built-in SRD JSON, DM library), last layer wins.
 *
 * Entity ids are open strings here (the engine boundary). The values of the built-in layer are the very objects of
 * `src/lib/sources/*` (same references), so code that compared them keeps working; entries from the other layers have
 * the same shapes with wider id types.
 */
import type { ClassId, SizeId } from '@/lib/dnd-helpers';
import type { RulesetId } from '@/lib/ruleset';
import type { LocalizedName, LocalizedSummary, RuleEntryKind, RuleIssue } from '@/lib/rules/schemas';
import type { Grant } from '@/types/grants';
import type { ClassSource, FeatSource, ItemSource, SubclassSource } from '@/types/sources';
import type { SpellDef } from '@/types/spells';

export interface SpeciesRule {
  readonly id: string;
  readonly defaultSize: SizeId;
  readonly defaultSpeed: number;
  readonly grants: readonly Grant[];
  readonly sourceBook?: string;
}

export interface SubspeciesRule {
  readonly id: string;
  /** Parent species id. Consumed by the 2014 engine (story 9.5); stored and validated from 9.3. */
  readonly parent: string;
  readonly grants: readonly Grant[];
}

export type ClassRule = ClassSource;

export type SubclassRule = SubclassSource;

export interface BackgroundRule {
  readonly id: string;
  readonly grants: readonly Grant[];
  readonly sourceBook?: string;
}

export type FeatRule = Omit<FeatSource, 'id' | 'sourceBook'> & { readonly id: string; readonly sourceBook?: string };

export type ItemRule = Omit<ItemSource, 'sourceBook'> & { readonly sourceBook?: string };

export type SpellRule = Omit<SpellDef, 'sourceBook'> & { readonly sourceBook?: string };

/** Lineage id → grants, per species (e.g. elf → { drow: [...], 'high-elf': [...] }). */
export type LineageGrants = Readonly<Partial<Record<string, readonly Grant[]>>>;

/** Where an effective entry comes from. */
export type RuleLayer = 'builtin-2024' | 'srd-2014' | 'library';

/** `${kind}:${id}` */
export type RuleKey = `${RuleEntryKind}:${string}`;

export function ruleKey(kind: RuleEntryKind, id: string): RuleKey {
  return `${kind}:${id}`;
}

/**
 * Description of an entry that does not come from the built-in code layer: its own names (shown instead of the
 * `gamedata` key), its book, and whether it replaces a lower layer.
 */
export interface RuleEntryInfo {
  readonly kind: RuleEntryKind;
  readonly id: string;
  readonly layer: Exclude<RuleLayer, 'builtin-2024'>;
  /** True when an entry with the same kind and id exists in a lower layer and this one replaces it. */
  readonly overrides: boolean;
  readonly name: LocalizedName;
  readonly summary?: LocalizedSummary;
  readonly source?: { readonly book: string; readonly page?: number };
  /** Review notes. Non-empty: the entry is stored but NOT usable until the DM clears the list. */
  readonly needsReview: readonly string[];
  readonly revision?: number;
}

/** A stored entry that failed validation on read: never resolved, reported to the DM. */
export interface InvalidRuleEntry {
  readonly kind: string;
  readonly id: string;
  readonly issues: readonly RuleIssue[];
}

export interface RuleSet {
  readonly ruleset: RulesetId;
  readonly species: ReadonlyMap<string, SpeciesRule>;
  readonly lineages: ReadonlyMap<string, LineageGrants>;
  /** Own names of the lineages of SRD and library species (built-in lineages use `gamedata`). */
  readonly lineageNames: ReadonlyMap<string, ReadonlyMap<string, LocalizedName>>;
  readonly subspecies: ReadonlyMap<string, SubspeciesRule>;
  readonly classes: ReadonlyMap<string, ClassRule>;
  readonly subclasses: ReadonlyMap<string, SubclassRule>;
  /** Class id → subclass ids, in display order (built-in order, then DM entries). */
  readonly subclassesByClass: ReadonlyMap<ClassId, readonly string[]>;
  readonly backgrounds: ReadonlyMap<string, BackgroundRule>;
  readonly feats: ReadonlyMap<string, FeatRule>;
  readonly spells: ReadonlyMap<string, SpellRule>;
  readonly items: ReadonlyMap<string, ItemRule>;
  /** Effective entries that come from the SRD or the DM library (not from the built-in code). */
  readonly entries: ReadonlyMap<RuleKey, RuleEntryInfo>;
  /** Library entries that carry `needsReview` notes: stored, shown to the DM, not usable. */
  readonly unverified: readonly RuleEntryInfo[];
  /** Library rows that failed validation on read: ignored. */
  readonly invalid: readonly InvalidRuleEntry[];
}
