import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { PlayerRow } from '@/hooks/useAccounts';
import type { CampaignSummary } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Confirming = 'reset' | 'archive' | null;

interface PlayerItemProps {
  player: PlayerRow;
  campaigns: CampaignSummary[];
  /** Any account action is running: every action button of the list waits. */
  busy: boolean;
  onReset: (player: PlayerRow) => void;
  onArchive: (player: PlayerRow) => void;
  onReactivate: (player: PlayerRow) => void;
  onAddToCampaign: (player: PlayerRow, campaignId: string) => void;
  onRemoveFromCampaign: (player: PlayerRow, campaignId: string) => void;
}

/** One account of the DM's list: status, campaigns (add / remove), and the actions on the account. */
export function PlayerItem({
  player,
  campaigns,
  busy,
  onReset,
  onArchive,
  onReactivate,
  onAddToCampaign,
  onRemoveFromCampaign,
}: PlayerItemProps) {
  const { t } = useTranslation('common');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [toAdd, setToAdd] = useState('');
  const archived = player.status === 'archived';
  const addable = campaigns.filter((c) => !player.campaignIds.includes(c.id));
  const nameOf = (id: string): string => campaigns.find((c) => c.id === id)?.name ?? id;

  const confirmButton = (action: Exclude<Confirming, null>, run: () => void) => (
    <span className="flex gap-2">
      <Button
        type="button"
        size="sm"
        autoFocus
        disabled={busy}
        aria-label={t(`players.${action}.confirmFor`, { pseudo: player.pseudo })}
        onClick={() => {
          setConfirming(null);
          run();
        }}
      >
        {t(`players.${action}.confirm`)}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
        {t('players.cancel')}
      </Button>
    </span>
  );

  return (
    <li className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 font-medium">{player.pseudo}</p>
        <Badge variant={player.status === 'active' ? 'default' : 'outline'}>
          {t(`players.status.${player.status}`)}
        </Badge>
      </div>

      <ul
        className="flex flex-wrap items-center gap-2"
        aria-label={t('players.campaignsOf', { pseudo: player.pseudo })}
      >
        {player.campaignIds.length === 0 && (
          <li className="text-xs text-muted-foreground">{t('players.list.noCampaign')}</li>
        )}
        {player.campaignIds.map((id) => (
          <li key={id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
            {nameOf(id)}
            <button
              type="button"
              disabled={busy}
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label={t('players.removeFrom', { pseudo: player.pseudo, campaign: nameOf(id) })}
              onClick={() => onRemoveFromCampaign(player, id)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {!archived && addable.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={toAdd || addable[0].id}
            onChange={(e) => setToAdd(e.target.value)}
            aria-label={t('players.addTo', { pseudo: player.pseudo })}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          >
            {addable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAddToCampaign(player, toAdd || addable[0].id)}
          >
            {t('players.add')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {archived ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label={t('players.reactivate.button', { pseudo: player.pseudo })}
            onClick={() => onReactivate(player)}
          >
            {t('players.reactivate.short')}
          </Button>
        ) : confirming === 'reset' ? (
          confirmButton('reset', () => onReset(player))
        ) : confirming === 'archive' ? (
          confirmButton('archive', () => onArchive(player))
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-label={t('players.reset.button', { pseudo: player.pseudo })}
              onClick={() => setConfirming('reset')}
            >
              {t('players.reset.short')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-label={t('players.archive.button', { pseudo: player.pseudo })}
              onClick={() => setConfirming('archive')}
            >
              {t('players.archive.short')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
