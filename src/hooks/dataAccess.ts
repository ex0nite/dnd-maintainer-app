// Plain data-access functions used by pages that run their own useQuery/useMutation.
// Only src/hooks/ talks to Supabase (AD-1); pages call these instead of the client.
import { supabase } from '@/lib/supabase';
import { NOTE_DETAIL_COLS } from '@/lib/query-columns';
import type { Note, Session } from '@/types/database';
import type { Json, TablesUpdate } from '@/types/supabase';
import type { ThemeId } from '@/lib/theme';

// --- Campaigns ---

export async function fetchCharacterCounts(): Promise<Record<string, { pc: number; npc: number }>> {
  const { data, error } = await supabase.from('characters').select('campaign_id, character_type');
  if (error) throw error;

  const counts: Record<string, { pc: number; npc: number }> = {};
  data.forEach((char) => {
    if (!counts[char.campaign_id]) {
      counts[char.campaign_id] = { pc: 0, npc: 0 };
    }
    if (char.character_type === 'npc') {
      counts[char.campaign_id].npc++;
    } else {
      counts[char.campaign_id].pc++;
    }
  });
  return counts;
}

export async function fetchSessionCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('sessions').select('campaign_id');
  if (error) throw error;

  const counts: Record<string, number> = {};
  data.forEach((session) => {
    counts[session.campaign_id] = (counts[session.campaign_id] || 0) + 1;
  });
  return counts;
}

export async function updateCampaignTheme(campaignId: string, theme: ThemeId | null): Promise<void> {
  const { error } = await supabase.from('campaigns').update({ theme }).eq('id', campaignId);
  if (error) throw error;
}

// --- Sessions ---

export async function fetchTotalXp(campaignId: string): Promise<number> {
  const { data, error } = await supabase.from('sessions').select('experience_awarded').eq('campaign_id', campaignId);

  if (error) throw error;
  return data.reduce((sum, session) => sum + (session.experience_awarded || 0), 0);
}

export async function insertSession(
  campaignId: string,
  session: { name: string; session_number: number; date: string }
) {
  const { data, error } = await supabase
    .from('sessions')
    .insert([
      {
        campaign_id: campaignId,
        name: session.name,
        session_number: session.session_number,
        date: session.date,
      },
    ])
    .select();

  if (error) throw error;
  return data[0];
}

export async function updateSessionFields(sessionId: string, updates: Partial<Session>): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update(updates as unknown as TablesUpdate<'sessions'>)
    .eq('id', sessionId);

  if (error) throw error;
}

export async function updateSessionDmNotes(sessionId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ notes: content.trim() || null })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function updateSessionLoot(sessionId: string, loot: unknown[]): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ loot: loot as unknown as Json })
    .eq('id', sessionId);

  if (error) throw error;
}

// --- Notes ---

export async function fetchFullNotes(campaignId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_DETAIL_COLS)
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as unknown as Note[];
}

export async function insertNote(
  campaignId: string,
  noteData: { title: string; content: string; category: string; tags: string; pinned: boolean }
) {
  const { data, error } = await supabase
    .from('notes')
    .insert([
      {
        campaign_id: campaignId,
        title: noteData.title,
        content: noteData.content,
        category: noteData.category,
        tags: noteData.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
        is_pinned: noteData.pinned,
      },
    ])
    .select();

  if (error) throw error;
  return data[0];
}

export async function updateNoteFields(noteId: string, noteData: Partial<Note>): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update(noteData as unknown as TablesUpdate<'notes'>)
    .eq('id', noteId);

  if (error) throw error;
}

export async function deleteNoteById(noteId: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', noteId);
  if (error) throw error;
}

// --- Export ---

// Full export: all columns needed, select('*') is intentional.
export async function fetchExportTables(ids: string[]) {
  const [campaignsRes, charactersRes, sessionsRes, encountersRes, notesRes] = await Promise.all([
    supabase.from('campaigns').select('*').in('id', ids),
    supabase.from('characters').select('*').in('campaign_id', ids),
    supabase.from('sessions').select('*').in('campaign_id', ids),
    supabase.from('encounters').select('*').in('campaign_id', ids),
    supabase.from('notes').select('*').in('campaign_id', ids),
  ]);
  return { campaignsRes, charactersRes, sessionsRes, encountersRes, notesRes };
}

export async function fetchExportCharacterTables(characterIds: string[]) {
  const [buildLevelsRes, itemsRes] = await Promise.all([
    supabase
      .from('character_build_levels')
      .select('*')
      .in('character_id', characterIds)
      .is('deleted_at', null)
      .order('character_id')
      .order('sequence'),
    supabase.from('character_items').select('*').in('character_id', characterIds),
  ]);
  return { buildLevelsRes, itemsRes };
}
