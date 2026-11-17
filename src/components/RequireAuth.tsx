import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Skeleton } from '@/components/ui/skeleton';

export const CHANGE_PASSWORD_PATH = '/change-password';

function Loading() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Skeleton className="h-8 w-64" />
    </div>
  );
}

/**
 * Route guard: nothing below it renders (nor fetches) without a session, and a player on a temporary password
 * can only reach the password-change page (the database refuses their data reads anyway: is_active_user()).
 */
export function RequireAuth() {
  const { session, isLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();

  if (isLoading) return <Loading />;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (profileLoading) return <Loading />;
  if (profile?.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return <Outlet />;
}
