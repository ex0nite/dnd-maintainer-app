import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import CampaignNotes from './CampaignNotes';

const state = vi.hoisted(() => ({
  isDm: false,
  userId: 'me',
  shared: [] as Record<string, unknown>[],
  personal: [] as Record<string, unknown>[],
}));

vi.mock('react-i18next', async () => {
  const common = (await import('@/locales/en/common.json')).default as Record<string, unknown>;
  return {
    useTranslation: () => ({
      i18n: { language: 'en' },
      t: (key: string, options?: Record<string, unknown>) => {
        const text = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], common);
        return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? ''));
      },
    }),
  };
});
vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/hooks/useCampaignContext', () => ({ useCampaignContext: () => ({ campaignId: 'camp-1' }) }));
vi.mock('@/hooks/usePermissions', () => ({
  useRole: () => ({ userId: state.userId, isDm: state.isDm, isPlayer: !state.isDm }),
}));
const mutation = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/useCampaignNotes', async () => ({
  ...(await vi.importActual<object>('@/hooks/useCampaignNotes')),
  useSharedNotes: () => ({ data: state.shared, isLoading: false, isError: false }),
  usePersonalNotes: () => ({ data: state.personal, isLoading: false, isError: false }),
  useAuthorNames: () => ({ data: { me: 'alice', other: 'bob', dm: 'maitre' } }),
  useCreateSharedNote: () => mutation,
  useUpdateSharedNote: () => mutation,
  useDeleteSharedNote: () => mutation,
  useCreatePersonalNote: () => mutation,
  useUpdatePersonalNote: () => mutation,
  useDeletePersonalNote: () => mutation,
}));

const note = (id: string, author: string, extra: Record<string, unknown> = {}) => ({
  id,
  campaign_id: 'camp-1',
  author_id: author,
  title: `Note ${id}`,
  category: 'quest',
  pinned: false,
  body: '<b>not bold</b>',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
});

beforeEach(() => {
  state.isDm = false;
  state.shared = [note('mine', 'me'), note('theirs', 'other')];
  state.personal = [note('p1', 'me')];
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <CampaignNotes />
    </MemoryRouter>
  );

describe('CampaignNotes', () => {
  it('shows the text escaped, never as HTML', () => {
    renderPage();
    expect(screen.getAllByText('<b>not bold</b>')).toHaveLength(2);
  });

  it('a player can edit and delete only their own shared notes', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('the DM moderates every shared note', () => {
    state.isDm = true;
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it("the DM reads the players' notes with their author and has no edit command", async () => {
    state.isDm = true;
    state.personal = [note('p1', 'other')];
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: "Players' notes" }));
    expect(screen.getByText(/by bob/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New personal note' })).toBeNull();
  });

  it('a player edits their own notebook', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'My notes' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New personal note' })).toBeTruthy();
  });
});
