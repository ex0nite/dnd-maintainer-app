import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));
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

describe('NoteEditor', () => {
  it('a shared note needs a title and the title is trimmed', async () => {
    const onSave = vi.fn();
    render(<NoteEditor idPrefix="t" shared pending={false} onSave={onSave} onCancel={() => {}} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Title'), '  Clue  ');
    await userEvent.type(screen.getByLabelText('Text'), 'body');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Clue', body: 'body', pinned: false }));
  });

  it('a personal note may have no title and shows neither category nor pin', async () => {
    const onSave = vi.fn();
    render(<NoteEditor idPrefix="p" shared={false} pending={false} onSave={onSave} onCancel={() => {}} />);
    expect(screen.queryByLabelText('Category')).toBeNull();
    await userEvent.type(screen.getByLabelText('Text'), 'idea');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: '', body: 'idea' }));
  });

  it('caps the text and shows the counter', () => {
    render(<NoteEditor idPrefix="c" shared={false} pending={false} onSave={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).maxLength).toBe(10000);
    expect(screen.getByText('0 / 10000 characters')).toBeTruthy();
  });
});
