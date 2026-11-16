import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Session, SessionSummary } from '@/types/database';
import type { TablesInsert, TablesUpdate } from '@/types/supabase';
import {
  SESSION_SUMMARY_COLS,
  SESSION_DETAIL_COLS,
  SESSION_SUMMARY_PRIVATE_EMBED,
  SESSION_DETAIL_PRIVATE_EMBED,
} from '@/lib/query-columns';
import { flattenSession, rollbackInsert, splitSessionPrivate, writeSessionDm } from '@/hooks/privateData';
import { validateSlug } from '@/lib/slug-utils';

export function useSessions(campaignId: string) {
  return useQuery({
    queryKey: ['sessions', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select(`${SESSION_SUMMARY_COLS}, ${SESSION_SUMMARY_PRIVATE_EMBED}`)
        .eq('campaign_id', campaignId)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => flattenSession<SessionSummary>(row));
    },
    enabled: !!campaignId,
  });
}

export function useSession(slug: string | undefined) {
  return useQuery({
    queryKey: ['session', slug],
    queryFn: async () => {
      const safe = validateSlug(slug!);
      const { data, error } = await supabase
        .from('sessions')
        .select(`${SESSION_DETAIL_COLS}, ${SESSION_DETAIL_PRIVATE_EMBED}`)
        .or(`slug.eq.${safe},previous_slugs.cs.{"${safe}"}`)
        .single();
      if (error) throw error;
      return flattenSession<Session>(data);
    },
    enabled: !!slug,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: Omit<Session, 'id' | 'created_at' | 'updated_at'>) => {
      const { pub, priv } = splitSessionPrivate(session as unknown as Record<string, unknown>);
      const { data, error } = await supabase
        .from('sessions')
        .insert(pub as unknown as TablesInsert<'sessions'>)
        .select()
        .single();
      if (error) throw error;
      // The DM row exists already (trigger): fill it; if that fails, remove the new session.
      try {
        await writeSessionDm(data.id, priv);
      } catch (privateError) {
        await rollbackInsert('sessions', data.id, privateError);
      }
      return flattenSession<Session>({ ...data, session_dm: priv });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', data.campaign_id] });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Session> & { id: string }) => {
      const { pub, priv } = splitSessionPrivate(updates as unknown as Record<string, unknown>);
      let data: Record<string, unknown>;
      if (Object.keys(pub).length > 0) {
        const res = await supabase
          .from('sessions')
          .update(pub as unknown as TablesUpdate<'sessions'>)
          .eq('id', id)
          .select(`*, ${SESSION_DETAIL_PRIVATE_EMBED}`)
          .single();
        if (res.error) throw res.error;
        data = res.data as unknown as Record<string, unknown>;
        // Two tables, two writes (no transaction through PostgREST): a failure on the private half
        // is raised as is, never swallowed.
        await writeSessionDm(id, priv);
        if (Object.keys(priv).length > 0) data.session_dm = { ...(data.session_dm as object), ...priv };
      } else {
        await writeSessionDm(id, priv);
        const res = await supabase.from('sessions').select(`*, ${SESSION_DETAIL_PRIVATE_EMBED}`).eq('id', id).single();
        if (res.error) throw res.error;
        data = res.data as unknown as Record<string, unknown>;
      }
      return flattenSession<Session>(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', data.campaign_id] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.setQueryData(['session', data.slug], data);
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; campaignId: string }) => {
      const { error } = await supabase.from('sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', campaignId] });
    },
  });
}
