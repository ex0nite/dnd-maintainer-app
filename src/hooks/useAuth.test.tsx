import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/components/RequireAuth';
import { AuthProvider, useAuth } from './useAuth';

const LOGIN_PAGE = 'login page';
const PRIVATE = 'private content';

type AuthListener = (event: string, session: unknown) => void;

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

let listener: AuthListener = () => {};

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.unsubscribe.mockReset();
  auth.onAuthStateChange.mockReset().mockImplementation((cb: AuthListener) => {
    listener = cb;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  });
});

describe('useAuth', () => {
  it('signs in with the address derived from the pseudo', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = '';
    await act(async () => {
      ok = await result.current.signIn('  Maitre ', 'a-long-enough-pass');
    });

    expect(ok).toBe('ok');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'maitre@table.invalid',
      password: 'a-long-enough-pass',
    });
  });

  it('answers the same way for a wrong password and an impossible pseudo', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials', status: 400 } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let wrongPassword = '';
    let impossiblePseudo = '';
    await act(async () => {
      wrongPassword = await result.current.signIn('maitre', 'wrong');
      impossiblePseudo = await result.current.signIn('x', 'whatever');
    });

    expect(wrongPassword).toBe('invalid');
    expect(impossiblePseudo).toBe('invalid');
    // The impossible pseudo never reaches the network.
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('tells an outage from wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'boom', status: 503 } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = '';
    await act(async () => {
      outcome = await result.current.signIn('maitre', 'a-long-enough-pass');
    });

    expect(outcome).toBe('unavailable');
  });

  it('drops the local session even when the network sign-out fails', async () => {
    auth.signOut.mockResolvedValueOnce({ error: { message: 'offline' } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  });

  it('empties the query cache when another user takes over', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } } });
    const queryClient = new QueryClient();
    queryClient.setQueryData(['campaigns'], [{ id: 'secret' }]);
    renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled());
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    await act(async () => {});

    act(() => listener('SIGNED_IN', { user: { id: 'b' } }));

    expect(queryClient.getQueryData(['campaigns'])).toBeUndefined();
  });

  it('empties the query cache when the session ends', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['campaigns'], [{ id: 'secret' }]);
    renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled());

    act(() => listener('SIGNED_OUT', null));

    expect(queryClient.getQueryData(['campaigns'])).toBeUndefined();
  });

  it('stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper: makeWrapper(new QueryClient()) });
    await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });
});

describe('RequireAuth', () => {
  function renderGuard() {
    return render(
      <MemoryRouter initialEntries={['/campaign/secret']}>
        <Routes>
          <Route path="/login" element={<p>{LOGIN_PAGE}</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/campaign/secret" element={<p>{PRIVATE}</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(new QueryClient()) }
    );
  }

  it('renders nothing private while the stored session is still being read', () => {
    auth.getSession.mockReturnValue(new Promise(() => {}));
    renderGuard();
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
    expect(screen.queryByText(LOGIN_PAGE)).not.toBeInTheDocument();
  });

  it('sends a visitor to the login page without rendering the content', async () => {
    renderGuard();
    expect(await screen.findByText(LOGIN_PAGE)).toBeInTheDocument();
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
  });

  it('renders the content with a session, and leaves it when the session ends', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    renderGuard();
    expect(await screen.findByText(PRIVATE)).toBeInTheDocument();

    act(() => listener('SIGNED_OUT', null));

    expect(await screen.findByText(LOGIN_PAGE)).toBeInTheDocument();
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
  });
});
