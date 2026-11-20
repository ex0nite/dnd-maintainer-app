import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, ScrollText } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useMyCharacters } from '@/hooks/useCharacters';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PortraitImage } from '@/components/PortraitImage';

/**
 * The player's home (story 3.2): "My characters" grouped by campaign, and the places where notes (epic 4) and
 * session recaps (epic 5) will appear. Completed by story 6.1.
 */
export default function PlayerHome() {
  const { t } = useTranslation('common');
  usePageTitle(t('playerHome.title'));
  const { data: campaigns = [], isLoading: campaignsLoading, isError: campaignsError } = useCampaigns();
  const { data: characters = [], isLoading: charactersLoading, isError } = useMyCharacters();

  if (campaignsLoading || charactersLoading) {
    return (
      <div className="page-container space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (campaignsError) {
    return (
      <div className="page-container max-w-xl space-y-3">
        <h1 className="page-title">{t('playerHome.title')}</h1>
        <p role="alert" className="text-sm text-destructive">
          {t('playerHome.loadError')}
        </p>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="page-container max-w-xl space-y-3">
        <h1 className="page-title">{t('playerHome.title')}</h1>
        <p className="text-muted-foreground">{t('playerHome.noCampaign')}</p>
      </div>
    );
  }

  return (
    <div className="page-container max-w-3xl space-y-8">
      <h1 className="page-title">{t('playerHome.title')}</h1>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('playerHome.loadError')}
        </p>
      )}

      <section aria-labelledby="my-characters" className="space-y-6">
        <h2 id="my-characters" className="text-xl font-semibold">
          {t('playerHome.myCharacters')}
        </h2>
        {campaigns.map((campaign) => {
          const mine = characters.filter((c) => c.campaign_id === campaign.id);
          return (
            <div key={campaign.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{campaign.name}</h3>
                <Link
                  to={`/campaign/${campaign.slug}/character/new`}
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t('playerHome.createCharacter')}
                </Link>
              </div>
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('playerHome.noCharacter')}</p>
              ) : (
                <ul className="divide-y">
                  {mine.map((character) => (
                    <li key={character.id}>
                      <Link
                        to={
                          character.status === 'draft'
                            ? `/campaign/${campaign.slug}/character/${character.slug}/edit`
                            : `/campaign/${campaign.slug}/character/${character.slug}`
                        }
                        className="flex items-center gap-3 py-2 hover:bg-muted/50"
                      >
                        {character.portrait_url ? (
                          <PortraitImage
                            stored={character.portrait_url}
                            alt=""
                            className="block size-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground"
                          >
                            {character.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{character.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t('playerHome.levelLine', { level: character.level ?? 1 })}
                          </span>
                        </span>
                        {character.status === 'draft' && (
                          <Badge variant="outline">{t('characterList.draftBadge')}</Badge>
                        )}
                        {character.is_active === false && <Badge variant="outline">{t('playerHome.inactive')}</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to={`/campaign/${campaign.slug}/characters`}
                className="inline-block text-sm text-primary underline-offset-2 hover:underline"
              >
                {t('playerHome.tableCharacters')}
              </Link>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="my-notes" className="space-y-2 rounded-lg border border-dashed p-4">
        <h2 id="my-notes" className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText className="size-5" aria-hidden="true" />
          {t('playerHome.notes')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('playerHome.comingSoon')}</p>
      </section>

      <section aria-labelledby="my-sessions" className="space-y-2 rounded-lg border border-dashed p-4">
        <h2 id="my-sessions" className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="size-5" aria-hidden="true" />
          {t('playerHome.sessions')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('playerHome.comingSoon')}</p>
      </section>
    </div>
  );
}
