import { useTranslation } from 'react-i18next';
import { SessionComments } from '@/components/SessionComments';
import { useRecapPublished } from '@/hooks/useRecaps';

/** The comments of a session, on the DM's session page: only once the summary is published (before, nobody can write). */
export function DmRecapComments({ sessionId, campaignId }: { sessionId: string; campaignId: string }) {
  const { t } = useTranslation('common');
  const { data: published } = useRecapPublished(sessionId);
  if (!published) return <p className="text-sm text-muted-foreground">{t('recaps.commentsUnpublished')}</p>;
  return <SessionComments sessionId={sessionId} campaignId={campaignId} />;
}
