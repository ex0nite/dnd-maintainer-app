import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerHome from './PlayerHome';

const data = vi.hoisted(() => ({
  campaigns: [] as { id: string; slug: string; name: string }[],
  characters: [] as Record<string, unknown>[],
  loading: false,
  recaps: {} as Record<string, { id: string; slug: string; name: string | null; session_number: number }[]>,
  personal: 2,
  shared: 3,
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
vi.mock('@/hooks/useCampaignNotes', () => ({
  usePersonalNotes: () => ({ data: Array.from({ length: data.personal }), isError: false }),
  useSharedNotes: () => ({ data: Array.from({ length: data.shared }), isError: false }),
}));
vi.mock('@/hooks/useRecaps', () => ({
  usePublishedRecaps: (campaignId: string) => ({ data: data.recaps[campaignId] ?? [], isError: false }),
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
  data.recaps = {};
});

describe('PlayerHome', () => {
  it('tells a player without campaign what is going on, without an error', () => {
    renderHome();
    expect(screen.getByText(/not part of any campaign/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows my characters of the chosen campaign and links each one to its sheet or its draft', async () => {
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
    expect(screen.getAllByRole('link', { name: /New character/i })).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText('Campaign'), 'b');
    expect(screen.getByText(/no character in this campaign/i)).toBeInTheDocument();
  });

  it('shows the notes of the campaign and a message when no recap is published', () => {
    data.campaigns = [{ id: 'a', slug: 'camp-a', name: 'Campaign A' }];
    renderHome();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByText(/2 personal note\(s\), 3 shared note\(s\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the notes' })).toHaveAttribute(
      'href',
      '/campaign/camp-a/table-notes'
    );
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByText(/No session recap has been published yet/)).toBeInTheDocument();
  });

  it('lists the latest published recaps of the campaign', () => {
    data.campaigns = [{ id: 'a', slug: 'camp-a', name: 'Campaign A' }];
    data.recaps = { a: [{ id: 's1', slug: 'session-1', name: 'The mine', session_number: 1 }] };
    renderHome();
    expect(screen.getByRole('link', { name: 'Session 1: The mine' })).toHaveAttribute(
      'href',
      '/campaign/camp-a/recaps/session-1'
    );
    expect(screen.getByRole('link', { name: 'All session recaps' })).toHaveAttribute('href', '/campaign/camp-a/recaps');
  });

  it('changes the content when the player picks another campaign, and offers no choice with a single one', async () => {
    data.campaigns = [
      { id: 'a', slug: 'camp-a', name: 'Campaign A' },
      { id: 'b', slug: 'camp-b', name: 'Campaign B' },
    ];
    data.characters = [
      { id: '1', slug: 'alice-1', campaign_id: 'a', name: 'Alice', level: 3, status: 'ready', is_active: true },
      { id: '2', slug: 'bob-1', campaign_id: 'b', name: 'Bobby', level: 1, status: 'ready', is_active: true },
    ];
    renderHome();
    expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bobby/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Campaign'), 'b');
    expect(screen.getByRole('link', { name: /Bobby/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alice/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the notes' })).toHaveAttribute(
      'href',
      '/campaign/camp-b/table-notes'
    );
  });

  it('offers no campaign choice when there is only one', () => {
    data.campaigns = [{ id: 'a', slug: 'camp-a', name: 'Campaign A' }];
    renderHome();
    expect(screen.queryByLabelText('Campaign')).not.toBeInTheDocument();
  });
});
