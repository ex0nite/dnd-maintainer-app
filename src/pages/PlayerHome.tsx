import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, ScrollText } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useMyCharacters } from '@/hooks/useCharacters';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePersonalNotes, useSharedNotes } from '@/hooks/useCampaignNotes';
import { usePublishedRecaps } from '@/hooks/useRecaps';
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
  const [selectedId, setSelectedId] = useState<string | undefined>();
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

  // The campaign shown: the chosen one, or the first (the chosen one may disappear, e.g. the player was removed).
  const campaign = campaigns.find((c) => c.id === selectedId) ?? campaigns[0];

  return (
    <div className="page-container max-w-3xl space-y-8">
      <h1 className="page-title">{t('playerHome.title')}</h1>
      {campaigns.length > 1 && (
        <div className="space-y-1">
          <label htmlFor="home-campaign" className="text-sm font-medium">
            {t('playerHome.campaign')}
          </label>
          <select
            id="home-campaign"
            value={campaign.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="block h-11 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('playerHome.loadError')}
        </p>
      )}

      <section aria-labelledby="my-characters" className="space-y-6">
        <h2 id="my-characters" className="text-xl font-semibold">
          {t('playerHome.myCharacters')}
        </h2>
        {[campaign].map((campaign) => {
          const mine = characters.filter((c) => c.campaign_id === campaign.id);
          return (
            <div key={campaign.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{campaign.name}</h3>
                <Link
                  to={`/campaign/${campaign.slug}/character/new`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
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
                className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline"
              >
                {t('playerHome.tableCharacters')}
              </Link>
            </div>
          );
        })}
      </section>

      <PlayerHomeNotes campaignId={campaign.id} campaignSlug={campaign.slug} />
      <PlayerHomeRecaps campaignId={campaign.id} campaignSlug={campaign.slug} />
    </div>
  );
}

/** My notes and the table's shared notes of the campaign: counts and the way in (story 6.1). */
function PlayerHomeNotes({ campaignId, campaignSlug }: { campaignId: string; campaignSlug: string }) {
  const { t } = useTranslation('common');
  const personal = usePersonalNotes(campaignId);
  const shared = useSharedNotes(campaignId);
  const loading = personal.isLoading || shared.isLoading;
  return (
    <section aria-labelledby="my-notes" className="space-y-2 rounded-lg border p-4">
      <h2 id="my-notes" className="flex items-center gap-2 text-lg font-semibold">
        <ScrollText className="size-5" aria-hidden="true" />
        {t('playerHome.notes')}
      </h2>
      {loading ? (
        <Skeleton className="h-5 w-48" />
      ) : personal.isError || shared.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('playerHome.notesError')}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('playerHome.notesSummary', { personal: personal.data?.length ?? 0, shared: shared.data?.length ?? 0 })}
        </p>
      )}
      <Link
        to={`/campaign/${campaignSlug}/table-notes`}
        className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline"
      >
        {t('playerHome.openNotes')}
      </Link>
    </section>
  );
}

/** The latest published recaps of the campaign (story 6.1). */
function PlayerHomeRecaps({ campaignId, campaignSlug }: { campaignId: string; campaignSlug: string }) {
  const { t } = useTranslation('common');
  const { data: recaps = [], isError, isLoading } = usePublishedRecaps(campaignId);
  return (
    <section aria-labelledby="my-sessions" className="space-y-2 rounded-lg border p-4">
      <h2 id="my-sessions" className="flex items-center gap-2 text-lg font-semibold">
        <BookOpen className="size-5" aria-hidden="true" />
        {t('playerHome.sessions')}
      </h2>
      {isLoading ? (
        <Skeleton className="h-5 w-48" />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('playerHome.recapsError')}
        </p>
      ) : recaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('playerHome.noRecap')}</p>
      ) : (
        <ul className="divide-y">
          {recaps.slice(0, 3).map((r) => (
            <li key={r.id}>
              <Link
                to={`/campaign/${campaignSlug}/recaps/${r.slug}`}
                className="flex min-h-11 items-center py-2 text-sm hover:underline [overflow-wrap:anywhere]"
              >
                {r.name
                  ? t('recaps.sessionHeading', { number: r.session_number, title: r.name })
                  : t('recaps.sessionHeadingNoTitle', { number: r.session_number })}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to={`/campaign/${campaignSlug}/recaps`}
        className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline"
      >
        {t('playerHome.allRecaps')}
      </Link>
    </section>
  );
}
