import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCreatePlayer, usePlayers, useResetPassword, type PlayerRow } from '@/hooks/useAccounts';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PSEUDO_PATTERN } from '@/lib/auth-email';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TemporaryPassword } from '@/components/TemporaryPassword';

const ERROR_KEYS = {
  invalid_pseudo: 'players.errors.invalidPseudo',
  pseudo_taken: 'players.errors.pseudoTaken',
  campaign_not_found: 'players.errors.campaignNotFound',
  rate_limited: 'players.errors.rateLimited',
  account_archived: 'players.errors.accountArchived',
  account_not_found: 'players.errors.accountNotFound',
} as const;

interface Shown {
  pseudo: string;
  password: string;
  kind: 'created' | 'reset';
}

export default function Players() {
  const { t } = useTranslation('common');
  usePageTitle(t('players.title'));
  const { data: campaigns = [] } = useCampaigns();
  const { data: players = [] } = usePlayers();
  const createPlayer = useCreatePlayer();
  const resetPassword = useResetPassword();
  const [pseudo, setPseudo] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);

  const effectiveCampaignId = campaignId || campaigns[0]?.id || '';
  const pseudoValid = PSEUDO_PATTERN.test(pseudo);
  const error = createPlayer.error ?? resetPassword.error;
  const errorKey = error && error.code in ERROR_KEYS ? ERROR_KEYS[error.code as keyof typeof ERROR_KEYS] : undefined;
  const campaignName = (id: string): string => campaigns.find((c) => c.id === id)?.name ?? id;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!pseudoValid || !effectiveCampaignId) return;
    resetPassword.reset();
    createPlayer.mutate(
      { pseudo, campaignId: effectiveCampaignId },
      {
        onSuccess: (created) =>
          setShown({ pseudo: created.pseudo, password: created.temporaryPassword, kind: 'created' }),
      }
    );
  };

  const reset = (player: PlayerRow): void => {
    createPlayer.reset();
    setConfirmingReset(null);
    resetPassword.mutate(player.userId, {
      onSuccess: (result) => setShown({ pseudo: player.pseudo, password: result.temporaryPassword, kind: 'reset' }),
    });
  };

  const done = (): void => {
    // Nothing of the password may stay in memory once the DM has handed it over.
    setShown(null);
    setPseudo('');
    createPlayer.reset();
    resetPassword.reset();
  };

  return (
    <div className="page-container max-w-xl space-y-8">
      <h1 className="page-title">{t('players.title')}</h1>

      {shown ? (
        <TemporaryPassword
          title={t(shown.kind === 'created' ? 'players.created.title' : 'players.reset.title', {
            pseudo: shown.pseudo,
          })}
          password={shown.password}
          onDone={done}
        />
      ) : (
        <>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">{t('players.description')}</p>
            <div className="space-y-2">
              <Label htmlFor="player-pseudo">{t('players.pseudo')}</Label>
              <Input
                id="player-pseudo"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value.toLowerCase())}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="player-pseudo-help"
                aria-invalid={pseudo !== '' && !pseudoValid}
              />
              <p id="player-pseudo-help" className="text-xs text-muted-foreground">
                {t('players.pseudoHelp')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="player-campaign">{t('players.campaign')}</Label>
              <select
                id="player-campaign"
                value={effectiveCampaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {campaigns.length === 0 && <p className="text-sm text-muted-foreground">{t('players.noCampaign')}</p>}
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {t(errorKey ?? 'players.errors.generic')}
              </p>
            )}
            <Button type="submit" disabled={!pseudoValid || !effectiveCampaignId || createPlayer.isPending}>
              {t('players.create')}
            </Button>
          </form>

          <section aria-labelledby="players-list-title" className="space-y-3">
            <h2 id="players-list-title" className="text-lg font-semibold">
              {t('players.list.title')}
            </h2>
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('players.list.empty')}</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {players.map((player) => (
                  <li key={player.userId} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{player.pseudo}</p>
                      <p className="text-xs text-muted-foreground">
                        {player.campaignIds.map(campaignName).join(', ') || t('players.list.noCampaign')}
                      </p>
                    </div>
                    <Badge variant={player.status === 'active' ? 'default' : 'outline'}>
                      {t(`players.status.${player.status}`)}
                    </Badge>
                    {player.status !== 'archived' &&
                      (confirmingReset === player.userId ? (
                        <span className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => reset(player)}
                            disabled={resetPassword.isPending}
                          >
                            {t('players.reset.confirm')}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingReset(null)}>
                            {t('players.reset.cancel')}
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={t('players.reset.button', { pseudo: player.pseudo })}
                          onClick={() => setConfirmingReset(player.userId)}
                        >
                          {t('players.reset.short')}
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
