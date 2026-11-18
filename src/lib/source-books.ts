import type { RulesetId } from '@/lib/ruleset';

/**
 * Books a campaign can allow (`campaigns.allowed_source_books`, default `{phb-2024}`, unchanged by story 9.3).
 * The 2014 books are the ones the DM confirmed for the 2014 table (docs/rules-as-data.md §8). Their content is never in
 * this repository: the DM enters it in the rules library, each entry naming its book in `source.book`.
 */
export const SOURCE_BOOK_IDS = ['phb-2024', 'phb-2014', 'xgte', 'tcoe'] as const;
export type SourceBookId = (typeof SOURCE_BOOK_IDS)[number];

export interface SourceBookDef {
  readonly id: SourceBookId;
  readonly abbreviation: string;
  /** Edition the book belongs to. */
  readonly ruleset?: RulesetId;
}

export const SOURCE_BOOKS: readonly SourceBookDef[] = [
  { id: 'phb-2024', abbreviation: 'PHB 2024', ruleset: '2024' },
  { id: 'phb-2014', abbreviation: 'PHB 2014', ruleset: '2014' },
  { id: 'xgte', abbreviation: 'XGtE', ruleset: '2014' },
  { id: 'tcoe', abbreviation: 'TCoE', ruleset: '2014' },
] as const;

/** The books of an edition (a book without an edition is listed for every edition). The campaign screen lists those only. */
export function booksOfEdition(books: readonly SourceBookDef[], ruleset: RulesetId): readonly SourceBookDef[] {
  return books.filter((book) => (book.ruleset ?? ruleset) === ruleset);
}

export function filterBySourceBooks<T extends { readonly sourceBook?: SourceBookId }>(
  items: readonly T[],
  allowed: readonly SourceBookId[]
): readonly T[] {
  return items.filter((item) => allowed.includes(item.sourceBook ?? 'phb-2024'));
}
