import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireDm } from './RequireDm';

const role = vi.hoisted(() => ({ isPlayer: false, isDm: true, isLoading: false }));
vi.mock('@/hooks/usePermissions', () => ({ useRole: () => role }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('react-i18next', async () => {
  const common = (await import('@/locales/en/common.json')).default as Record<string, unknown>;
  return {
    useTranslation: () => ({
      t: (key: string) =>
        String(
          key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], common)
        ),
    }),
  };
});

const HOME = 'home';
const DM_PAGE = 'dm page';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>{HOME}</p>} />
        <Route element={<RequireDm />}>
          <Route path="/players" element={<p>{DM_PAGE}</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireDm', () => {
  it('tells a player clearly that the page is not for them, without rendering the DM page', () => {
    Object.assign(role, { isPlayer: true, isDm: false, isLoading: false });
    renderAt('/players');
    expect(screen.getByRole('heading', { name: /reserved for the DM/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot open this page/i);
    expect(screen.getByRole('link', { name: /back to my table/i })).toHaveAttribute('href', '/');
    expect(screen.queryByText(DM_PAGE)).not.toBeInTheDocument();
  });

  it('refuses when the role could not be read (fail closed)', () => {
    Object.assign(role, { isPlayer: false, isDm: false, isLoading: false });
    renderAt('/players');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(DM_PAGE)).not.toBeInTheDocument();
  });

  it('renders nothing while the role is loading', () => {
    Object.assign(role, { isPlayer: false, isDm: false, isLoading: true });
    renderAt('/players');
    expect(screen.queryByText(DM_PAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the DM in', () => {
    Object.assign(role, { isPlayer: false, isDm: true, isLoading: false });
    renderAt('/players');
    expect(screen.getByText(DM_PAGE)).toBeInTheDocument();
  });
});
