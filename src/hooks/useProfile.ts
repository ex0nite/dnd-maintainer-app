import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

export interface Profile {
  role: 'dm' | 'player';
  pseudo: string;
  must_change_password: boolean;
  archived_at: string | null;
}

/** The signed-in user's own profile: the only row readable even on a temporary password (AD-3). */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    // The guard waits for this: do not make a failing network hold the whole app for several backoff rounds.
    retry: 1,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, pseudo, must_change_password, archived_at')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export type ChangePasswordResult = 'ok' | 'too_short' | 'same' | 'weak' | 'unavailable';

/**
 * Change the signed-in user's own password. The database lowers `must_change_password` by itself once the
 * password really changed (trigger, story 2.3): the front only refreshes the profile afterwards.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (password: string): Promise<ChangePasswordResult> => {
      if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) return 'ok';
      const code = (error as { code?: string }).code;
      if (code === 'same_password') return 'same';
      if (code === 'weak_password') return 'weak';
      return 'unavailable';
    },
    onSuccess: async (result) => {
      if (result !== 'ok') return;
      // The database lowered the flag: say so locally at once (a failing refetch must not bounce the user back to
      // the form), then confirm with the server.
      queryClient.setQueriesData<Profile>({ queryKey: ['profile'] }, (old) =>
        old ? { ...old, must_change_password: false } : old
      );
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
  const change = useCallback((password: string) => mutation.mutateAsync(password), [mutation]);
  return { change, isPending: mutation.isPending };
}
