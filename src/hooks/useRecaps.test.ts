import { waitFor } from '@testing-library/react';
import { renderHook, createWrapper, setupMockReset } from '@/test/hook-test-helpers';
import { mockQueryResult, supabase } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));

import {
  useAddComment,
  useDeleteComment,
  usePublishedRecap,
  usePublishedRecaps,
  useSessionComments,
  useSetRecapPublished,
  useUpdateComment,
} from '@/hooks/useRecaps';

setupMockReset();
const wrapper = createWrapper();

describe('recap hooks', () => {
  it('lists only the published recaps (the DM would otherwise see every session)', async () => {
    mockQueryResult.data = [{ id: 's1' }];
    const { result } = renderHook(() => usePublishedRecaps('camp-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(supabase.eq)).toHaveBeenCalledWith('summary_published', true);
    expect(vi.mocked(supabase.eq)).toHaveBeenCalledWith('campaign_id', 'camp-1');
  });

  it('a recap that is not returned (not published, other campaign) is null, not an error', async () => {
    mockQueryResult.data = null;
    const { result } = renderHook(() => usePublishedRecap('camp-1', 'session-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not fetch without a campaign or session', () => {
    expect(renderHook(() => usePublishedRecaps(undefined), { wrapper }).result.current.fetchStatus).toBe('idle');
    expect(renderHook(() => useSessionComments(undefined), { wrapper }).result.current.fetchStatus).toBe('idle');
  });

  it('adds a comment without stating an author (the database fills it)', async () => {
    mockQueryResult.data = null;
    const { result } = renderHook(() => useAddComment('s1', 'camp-1'), { wrapper });
    result.current.mutate('Hello');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const payload = vi.mocked(supabase.insert).mock.calls[0][0];
    expect(payload).toEqual({ campaign_id: 'camp-1', session_id: 's1', body: 'Hello' });
    expect(payload).not.toHaveProperty('author_id');
  });

  it.each([
    ['publish', () => useSetRecapPublished('s1', 'c1'), true],
    ['edit comment', () => useUpdateComment('s1'), { id: 'c1', body: 'x' }],
    ['delete comment', () => useDeleteComment('s1'), 'c1'],
  ] as const)('%s: a refused write (0 rows, no error) is reported as a failure', async (_l, hook, arg) => {
    mockQueryResult.data = [];
    const { result } = renderHook(() => hook(), { wrapper });
    (result.current.mutate as (v: unknown) => void)(arg);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toContain('0 rows affected');
  });

  it('a write that touched one row succeeds', async () => {
    mockQueryResult.data = [{ id: 'c1' }];
    const { result } = renderHook(() => useSetRecapPublished('s1', 'c1'), { wrapper });
    result.current.mutate(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
