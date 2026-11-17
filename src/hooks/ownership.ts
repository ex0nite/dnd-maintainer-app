import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/hooks/useProfile';

/**
 * Fields to add to the INSERT of a new character for the signed-in user. A player's new character is theirs and a
 * PC (the database refuses anything else, AD-6); the DM's is unassigned. The role comes from the profile the
 * guard already loaded (no extra request): unknown role = no extra field (a player then gets a clear refusal).
 */
export async function ownerFieldsForNewCharacter(
  queryClient: QueryClient
): Promise<{ owner_user_id?: string; character_type?: 'pc' }> {
  let userId: string | undefined;
  try {
    userId = (await supabase.auth.getSession()).data.session?.user?.id;
  } catch {
    return {};
  }
  if (!userId) return {};
  const profile = queryClient.getQueryData<Profile>(['profile', userId]);
  return profile?.role === 'player' ? { owner_user_id: userId, character_type: 'pc' } : {};
}
