import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerHome from './PlayerHome';

const data = vi.hoisted(() => ({
  campaigns: [] as { id: string; slug: string; name: string }[],
  characters: [] as Record<string, unknown>[],
  loading: false,
}));

vi.mock('react-i18next', async () => {
  const common = (await import('@/locales/en/common.json')).default as Record<string, unknown>;
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const text = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], common);
        return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? ''));
      },
    }),
  };
});
vi.mock('@/hooks/useCampaigns', () => ({ useCampaigns: () => ({ data: data.campaigns, isLoading: data.loading }) }));
vi.mock('@/hooks/useCharacters', () => ({
  useMyCharacters: () => ({ data: data.characters, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/components/PortraitImage', () => ({ PortraitImage: () => null }));

function renderHome() {
  return render(
    <MemoryRouter>
      <PlayerHome />
    </MemoryRouter>
  );
}

beforeEach(() => {
  data.campaigns = [];
  data.characters = [];
  data.loading = false;
});

describe('PlayerHome', () => {
  it('tells a player without campaign what is going on, without an error', () => {
    renderHome();
    expect(screen.getByText(/not part of any campaign/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('groups my characters by campaign and links each one to its sheet or its draft', () => {
    data.campaigns = [
      { id: 'a', slug: 'camp-a', name: 'Campaign A' },
      { id: 'b', slug: 'camp-b', name: 'Campaign B' },
    ];
    data.characters = [
      { id: '1', slug: 'alice-1', campaign_id: 'a', name: 'Alice', level: 3, status: 'ready', is_active: true },
      { id: '2', slug: 'alice-2', campaign_id: 'a', name: 'Draft', level: 1, status: 'draft', is_active: true },
    ];
    renderHome();
    expect(screen.getByRole('link', { name: /Alice/ })).toHaveAttribute('href', '/campaign/camp-a/character/alice-1');
    expect(screen.getByRole('link', { name: /Draft/ })).toHaveAttribute(
      'href',
      '/campaign/camp-a/character/alice-2/edit'
    );
    expect(screen.getAllByRole('link', { name: /New character/i })).toHaveLength(2);
    expect(screen.getByText(/no character in this campaign/i)).toBeInTheDocument();
  });

  it('exposes the places for notes and session recaps', () => {
    data.campaigns = [{ id: 'a', slug: 'camp-a', name: 'Campaign A' }];
    renderHome();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
  });
});
