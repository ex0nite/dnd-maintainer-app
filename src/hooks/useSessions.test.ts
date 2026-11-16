import {
  setupMockReset,
  describeListQuery,
  describeSingleQuery,
  describeCreateMutation,
  describeUpdateMutation,
  describeDeleteMutation,
  renderHook,
  waitFor,
  createWrapper,
  supabase,
  mockQueryResult,
} from '@/test/hook-test-helpers';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));
// The private-table writes count affected rows: this suite's single canned response can not play both
// tables, so they are stubbed here and covered by privateData.test.ts.
vi.mock('@/hooks/privateData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/privateData')>()),
  writeCharacterPrivate: vi.fn(),
  writeSessionDm: vi.fn(),
}));

import { useSessions, useSession, useCreateSession, useUpdateSession, useDeleteSession } from '@/hooks/useSessions';
import { writeSessionDm } from '@/hooks/privateData';
import type { Session } from '@/types/database';

const baseSession: Session = {
  id: 'sess-1',
  slug: 'first-adventure-sess',
  previous_slugs: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  campaign_id: 'camp-1',
  session_number: 1,
  name: 'The First Adventure',
  date: '2024-01-15',
  summary: null,
  experience_awarded: 0,
  loot: null,
  notes: null,
};

setupMockReset();

describeListQuery(
  'useSessions',
  () => renderHook(() => useSessions('camp-1'), { wrapper: createWrapper() }),
  baseSession,
  () => renderHook(() => useSessions(''), { wrapper: createWrapper() }),
  'campaign_id'
);

describeSingleQuery(
  'useSession',
  (id) => renderHook(() => useSession(id as string | undefined), { wrapper: createWrapper() }),
  baseSession,
  'sess-1',
  undefined
);

describe('useSession slug query pattern', () => {
  it('queries by slug using .or() with both slug and previous_slugs', async () => {
    mockQueryResult.data = baseSession;

    const { result } = renderHook(() => useSession('first-adventure-sess'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.or).toHaveBeenCalledWith('slug.eq.first-adventure-sess,previous_slugs.cs.{"first-adventure-sess"}');
  });

  it('throws when slug contains invalid characters', async () => {
    const { result } = renderHook(() => useSession('bad,slug'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

const { id: _id, created_at: _created_at, updated_at: _updated_at, ...createSessionPayload } = baseSession;

describeCreateMutation(
  'useCreateSession',
  () => renderHook(() => useCreateSession(), { wrapper: createWrapper() }),
  createSessionPayload,
  baseSession
);

describe('session private part (session_dm)', () => {
  it('reads XP, notes and loot through the session_dm embed', async () => {
    const { experience_awarded: _x, loot: _l, notes: _n, ...publicColumns } = baseSession;
    mockQueryResult.data = {
      ...publicColumns,
      session_dm: { experience_awarded: 300, notes: 'DM secret', loot: [{ name: 'gem' }] },
    };

    const { result } = renderHook(() => useSession('first-adventure-sess'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      experience_awarded: 300,
      notes: 'DM secret',
      loot: [{ name: 'gem' }],
    });
    expect(result.current.data).not.toHaveProperty('session_dm');
  });

  it('create writes notes, loot and XP to session_dm and keeps them out of the sessions insert', async () => {
    mockQueryResult.data = baseSession;

    const { result } = renderHook(() => useCreateSession(), { wrapper: createWrapper() });
    const { id: _i, created_at: _c, updated_at: _u, ...payload } = baseSession;
    result.current.mutate({ ...payload, notes: 'DM secret', experience_awarded: 300, loot: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const inserted = vi.mocked(supabase.insert).mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty('notes');
    expect(inserted).not.toHaveProperty('loot');
    expect(inserted).not.toHaveProperty('experience_awarded');
    expect(writeSessionDm).toHaveBeenCalledWith('sess-1', { notes: 'DM secret', experience_awarded: 300, loot: [] });
  });

  it('create removes the new session when its private part cannot be written', async () => {
    mockQueryResult.data = baseSession;
    vi.mocked(writeSessionDm).mockRejectedValueOnce(new Error('0 rows affected'));

    const { result } = renderHook(() => useCreateSession(), { wrapper: createWrapper() });
    const { id: _i, created_at: _c, updated_at: _u, ...payload } = baseSession;
    result.current.mutate({ ...payload, experience_awarded: 300 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('0 rows affected'));
    expect(supabase.delete).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('update sends private fields to session_dm only, and raises a private failure as is', async () => {
    mockQueryResult.data = { ...baseSession };
    vi.mocked(writeSessionDm).mockRejectedValueOnce(new Error('private write refused'));

    const { result } = renderHook(() => useUpdateSession(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'sess-1', name: 'Renamed', experience_awarded: 500 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('private write refused'));
    expect(vi.mocked(supabase.update).mock.calls[0][0]).toEqual({ name: 'Renamed' });
    expect(writeSessionDm).toHaveBeenCalledWith('sess-1', { experience_awarded: 500 });
  });
});

describeUpdateMutation('useUpdateSession', () => renderHook(() => useUpdateSession(), { wrapper: createWrapper() }), {
  id: 'sess-1',
  title: 'Updated Title',
});

describeDeleteMutation('useDeleteSession', () => renderHook(() => useDeleteSession(), { wrapper: createWrapper() }), {
  id: 'sess-1',
  campaignId: 'camp-1',
});
