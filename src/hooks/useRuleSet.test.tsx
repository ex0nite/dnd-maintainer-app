import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderHook, createWrapper, setupMockReset } from '@/test/hook-test-helpers';
import { mockQueryResult, supabase } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));

const language = vi.hoisted(() => ({ value: 'en' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; count?: number; name?: string; kind?: string }) =>
      opts?.name !== undefined ? `${opts.name} (${opts.kind})` : (opts?.defaultValue ?? key),
    i18n: { language: language.value },
  }),
}));

import { RuleSetProvider, useActiveRuleSet, useOwnRuleName, useRuleName, useRuleSet } from '@/hooks/useRuleSet';
import { useRuleEntries } from '@/hooks/useRuleEntries';
import { RulesLibraryStatus } from '@/components/RulesLibraryStatus';
import { SubclassPicker } from '@/components/character-sheet/SubclassPicker';
import { builtin2024RuleSet } from '@/lib/rules/ruleset';
import type { PendingChoice } from '@/types/resolved';
import type { ChoiceKey } from '@/types/choices';
import { CLASS_ENTRY, FEAT_ENTRY, SPECIES_ENTRY, SUBCLASS_ENTRY, row, withChange } from '@/test/rule-fixtures';

setupMockReset();

// Fails the strict schema (unknown key): must be ignored on read.
const INVALID_CONTENT = {
  ruleset: '2024',
  kind: 'feat',
  id: 'evil-feat',
  content: { ...FEAT_ENTRY, id: 'evil-feat', onload: 'x' },
  revision: 1,
};
const PENDING = withChange(SPECIES_ENTRY, (c) => {
  c.id = 'test-pending';
  c.needsReview = ['speed to confirm'];
}) as typeof SPECIES_ENTRY;

describe('useRuleEntries', () => {
  it('reads the rows of one edition', async () => {
    mockQueryResult.data = [row(SPECIES_ENTRY)];
    const { result } = renderHook(() => useRuleEntries('2024'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('rule_entries');
    expect(supabase.eq).toHaveBeenCalledWith('ruleset', '2024');
    expect(result.current.data).toHaveLength(1);
  });

  it('does not fetch without an edition', () => {
    const { result } = renderHook(() => useRuleEntries(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('drops anything that is not a row', async () => {
    mockQueryResult.data = [row(SPECIES_ENTRY), null, 'x', { kind: 'feat' }];
    const { result } = renderHook(() => useRuleEntries('2024'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useRuleSet', () => {
  it('is the built-in rule set while there is no library', () => {
    const { result } = renderHook(() => useRuleSet(undefined), { wrapper: createWrapper() });
    expect(result.current.rules).toBe(builtin2024RuleSet());
    expect(result.current.status).toBe('ready');
  });

  it('says loading until the library is read, then ready', async () => {
    mockQueryResult.data = [row(SPECIES_ENTRY)];
    const { result } = renderHook(() => useRuleSet('2024'), { wrapper: createWrapper() });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('says error when the library can not be read', async () => {
    mockQueryResult.error = { message: 'boom' };
    const { result } = renderHook(() => useRuleSet('2024'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('validates every row again: an invalid one is ignored and listed, a valid one is added', async () => {
    mockQueryResult.data = [row(SPECIES_ENTRY), INVALID_CONTENT, row(PENDING)];
    const { result } = renderHook(() => useRuleSet('2024'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.rules.species.has('test-elfkin')).toBe(true));
    const { rules } = result.current;
    expect(rules.feats.has('evil-feat')).toBe(false);
    expect(rules.invalid.map((e) => e.id)).toEqual(['evil-feat']);
    expect(rules.species.has('test-pending')).toBe(false);
    expect(rules.unverified.map((e) => e.id)).toEqual(['test-pending']);
  });

  it('defaults to the built-in rules outside a provider', () => {
    const { result } = renderHook(() => useActiveRuleSet());
    expect(result.current).toBe(builtin2024RuleSet());
  });
});

describe('names from the active rule set', () => {
  afterEach(() => {
    language.value = 'en';
  });

  function providerWith(rows: unknown[]) {
    mockQueryResult.data = rows;
    const Base = createWrapper();
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <Base>
          <RuleSetProvider ruleset="2024">{children}</RuleSetProvider>
        </Base>
      );
    };
  }

  it('shows the own French name of a library entry, the gamedata key of a built-in one', async () => {
    language.value = 'fr';
    const { result } = renderHook(() => ({ name: useRuleName(), own: useOwnRuleName() }), {
      wrapper: providerWith([row(SPECIES_ENTRY)]),
    });
    await waitFor(() => expect(result.current.name('species', 'test-elfkin')).toBe('Elfelin'));
    expect(result.current.name('species', 'human')).toBe('species.human');
    expect(result.current.own('species', 'human')).toBeUndefined();
  });

  it('lists a library subclass in the subclass picker with its own name and summary', async () => {
    const choice: Extract<PendingChoice, { type: 'subclass' }> = {
      type: 'subclass',
      choiceKey: 'subclass:class:druid:0' as ChoiceKey,
      source: { origin: 'class', id: 'druid', level: 3 },
      classId: 'druid',
    };
    render(<SubclassPicker choice={choice} onDecide={vi.fn()} />, { wrapper: providerWith([row(SUBCLASS_ENTRY)]) });
    expect(await screen.findByText('Circle of Testing')).toBeInTheDocument();
    expect(screen.getByText('Druids who test everything twice.')).toBeInTheDocument();
  });
});

const SHEET = 'sheet';

describe('RuleSetProvider', () => {
  it('shows a skeleton while the library loads, then the screen', async () => {
    mockQueryResult.data = [];
    render(
      <RuleSetProvider ruleset="2024">
        <p>{SHEET}</p>
      </RuleSetProvider>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('sheet')).toBeInTheDocument();
  });

  it('waits for the campaign too', () => {
    render(
      <RuleSetProvider ruleset={undefined} campaignLoading>
        <p>{SHEET}</p>
      </RuleSetProvider>,
      { wrapper: createWrapper() }
    );
    expect(screen.queryByText('sheet')).toBeNull();
  });

  it('shows an error, and no sheet, when the library can not be read', async () => {
    mockQueryResult.error = { message: 'boom' };
    render(
      <RuleSetProvider ruleset="2024">
        <p>{SHEET}</p>
      </RuleSetProvider>,
      { wrapper: createWrapper() }
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('ruleSet.loadFailed');
    expect(screen.queryByText('sheet')).toBeNull();
  });
});

describe('RulesLibraryStatus', () => {
  it('says loading, not "0 entries", while the library loads', () => {
    mockQueryResult.data = [];
    render(<RulesLibraryStatus ruleset="2024" />, { wrapper: createWrapper() });
    expect(screen.getByText('campaign.rulesLibrary.loading')).toBeInTheDocument();
  });

  it('says so when the library can not be read', async () => {
    mockQueryResult.error = { message: 'boom' };
    render(<RulesLibraryStatus ruleset="2024" />, { wrapper: createWrapper() });
    expect(await screen.findByText('campaign.rulesLibrary.error')).toBeInTheDocument();
  });

  it('shows overrides, entries waiting for review and ignored entries to the DM', async () => {
    mockQueryResult.data = [row(CLASS_ENTRY), row(PENDING), INVALID_CONTENT];
    render(<RulesLibraryStatus ruleset="2024" />, { wrapper: createWrapper() });
    expect(await screen.findByText('Test Wizard (campaign.rulesLibrary.kinds.class)')).toBeInTheDocument();
    expect(screen.getByText('campaign.rulesLibrary.overrides')).toBeInTheDocument();
    expect(screen.getByText(/speed to confirm/)).toBeInTheDocument();
    expect(screen.getByText('campaign.rulesLibrary.invalid')).toBeInTheDocument();
  });

  it('shows plain text, never markup', async () => {
    // A row that slipped past the database guards: invalid on read, its text never rendered as HTML.
    const evil = {
      ...INVALID_CONTENT,
      content: { ...FEAT_ENTRY, id: 'evil-feat', name: { en: '<img src=x onerror=alert(1)>' } },
    };
    mockQueryResult.data = [evil];
    const { container } = render(<RulesLibraryStatus ruleset="2024" />, { wrapper: createWrapper() });
    await screen.findByText('campaign.rulesLibrary.invalid');
    expect(container.querySelector('img')).toBeNull();
  });
});
