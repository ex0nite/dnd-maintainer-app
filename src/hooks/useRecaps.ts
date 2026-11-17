import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { validateSlug } from '@/lib/slug-utils';

/** Epic 5: published session recaps (read by the members) and their comments (D-14). Plain text everywhere. */
export const COMMENT_BODY_MAX = 2000;

export interface RecapSummary {
  id: string;
  slug: string;
  campaign_id: string;
  session_number: number;
  name: string | null;
  date: string | null;
}

export interface Recap extends RecapSummary {
  summary: string | null;
}

export interface SessionComment {
  id: string;
  campaign_id: string;
  session_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

const RECAP_LIST_COLS = 'id, slug, campaign_id, session_number, name, date';
const COMMENT_COLS = 'id, campaign_id, session_id, author_id, body, created_at, updated_at';

/** A write refused by row-level security touches 0 rows WITHOUT an error: count them. */
function assertOneRow(data: unknown[] | null, what: string): void {
  if (!data || data.length !== 1) throw new Error(`${what} (0 rows affected)`);
}

/**
 * The published recaps of a campaign. `summary_published` is filtered here too (not only by the database): the DM
 * reads every session, the list must still show what the players see.
 */
export function usePublishedRecaps(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['recaps', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select(RECAP_LIST_COLS)
        .eq('campaign_id', campaignId!)
        .eq('summary_published', true)
        .order('session_number', { ascending: false });
      if (error) throw error;
      return (data || []) as RecapSummary[];
    },
  });
}

export function usePublishedRecap(campaignId: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: ['recap', campaignId, slug],
    enabled: !!campaignId && !!slug,
    queryFn: async () => {
      const safe = validateSlug(slug!);
      const { data, error } = await supabase
        .from('sessions')
        .select(`${RECAP_LIST_COLS}, summary`)
        .eq('campaign_id', campaignId!)
        .eq('summary_published', true)
        .or(`slug.eq.${safe},previous_slugs.cs.{"${safe}"}`)
        .maybeSingle();
      if (error) throw error;
      return (data as Recap | null) ?? null;
    },
  });
}

/** The DM's switch: is the recap of this session published? Separate from the session form (never overwritten by it). */
export function useRecapPublished(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['recap-published', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase.from('sessions').select('summary_published').eq('id', sessionId!).single();
      if (error) throw error;
      return data.summary_published;
    },
  });
}

export function useSetRecapPublished(sessionId: string | undefined, campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (published: boolean) => {
      const { data, error } = await supabase
        .from('sessions')
        .update({ summary_published: published })
        .eq('id', sessionId!)
        .select('id');
      if (error) throw error;
      assertOneRow(data, 'Recap publication not changed');
      return published;
    },
    onSuccess: (published) => {
      queryClient.setQueryData(['recap-published', sessionId], published);
      queryClient.invalidateQueries({ queryKey: ['recaps', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['recap'] });
    },
  });
}

export function useSessionComments(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-comments', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_comments')
        .select(COMMENT_COLS)
        .eq('session_id', sessionId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as SessionComment[];
    },
  });
}

export function useAddComment(sessionId: string | undefined, campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      // author_id is the database default (auth.uid()): the client never states who wrote.
      const { error } = await supabase
        .from('session_comments')
        .insert({ campaign_id: campaignId!, session_id: sessionId!, body });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-comments', sessionId] }),
  });
}

export function useUpdateComment(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase.from('session_comments').update({ body }).eq('id', id).select('id');
      if (error) throw error;
      assertOneRow(data, 'Comment not updated');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-comments', sessionId] }),
  });
}

export function useDeleteComment(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('session_comments').delete().eq('id', id).select('id');
      if (error) throw error;
      assertOneRow(data, 'Comment not deleted');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-comments', sessionId] }),
  });
}
