import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignContext } from '@/hooks/useCampaignContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePublishedRecaps } from '@/hooks/useRecaps';

/** The published session recaps of the campaign: title and date, nothing more (story 5.2). */
export default function Recaps() {
  const { t, i18n } = useTranslation('common');
  const { campaignId, campaignSlug } = useCampaignContext();
  const { data: recaps = [], isLoading, isError } = usePublishedRecaps(campaignId);
  usePageTitle(t('recaps.title'));

  return (
    <div className="page-container max-w-3xl space-y-4">
      <h1 className="page-title">{t('recaps.title')}</h1>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('recaps.loadError')}
        </p>
      ) : recaps.length === 0 ? (
        <p className="text-muted-foreground">{t('recaps.none')}</p>
      ) : (
        <ul className="space-y-3">
          {recaps.map((r) => (
            <li key={r.id}>
              <Link
                to={`/campaign/${campaignSlug}/recaps/${r.slug}`}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-accent"
              >
                <BookOpen className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block font-semibold [overflow-wrap:anywhere]">
                    {r.name
                      ? t('recaps.sessionHeading', { number: r.session_number, title: r.name })
                      : t('recaps.sessionHeadingNoTitle', { number: r.session_number })}
                  </span>
                  {r.date && (
                    <span className="block text-xs text-muted-foreground">
                      {new Date(`${r.date}T00:00:00`).toLocaleDateString(i18n.language)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
