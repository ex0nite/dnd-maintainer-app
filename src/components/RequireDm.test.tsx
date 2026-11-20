import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireDm } from './RequireDm';

const role = vi.hoisted(() => ({ isPlayer: false }));
vi.mock('@/hooks/usePermissions', () => ({ useRole: () => ({ isPlayer: role.isPlayer }) }));

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
  it('sends a player home without rendering the DM page', () => {
    role.isPlayer = true;
    renderAt('/players');
    expect(screen.getByText(HOME)).toBeInTheDocument();
    expect(screen.queryByText(DM_PAGE)).not.toBeInTheDocument();
  });

  it('lets the DM in', () => {
    role.isPlayer = false;
    renderAt('/players');
    expect(screen.getByText(DM_PAGE)).toBeInTheDocument();
  });
});
