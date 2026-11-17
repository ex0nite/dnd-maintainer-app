import { waitFor } from '@testing-library/react';
import { renderHook, createWrapper, setupMockReset } from '@/test/hook-test-helpers';
import { mockQueryResult, supabase } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));

import {
  useCreateSharedNote,
  useDeletePersonalNote,
  useDeleteSharedNote,
  usePersonalNotes,
  useSharedNotes,
  useUpdatePersonalNote,
  useUpdateSharedNote,
} from '@/hooks/useCampaignNotes';

setupMockReset();

const wrapper = createWrapper();

describe('campaign notes hooks', () => {
  it('lists the shared notes of a campaign', async () => {
    mockQueryResult.data = [{ id: 'n1', title: 'Lore' }];
    const { result } = renderHook(() => useSharedNotes('camp-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'n1', title: 'Lore' }]);
  });

  it('does not fetch without a campaign', () => {
    const { result } = renderHook(() => usePersonalNotes(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('creates a shared note without stating an author (the database fills it)', async () => {
    mockQueryResult.data = { id: 'n1' };
    const { result } = renderHook(() => useCreateSharedNote('camp-1'), { wrapper });
    result.current.mutate({ title: 'T', body: 'b', category: 'quest', pinned: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const payload = vi.mocked(supabase.insert).mock.calls[0][0];
    expect(payload).toEqual({ campaign_id: 'camp-1', title: 'T', body: 'b', category: 'quest', pinned: true });
    expect(payload).not.toHaveProperty('author_id');
  });

  it.each([
    ['shared update', () => useUpdateSharedNote('c'), { id: 'n1', title: 'x' }],
    ['personal update', () => useUpdatePersonalNote('c'), { id: 'n1', body: 'x' }],
    ['shared delete', () => useDeleteSharedNote('c'), 'n1'],
    ['personal delete', () => useDeletePersonalNote('c'), 'n1'],
  ] as const)('%s: a refused write (0 rows, no error) is reported as a failure', async (_label, hook, arg) => {
    mockQueryResult.data = [];
    const { result } = renderHook(() => hook(), { wrapper });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.current.mutate(arg as any);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toContain('0 rows affected');
  });

  it('a write that touched one row succeeds', async () => {
    mockQueryResult.data = [{ id: 'n1' }];
    const { result } = renderHook(() => useDeleteSharedNote('c'), { wrapper });
    result.current.mutate('n1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
