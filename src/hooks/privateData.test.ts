import { setupMockReset, supabase, mockQueryResult } from '@/test/hook-test-helpers';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));

import {
  flattenCharacter,
  flattenSession,
  splitCharacterPrivate,
  splitSessionPrivate,
  writeCharacterPrivate,
  writeSessionDm,
} from '@/hooks/privateData';

setupMockReset();

describe('splitCharacterPrivate / splitSessionPrivate', () => {
  it('moves backstory and notes of a character to the private part', () => {
    expect(splitCharacterPrivate({ name: 'A', backstory: 'b', notes: 'n' })).toEqual({
      pub: { name: 'A' },
      priv: { backstory: 'b', notes: 'n' },
    });
  });

  it('moves notes, loot and XP of a session to the DM part', () => {
    expect(splitSessionPrivate({ name: 'S', notes: 'n', loot: [], experience_awarded: 5, summary: 's' })).toEqual({
      pub: { name: 'S', summary: 's' },
      priv: { notes: 'n', loot: [], experience_awarded: 5 },
    });
  });
});

describe('flattenCharacter / flattenSession', () => {
  it('merges an object embed and drops the embed key', () => {
    expect(flattenCharacter({ id: '1', character_private: { backstory: 'b', notes: null } })).toEqual({
      id: '1',
      backstory: 'b',
      notes: null,
    });
  });

  it('accepts an array embed', () => {
    expect(flattenSession({ id: '1', session_dm: [{ experience_awarded: 7, loot: [1], notes: 'x' }] })).toEqual({
      id: '1',
      experience_awarded: 7,
      loot: [1],
      notes: 'x',
    });
  });

  it('falls back to empty values when the private part is missing (a non-DM reads nothing)', () => {
    expect(flattenSession({ id: '1', session_dm: null })).toEqual({
      id: '1',
      experience_awarded: 0,
      loot: null,
      notes: null,
    });
    expect(flattenCharacter({ id: '1' })).toEqual({ id: '1', backstory: null, notes: null });
  });
});

describe('write helpers', () => {
  it('update the private row by its key and accept exactly one affected row', async () => {
    mockQueryResult.data = [{ character_id: 'c1' }];
    await writeCharacterPrivate('c1', { backstory: 'b' });
    expect(supabase.from).toHaveBeenCalledWith('character_private');
    expect(supabase.update).toHaveBeenCalledWith({ backstory: 'b' });
    expect(supabase.eq).toHaveBeenCalledWith('character_id', 'c1');

    mockQueryResult.data = [{ session_id: 's1' }];
    await writeSessionDm('s1', { notes: 'n' });
    expect(supabase.from).toHaveBeenCalledWith('session_dm');
    expect(supabase.eq).toHaveBeenCalledWith('session_id', 's1');
  });

  it('do nothing when there is nothing private to write', async () => {
    await writeCharacterPrivate('c1', {});
    await writeSessionDm('s1', {});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('fail when row-level security lets the write touch 0 rows', async () => {
    mockQueryResult.data = [];
    await expect(writeCharacterPrivate('c1', { backstory: 'b' })).rejects.toThrow('0 rows affected');
    await expect(writeSessionDm('s1', { notes: 'n' })).rejects.toThrow('0 rows affected');
  });

  it('surface a database error', async () => {
    mockQueryResult.data = null;
    mockQueryResult.error = { message: 'boom' } as never;
    await expect(writeSessionDm('s1', { notes: 'n' })).rejects.toMatchObject({ message: 'boom' });
  });
});
