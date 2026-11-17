import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCreatePlayer } from '@/hooks/useAccounts';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PSEUDO_PATTERN } from '@/lib/auth-email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ERROR_KEYS = {
  invalid_pseudo: 'players.errors.invalidPseudo',
  pseudo_taken: 'players.errors.pseudoTaken',
  campaign_not_found: 'players.errors.campaignNotFound',
  rate_limited: 'players.errors.rateLimited',
} as const;

export default function Players() {
  const { t } = useTranslation('common');
  usePageTitle(t('players.title'));
  const { data: campaigns = [] } = useCampaigns();
  const createPlayer = useCreatePlayer();
  const [pseudo, setPseudo] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [copied, setCopied] = useState(false);

  const effectiveCampaignId = campaignId || campaigns[0]?.id || '';
  const pseudoValid = PSEUDO_PATTERN.test(pseudo);
  const created = createPlayer.data;
  const errorCode = createPlayer.error?.code;
  const errorKey = errorCode && errorCode in ERROR_KEYS ? ERROR_KEYS[errorCode as keyof typeof ERROR_KEYS] : undefined;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!pseudoValid || !effectiveCampaignId) return;
    setCopied(false);
    createPlayer.mutate({ pseudo, campaignId: effectiveCampaignId });
  };

  const copy = async (): Promise<void> => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard can be refused (insecure context, permissions): the password stays selectable on screen.
    }
  };

  const reset = (): void => {
    createPlayer.reset();
    setPseudo('');
    setCopied(false);
  };

  return (
    <div className="page-container max-w-xl">
      <h1 className="page-title">{t('players.title')}</h1>

      {created ? (
        <section aria-live="polite" className="space-y-4 rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">{t('players.created.title', { pseudo: created.pseudo })}</h2>
          <p className="text-sm text-muted-foreground">{t('players.created.once')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded bg-muted px-3 py-2 font-mono text-base">
              {created.temporaryPassword}
            </code>
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              <span className="ml-2">{copied ? t('players.created.copied') : t('players.created.copy')}</span>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t('players.created.mustChange')}</p>
          <Button type="button" onClick={reset}>
            {t('players.created.done')}
          </Button>
        </section>
      ) : (
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
          {createPlayer.isError && (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {t(errorKey ?? 'players.errors.generic')}
            </p>
          )}
          <Button type="submit" disabled={!pseudoValid || !effectiveCampaignId || createPlayer.isPending}>
            {t('players.create')}
          </Button>
        </form>
      )}
    </div>
  );
}
