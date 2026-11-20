import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RulesetId } from '@/lib/ruleset';
import type { RuleEntryRow } from '@/lib/rules/ruleset';

const RULE_ENTRY_COLS = 'ruleset, kind, id, content, revision';

/**
 * The DM library rows of one rules edition (story 9.3). RLS returns the rows of the editions of the reader's campaigns
 * (all of them for the DM). `content` is untrusted: `buildRuleSet` validates every row again.
 */
export function useRuleEntries(ruleset: RulesetId | undefined) {
  return useQuery({
    queryKey: ['rule-entries', ruleset],
    queryFn: async (): Promise<RuleEntryRow[]> => {
      const { data, error } = await supabase
        .from('rule_entries')
        .select(RULE_ENTRY_COLS)
        .eq('ruleset', ruleset!)
        .order('kind')
        .order('id');
      if (error) throw error;
      // Shape guard only: the content of each row is validated by `buildRuleSet`.
      return (Array.isArray(data) ? (data as unknown[]) : []).filter(
        (row): row is RuleEntryRow =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as RuleEntryRow).kind === 'string' &&
          typeof (row as RuleEntryRow).id === 'string' &&
          typeof (row as RuleEntryRow).ruleset === 'string'
      );
    },
    enabled: !!ruleset,
    // Short: a rule the DM changes through the MCP must reach the screens quickly.
    staleTime: 30 * 1000,
  });
}
