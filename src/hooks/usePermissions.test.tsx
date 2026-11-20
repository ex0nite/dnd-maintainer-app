import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharacterPermissions, useRole } from './usePermissions';

const state = vi.hoisted(() => ({
  userId: 'u-1' as string | undefined,
  profile: undefined as { role: 'dm' | 'player' } | undefined,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: state.userId ? { user: { id: state.userId } } : null }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: state.profile, isLoading: false }),
}));

beforeEach(() => {
  state.userId = 'u-1';
  state.profile = { role: 'player' };
});

describe('useRole', () => {
  it('knows a player and a DM', () => {
    expect(renderHook(() => useRole()).result.current).toMatchObject({ role: 'player', isPlayer: true, isDm: false });
    state.profile = { role: 'dm' };
    expect(renderHook(() => useRole()).result.current).toMatchObject({ role: 'dm', isPlayer: false, isDm: true });
  });

  it('does not treat an unknown role as a player (nothing is hidden before the profile is known)', () => {
    state.profile = undefined;
    expect(renderHook(() => useRole()).result.current).toMatchObject({ role: null, isPlayer: false, isDm: false });
  });
});

describe('useCharacterPermissions', () => {
  it('lets a player edit their own active character, but not manage it', () => {
    const { result } = renderHook(() => useCharacterPermissions({ owner_user_id: 'u-1', is_active: true }));
    expect(result.current).toEqual({ isOwner: true, canEdit: true, canManage: false });
  });

  it("makes another player's character read-only", () => {
    const { result } = renderHook(() => useCharacterPermissions({ owner_user_id: 'u-2', is_active: true }));
    expect(result.current).toEqual({ isOwner: false, canEdit: false, canManage: false });
  });

  it('freezes a deactivated character even for its owner', () => {
    const { result } = renderHook(() => useCharacterPermissions({ owner_user_id: 'u-1', is_active: false }));
    expect(result.current.canEdit).toBe(false);
  });

  it('gives the DM everything', () => {
    state.profile = { role: 'dm' };
    const { result } = renderHook(() => useCharacterPermissions({ owner_user_id: 'u-2', is_active: false }));
    expect(result.current).toEqual({ isOwner: false, canEdit: true, canManage: true });
  });
});
