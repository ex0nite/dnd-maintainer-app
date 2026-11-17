import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRecapPublished, useSetRecapPublished } from '@/hooks/useRecaps';

/** The DM's switch: publish the player-facing summary of a session (D-14). Unpublishing keeps the comments. */
export function RecapPublishToggle({ sessionId, campaignId }: { sessionId: string; campaignId: string }) {
  const { t } = useTranslation('common');
  const { data: published, isLoading, isError } = useRecapPublished(sessionId);
  const setPublished = useSetRecapPublished(sessionId, campaignId);

  return (
    <div className="space-y-1">
      <label htmlFor="recap-published" className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input
          id="recap-published"
          type="checkbox"
          className="size-5"
          checked={published === true}
          disabled={isLoading || isError || setPublished.isPending}
          onChange={(e) =>
            setPublished.mutate(e.target.checked, { onError: () => toast.error(t('recaps.publishFailed')) })
          }
        />
        {t('recaps.publish')}
      </label>
      <p className="text-xs text-muted-foreground">{t('recaps.publishHelp')}</p>
      {isError && (
        <p role="alert" className="text-xs text-destructive">
          {t('recaps.publishLoadError')}
        </p>
      )}
    </div>
  );
}
