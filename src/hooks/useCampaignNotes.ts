import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** Epic 4: the players' notebook (D-10) and the table's shared notes (D-11, D-12). Plain text, capped by the database. */
export const NOTE_BODY_MAX = 10000;
export const NOTE_TITLE_MAX = 200;

export const SHARED_NOTE_CATEGORIES = ['lore', 'npc', 'location', 'quest', 'item', 'general'] as const;
export type SharedNoteCategory = (typeof SHARED_NOTE_CATEGORIES)[number];

export interface PersonalNote {
  id: string;
  campaign_id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface SharedNote {
  id: string;
  campaign_id: string;
  author_id: string | null;
  title: string;
  category: SharedNoteCategory;
  pinned: boolean;
  body: string;
  created_at: string;
  updated_at: string;
}

const PERSONAL_COLS = 'id, campaign_id, author_id, title, body, created_at, updated_at';
const SHARED_COLS = 'id, campaign_id, author_id, title, category, pinned, body, created_at, updated_at';

/** A write refused by row-level security touches 0 rows WITHOUT an error: count them. */
function assertOneRow(data: unknown[] | null, what: string): void {
  if (!data || data.length !== 1) throw new Error(`${what} (0 rows affected)`);
}

/**
 * Personal notes of the campaign. A player gets their own notebook (the database filters), the DM gets every
 * player's notes with their author.
 */
export function usePersonalNotes(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['notes-personal', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes_personal')
        .select(PERSONAL_COLS)
        .eq('campaign_id', campaignId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PersonalNote[];
    },
  });
}

export function useCreatePersonalNote(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: { title: string; body: string }) => {
      // author_id is the database default (auth.uid()): the client never states who wrote.
      const { data, error } = await supabase
        .from('notes_personal')
        .insert({ campaign_id: campaignId!, ...note })
        .select(PERSONAL_COLS)
        .single();
      if (error) throw error;
      return data as PersonalNote;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes-personal', campaignId] }),
  });
}

export function useUpdatePersonalNote(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; title?: string; body?: string }) => {
      const { data, error } = await supabase.from('notes_personal').update(fields).eq('id', id).select('id');
      if (error) throw error;
      assertOneRow(data, 'Personal note not updated');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes-personal', campaignId] }),
  });
}

export function useDeletePersonalNote(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('notes_personal').delete().eq('id', id).select('id');
      if (error) throw error;
      assertOneRow(data, 'Personal note not deleted');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes-personal', campaignId] }),
  });
}

/** The table's shared notes, pinned first. */
export function useSharedNotes(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['notes-shared', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes_shared')
        .select(SHARED_COLS)
        .eq('campaign_id', campaignId!)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SharedNote[];
    },
  });
}

export type SharedNoteFields = Pick<SharedNote, 'title' | 'category' | 'pinned' | 'body'>;

export function useCreateSharedNote(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: SharedNoteFields) => {
      const { data, error } = await supabase
        .from('notes_shared')
        .insert({ campaign_id: campaignId!, ...note })
        .select(SHARED_COLS)
        .single();
      if (error) throw error;
      return data as SharedNote;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes-shared', campaignId] }),
  });
}

/** Last save wins (D-12): no concurrent-edit handling. */
export function useUpdateSharedNote(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<SharedNoteFields>) => {
      const { data, error } = await supabase.from('notes_shared').update(fields).eq('id', id).select('id');
      if (error) throw error;
      assertOneRow(data, 'Shared note not updated');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes-shared', campaignId] }),
  });
}

export function useDeleteSharedNote(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('notes_shared').delete().eq('id', id).select('id');
      if (error) throw error;
      assertOneRow(data, 'Shared note not deleted');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes-shared', campaignId] }),
  });
}

/** Pseudo of each author of the campaign (members and DM), by user id. Empty until loaded. */
export function useAuthorNames(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign-member-names', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('campaign_member_names', { p_campaign_id: campaignId! });
      if (error) throw error;
      return Object.fromEntries((data || []).map((row) => [row.user_id, row.pseudo])) as Record<string, string>;
    },
  });
}
