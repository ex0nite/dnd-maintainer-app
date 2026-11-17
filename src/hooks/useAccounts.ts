import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AdminApiError, createPlayer, type CreatedPlayer } from '@/lib/admin-api';

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new AdminApiError(401, 'unauthorized');
  return data.session.access_token;
}

/** The DM creates a player account on a temporary password (FR1). The result is shown once, never cached. */
export function useCreatePlayer() {
  return useMutation<CreatedPlayer, AdminApiError, { pseudo: string; campaignId: string }>({
    mutationFn: async (input) => createPlayer(await accessToken(), input),
    // The temporary password must not linger in the query cache after the screen is left.
    gcTime: 0,
  });
}
