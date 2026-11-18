import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuleEntries } from '@/hooks/useRuleEntries';
import type { RulesetId } from '@/lib/ruleset';
import { buildRuleSet, builtin2024RuleSet } from '@/lib/rules/ruleset';
import {
  localizedName,
  ownEntry,
  ruleAwareT,
  ruleDisplayName,
  ruleSummary,
  type NamedRuleKind,
} from '@/lib/rules/display';
import type { RuleSet } from '@/lib/rules/types';

export type RuleSetStatus = 'loading' | 'error' | 'ready';

export interface RuleSetState {
  /** The rules to use. While loading or after an error: the built-in layers alone (never resolve with them blindly). */
  readonly rules: RuleSet;
  readonly status: RuleSetStatus;
  readonly retry: () => void;
}

const NO_RETRY = () => undefined;

/**
 * The rules of one edition: built-in layers plus the DM library, every library row validated again (story 9.3).
 * `status` says whether the library is loaded: a screen must not resolve a character with `loading` or `error` rules,
 * they lack the library (`RuleSetProvider` waits for `ready`).
 */
export function useRuleSet(ruleset: RulesetId | undefined): RuleSetState {
  const { data: rows, isError, isPending, refetch } = useRuleEntries(ruleset);
  const status: RuleSetStatus = !ruleset ? 'ready' : isError ? 'error' : isPending ? 'loading' : 'ready';
  const rules = useMemo(() => {
    if (!ruleset || (ruleset === '2024' && (!rows || rows.length === 0))) return builtin2024RuleSet();
    return buildRuleSet(ruleset, rows ?? []);
  }, [ruleset, rows]);
  const retry = useCallback(() => void refetch(), [refetch]);
  return { rules, status, retry: ruleset ? retry : NO_RETRY };
}

/** No provider: the built-in 2024 rules, so a component rendered outside one (tests, other screens) is unchanged. */
const RuleSetContext = createContext<RuleSet | null>(null);

interface RuleSetProviderProps {
  /** Edition of the current campaign. */
  readonly ruleset: RulesetId | undefined;
  /** True while the campaign itself loads: the provider waits for it too. */
  readonly campaignLoading?: boolean;
  readonly children: ReactNode;
}

/**
 * Hands the campaign's rule set to the screens below. It renders them only once the campaign AND its rules library
 * are loaded (a skeleton meanwhile), and shows an error with a retry button when the library can not be read: a sheet
 * is never computed without the DM's entries it may depend on.
 */
export function RuleSetProvider({ ruleset, campaignLoading = false, children }: RuleSetProviderProps) {
  const { t } = useTranslation('common');
  const { rules, status, retry } = useRuleSet(ruleset);
  if (campaignLoading || status === 'loading') {
    return (
      <div className="space-y-4 p-4" role="status" aria-label={t('ruleSet.loading')}>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="m-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive" role="alert">
        <p>{t('ruleSet.loadFailed')}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          {t('buttons.tryAgain')}
        </Button>
      </div>
    );
  }
  return <RuleSetContext.Provider value={rules}>{children}</RuleSetContext.Provider>;
}

/** The rule set of the enclosing `RuleSetProvider` (built-in 2024 outside one). */
export function useActiveRuleSet(): RuleSet {
  return useContext(RuleSetContext) ?? builtin2024RuleSet();
}

function useLanguage(): string {
  const { i18n } = useTranslation('gamedata');
  return i18n?.language ?? 'en';
}

/**
 * Display name of a species, class, subclass, background, feat, spell or item of the active rule set: the entry's own
 * name in the interface language when it has one, else its `gamedata` translation.
 */
export function useRuleName(): (kind: NamedRuleKind, id: string) => string {
  const rules = useActiveRuleSet();
  const { t } = useTranslation('gamedata');
  const language = useLanguage();
  return useCallback(
    (kind: NamedRuleKind, id: string) =>
      ruleDisplayName(rules, kind, id, language, (key) =>
        // Keys are built by `gamedataKey` from narrowed built-in ids only.
        (t as unknown as (k: string) => string)(key)
      ),
    [rules, language, t]
  );
}

/**
 * Own name of an SRD or library entry in the interface language, or undefined for a built-in entity (the caller keeps
 * its existing `gamedata` translation).
 */
export function useOwnRuleName(): (kind: NamedRuleKind, id: string) => string | undefined {
  const rules = useActiveRuleSet();
  const language = useLanguage();
  return useCallback(
    (kind: NamedRuleKind, id: string) => {
      const info = ownEntry(rules, kind, id);
      return info ? localizedName(info.name, language) : undefined;
    },
    [rules, language]
  );
}

/** Own summary of an SRD or library entry in the interface language, or undefined (built-in: use `gamedata`). */
export function useRuleSummary(): (kind: NamedRuleKind, id: string) => string | undefined {
  const rules = useActiveRuleSet();
  const language = useLanguage();
  return useCallback((kind: NamedRuleKind, id: string) => ruleSummary(rules, kind, id, language), [rules, language]);
}

/**
 * The `gamedata` translator, aware of the rule set: entity keys answer with an entry's own text (see `ruleAwareT`).
 * Use it wherever a species, class, subclass, background, feat or spell id is turned into a name. `rules` overrides
 * the active rule set (screens outside a `RuleSetProvider`).
 */
export function useRuleAwareT(rules?: RuleSet): TFunction<'gamedata'> {
  const active = useActiveRuleSet();
  const { t } = useTranslation('gamedata');
  const language = useLanguage();
  const effective = rules ?? active;
  return useMemo(() => ruleAwareT(effective, language, t), [effective, language, t]);
}
