import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionComments } from '@/components/SessionComments';
import { useCampaignContext } from '@/hooks/useCampaignContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePublishedRecap } from '@/hooks/useRecaps';

/** One published recap, shown as plain escaped text, with its comments (stories 5.2, 5.3). */
export default function RecapDetail() {
  const { t, i18n } = useTranslation('common');
  const { sessionSlug } = useParams<{ sessionSlug: string }>();
  const { campaignId, campaignSlug } = useCampaignContext();
  const { data: recap, isLoading, isError } = usePublishedRecap(campaignId, sessionSlug);
  usePageTitle(recap?.name ?? t('recaps.title'));

  return (
    <div className="page-container max-w-3xl space-y-4">
      <Link
        to={`/campaign/${campaignSlug}/recaps`}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('recaps.back')}
      </Link>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('recaps.loadError')}
        </p>
      ) : !recap ? (
        // Not published, another campaign, or no such session: the database returns nothing, the page says so.
        <p className="text-muted-foreground">{t('recaps.notFound')}</p>
      ) : (
        <>
          <header className="space-y-1">
            <h1 className="page-title [overflow-wrap:anywhere]">
              {recap.name
                ? t('recaps.sessionHeading', { number: recap.session_number, title: recap.name })
                : t('recaps.sessionHeadingNoTitle', { number: recap.session_number })}
            </h1>
            {recap.date && (
              <p className="text-sm text-muted-foreground">
                {new Date(`${recap.date}T00:00:00`).toLocaleDateString(i18n.language)}
              </p>
            )}
          </header>
          {/* Plain text: React escapes it, line breaks are kept. */}
          <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{recap.summary}</p>
          <SessionComments sessionId={recap.id} campaignId={recap.campaign_id} />
        </>
      )}
    </div>
  );
}
