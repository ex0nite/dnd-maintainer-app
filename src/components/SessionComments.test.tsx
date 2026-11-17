import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionComments } from './SessionComments';

const state = vi.hoisted(() => ({
  isDm: false,
  comments: [] as Record<string, unknown>[],
  add: vi.fn(),
}));

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
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
vi.mock('@/hooks/usePermissions', () => ({
  useRole: () => ({ userId: 'me', isDm: state.isDm, isPlayer: !state.isDm }),
}));
const idle = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/useCampaignNotes', () => ({ useAuthorNames: () => ({ data: { me: 'alice', other: 'bob' } }) }));
vi.mock('@/hooks/useRecaps', () => ({
  COMMENT_BODY_MAX: 2000,
  useSessionComments: () => ({ data: state.comments, isLoading: false, isError: false }),
  useAddComment: () => ({ mutate: state.add, isPending: false }),
  useUpdateComment: () => idle,
  useDeleteComment: () => idle,
}));

const comment = (id: string, author: string) => ({
  id,
  campaign_id: 'c',
  session_id: 's',
  author_id: author,
  body: `<i>${id}</i>`,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

beforeEach(() => {
  state.isDm = false;
  state.comments = [comment('mine', 'me'), comment('theirs', 'other')];
  state.add.mockClear();
});

describe('SessionComments', () => {
  it('shows comments as escaped text with their author', () => {
    render(<SessionComments sessionId="s" campaignId="c" />);
    expect(screen.getByText('<i>mine</i>')).toBeTruthy();
    expect(screen.getByText(/alice/)).toBeTruthy();
    expect(screen.getByText(/bob/)).toBeTruthy();
  });

  it('a member manages only their own comment', () => {
    render(<SessionComments sessionId="s" campaignId="c" />);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('the DM moderates every comment', () => {
    state.isDm = true;
    render(<SessionComments sessionId="s" campaignId="c" />);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it('sends the trimmed text of a new comment, and nothing for a blank one', async () => {
    render(<SessionComments sessionId="s" campaignId="c" />);
    const save = screen.getAllByRole('button', { name: 'Save' })[0] as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Add a comment'), '  hello  ');
    await userEvent.click(save);
    expect(state.add).toHaveBeenCalledWith('hello', expect.anything());
  });

  it('asks before deleting', async () => {
    render(<SessionComments sessionId="s" campaignId="c" />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Delete for good' })).toBeTruthy();
  });
});
