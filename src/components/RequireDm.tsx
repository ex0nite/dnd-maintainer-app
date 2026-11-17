import { Link, Outlet, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRole } from '@/hooks/usePermissions';

function AccessDenied() {
  const { t } = useTranslation('common');
  usePageTitle(t('access.deniedTitle'));
  return (
    <div className="page-container max-w-xl space-y-3">
      <h1 className="page-title">{t('access.deniedTitle')}</h1>
      <p role="alert" className="text-muted-foreground">
        {t('access.deniedText')}
      </p>
      <Link to="/" className="inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline">
        {t('access.backHome')}
      </Link>
    </div>
  );
}

/**
 * Routes below it are the DM's. Only the DM gets in: a player, but also anybody whose role could not be read (fail
 * closed: nothing of the DM's pages is mounted, so nothing is requested). This is only the interface: the real
 * protection is the database (a direct request is refused by the policies, FR-7).
 */
export function RequireDm() {
  const { isDm, isLoading } = useRole();
  // The pages below read the Layout's outlet context (campaign slug, page title): hand it down.
  const context = useOutletContext();
  if (isLoading) return null;
  if (!isDm) return <AccessDenied />;
  return <Outlet context={context} />;
}
