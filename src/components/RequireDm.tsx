import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { useRole } from '@/hooks/usePermissions';

/** Routes below it are the DM's: a player is sent home. (The database refuses the data anyway.) */
export function RequireDm() {
  const { isPlayer } = useRole();
  // The pages below read the Layout's outlet context (campaign slug, page title): hand it down.
  const context = useOutletContext();
  if (isPlayer) return <Navigate to="/" replace />;
  return <Outlet context={context} />;
}
