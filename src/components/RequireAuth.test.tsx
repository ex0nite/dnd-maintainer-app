import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/components/RequireAuth';
import { AuthContext } from '@/hooks/useAuth';

const profileResult = vi.hoisted(() => ({ data: null as unknown, error: null as unknown }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve(profileResult) }) }),
    }),
  },
}));

const PASSWORD_PAGE = 'password page';
const PRIVATE = 'private content';

const auth = {
  session: { access_token: 't', user: { id: 'u-1' } } as never,
  isLoading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/change-password" element={<p>{PASSWORD_PAGE}</p>} />
              <Route path="/campaign/secret" element={<p>{PRIVATE}</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  profileResult.data = { role: 'player', pseudo: 'dave', must_change_password: false, archived_at: null };
  profileResult.error = null;
});

describe('RequireAuth with a temporary password (story 2.3)', () => {
  it('sends a player on a temporary password to the password page, never rendering the data page', async () => {
    profileResult.data = { role: 'player', pseudo: 'dave', must_change_password: true, archived_at: null };
    renderAt('/campaign/secret');
    expect(await screen.findByText(PASSWORD_PAGE)).toBeInTheDocument();
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
  });

  it('lets the player reach the password page itself', async () => {
    profileResult.data = { role: 'player', pseudo: 'dave', must_change_password: true, archived_at: null };
    renderAt('/change-password');
    expect(await screen.findByText(PASSWORD_PAGE)).toBeInTheDocument();
  });

  it('renders the page for a player who already chose a password', async () => {
    renderAt('/campaign/secret');
    expect(await screen.findByText(PRIVATE)).toBeInTheDocument();
  });

  it('shows nothing private while the profile is loading', () => {
    renderAt('/campaign/secret');
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
  });

  it('lets a signed-in user open the password page at any time', async () => {
    renderAt('/change-password');
    expect(await screen.findByText(PASSWORD_PAGE)).toBeInTheDocument();
  });
});
