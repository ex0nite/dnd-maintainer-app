import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  AdminApiError,
  createPlayer,
  resetPlayerPassword,
  type CreatedPlayer,
  type ResetPassword,
} from '@/lib/admin-api';

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new AdminApiError(401, 'unauthorized');
  return data.session.access_token;
}

export type PlayerStatus = 'active' | 'temporary' | 'archived';

export interface PlayerRow {
  userId: string;
  pseudo: string;
  status: PlayerStatus;
  campaignIds: string[];
}

/** The DM's list of player accounts with their status and campaigns (RLS: only the DM reads other profiles). */
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: async (): Promise<PlayerRow[]> => {
      const [profiles, members] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, pseudo, must_change_password, archived_at')
          .eq('role', 'player')
          .order('pseudo'),
        supabase.from('campaign_members').select('campaign_id, user_id'),
      ]);
      if (profiles.error) throw profiles.error;
      if (members.error) throw members.error;
      return profiles.data.map((p) => ({
        userId: p.user_id,
        pseudo: p.pseudo,
        status: p.archived_at ? 'archived' : p.must_change_password ? 'temporary' : 'active',
        campaignIds: members.data.filter((m) => m.user_id === p.user_id).map((m) => m.campaign_id),
      }));
    },
  });
}

/** The DM creates a player account on a temporary password (FR1). The result is shown once, never cached. */
export function useCreatePlayer() {
  const queryClient = useQueryClient();
  return useMutation<CreatedPlayer, AdminApiError, { pseudo: string; campaignId: string }>({
    mutationFn: async (input) => createPlayer(await accessToken(), input),
    // The temporary password must not linger in the query cache after the screen is left.
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] }),
  });
}

/** The DM gives a player a new temporary password (FR4): the old one stops working, their sessions end. */
export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation<ResetPassword, AdminApiError, string>({
    mutationFn: async (userId) => resetPlayerPassword(await accessToken(), userId),
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] }),
  });
}
