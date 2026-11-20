import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

/**
 * What the interface shows for the signed-in user. This is only the INTERFACE: the database refuses what the user
 * may not do (RLS, AD-4), these flags just keep the screens free of buttons that would only fail.
 *
 * Until the profile is known the user is NOT treated as a player (nothing is hidden), because hiding is cosmetic
 * and a wrong "player" verdict would break the DM's screens; the guard `RequireAuth` waits for the profile anyway.
 */
export function useRole() {
  const { session } = useAuth();
  const { data: profile, isLoading } = useProfile();
  return {
    userId: session?.user?.id,
    role: profile?.role ?? null,
    isPlayer: profile?.role === 'player',
    isDm: profile?.role === 'dm',
    isLoading,
  };
}

export interface CharacterPermissions {
  /** The sheet can be edited (the DM always, a player on their own active character). */
  canEdit: boolean;
  /** DM-only commands: clone, archive, delete, reassign, type, activation. */
  canManage: boolean;
  isOwner: boolean;
}

export function useCharacterPermissions(
  character: { owner_user_id?: string | null; is_active?: boolean } | undefined
): CharacterPermissions {
  const { userId, isPlayer } = useRole();
  const isOwner = !!userId && !!character && character.owner_user_id === userId;
  return {
    isOwner,
    canManage: !isPlayer,
    canEdit: !isPlayer || (isOwner && character?.is_active !== false),
  };
}
