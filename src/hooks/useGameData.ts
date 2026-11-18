import { useMemo } from 'react';
import { useCampaign } from '@/hooks/useCampaigns';
import { useActiveRuleSet } from '@/hooks/useRuleSet';
import type { SourceBookId } from '@/lib/source-books';
import { ruleKey } from '@/lib/rules/types';
import type { RuleEntryKind } from '@/lib/rules/schemas';
import type { BackgroundRule, ClassRule, FeatRule, SpeciesRule, SubclassRule } from '@/lib/rules/types';

export interface GameData {
  readonly species: readonly SpeciesRule[];
  readonly classes: readonly ClassRule[];
  readonly backgrounds: readonly BackgroundRule[];
  readonly feats: readonly FeatRule[];
  readonly subclasses: Readonly<Partial<Record<string, SubclassRule>>>;
  readonly allowedSourceBooks: readonly SourceBookId[];
}

const DEFAULT_ALLOWED: readonly SourceBookId[] = ['phb-2024'];

/**
 * The species, classes, backgrounds, feats and subclasses a campaign offers, from the active rule set (story 9.3).
 * Built-in entities are filtered by the campaign's allowed source books; entries of the SRD layer and of the DM's
 * library are always offered (the DM put them there on purpose), unverified and invalid ones never (they are not in
 * the rule set's maps).
 */
export function useGameData(campaignSlug: string | undefined): GameData {
  const { data: campaign } = useCampaign(campaignSlug);
  const rules = useActiveRuleSet();
  // Use the campaign's source book list, or fall back to the default.
  // campaign?.allowed_source_books is a new array ref on every query result, so we
  // join it into a string key for memoization stability.
  const allowedSourceBooks = campaign?.allowed_source_books ?? DEFAULT_ALLOWED;
  const allowedKey = allowedSourceBooks.join(',');

  return useMemo<GameData>((): GameData => {
    // Re-derive `allowed` inside the memo so we have a typed readonly array.
    const allowed: readonly SourceBookId[] = allowedKey ? (allowedKey.split(',') as SourceBookId[]) : DEFAULT_ALLOWED;
    const offered = (kind: RuleEntryKind, id: string, sourceBook: string | undefined): boolean =>
      rules.entries.has(ruleKey(kind, id)) || (allowed as readonly string[]).includes(sourceBook ?? 'phb-2024');
    const pick = <T extends { readonly id: string; readonly sourceBook?: string }>(
      kind: RuleEntryKind,
      map: ReadonlyMap<string, T>
    ): readonly T[] => [...map.values()].filter((item) => offered(kind, item.id, item.sourceBook));

    const subclasses: Partial<Record<string, SubclassRule>> = {};
    for (const [id, subclass] of rules.subclasses) {
      if (offered('subclass', id, subclass.sourceBook)) subclasses[id] = subclass;
    }

    return {
      species: pick('species', rules.species),
      classes: pick('class', rules.classes),
      backgrounds: pick('background', rules.backgrounds),
      feats: pick('feat', rules.feats),
      subclasses,
      allowedSourceBooks: allowed,
    };
    // allowedKey is a stable string representation of the source book list
  }, [allowedKey, rules]);
}
