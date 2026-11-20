import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/hooks/useAuth';
import { useChangePassword } from './useProfile';

const updateUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { updateUser } } }));

const auth = { session: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null });
});

describe('useChangePassword', () => {
  it('refuses a password under 12 characters without calling the server', async () => {
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await expect(result.current.change('short-pass1')).resolves.toBe('too_short');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('accepts exactly 12 characters', async () => {
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await expect(result.current.change('abcdefghijkl')).resolves.toBe('ok');
    expect(updateUser).toHaveBeenCalledWith({ password: 'abcdefghijkl' });
  });

  it.each([
    ['same_password', 'same'],
    ['weak_password', 'weak'],
    ['something_else', 'unavailable'],
  ])('maps the server error %s to %s', async (code, expected) => {
    updateUser.mockResolvedValue({ error: { code, status: 422 } });
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await expect(result.current.change('a-long-enough-password')).resolves.toBe(expected);
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
