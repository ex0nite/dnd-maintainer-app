import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignOwnerDialog } from './AssignOwnerDialog';

const players = vi.hoisted(() => ({
  data: [] as { userId: string; pseudo: string; status: string; campaignIds: string[] }[],
}));
vi.mock('@/hooks/useAccounts', () => ({ usePlayers: () => ({ data: players.data, isError: false }) }));
vi.mock('react-i18next', async () => {
  const common = (await import('@/locales/en/common.json')).default as Record<string, unknown>;
  return {
    useTranslation: () => ({
      t: (key: string) =>
        String(
          key
            .split('.')
            .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], common) ?? key
        ),
    }),
  };
});

const CAMPAIGN = 'camp-a';

beforeEach(() => {
  players.data = [
    { userId: 'u-1', pseudo: 'alice', status: 'active', campaignIds: [CAMPAIGN] },
    { userId: 'u-2', pseudo: 'bob', status: 'temporary', campaignIds: [CAMPAIGN] },
    { userId: 'u-3', pseudo: 'carol', status: 'archived', campaignIds: [CAMPAIGN] },
    { userId: 'u-4', pseudo: 'dave', status: 'active', campaignIds: ['elsewhere'] },
  ];
});

function open(currentOwnerId: string | null, onSave = vi.fn()) {
  render(
    <AssignOwnerDialog
      campaignId={CAMPAIGN}
      currentOwnerId={currentOwnerId}
      saving={false}
      onSave={onSave}
      onClose={vi.fn()}
    />
  );
  return onSave;
}

describe('AssignOwnerDialog', () => {
  it('only proposes the non-archived players of the campaign, and "nobody"', () => {
    open(null);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(["Nobody (the DM's)", 'alice', 'bob']);
  });

  it('saves the chosen player, and nothing can be saved before a change', () => {
    const onSave = open(null);
    const save = screen.getByRole('button', { name: 'Assign' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'u-1' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith('u-1');
  });

  it('lets the DM take the character back even when the current owner is no longer proposed', () => {
    const onSave = open('u-3');
    expect(screen.getByRole('option', { name: /not available/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
