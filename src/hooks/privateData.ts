// DM-only / owner-only data lives in `character_private` and `session_dm` (AD-5, story 1.5).
// The rest of the app keeps its flat `Character` / `Session` types: these helpers read the
// private part through a PostgREST embed and flatten it, and split a flat payload on write.
// Private rows are created by AFTER INSERT triggers: they are only ever updated here, and every
// write counts the affected rows (a write blocked by row-level security raises no error).

import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/supabase';

export const CHARACTER_PRIVATE_KEYS = ['backstory', 'notes'] as const;
export const SESSION_PRIVATE_KEYS = ['notes', 'loot', 'experience_awarded'] as const;

type Row = Record<string, unknown>;

function split(payload: Row, keys: readonly string[]): { pub: Row; priv: Row } {
  const pub: Row = {};
  const priv: Row = {};
  for (const [key, value] of Object.entries(payload)) {
    if (keys.includes(key)) priv[key] = value;
    else pub[key] = value;
  }
  return { pub, priv };
}

export function splitCharacterPrivate(payload: Row) {
  return split(payload, CHARACTER_PRIVATE_KEYS);
}

export function splitSessionPrivate(payload: Row) {
  return split(payload, SESSION_PRIVATE_KEYS);
}

// PostgREST returns a one-to-one embed as an object (the key is the primary key); accept a
// one-element array too.
function embedded(row: Row, key: string): Row {
  const value = row[key];
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? {};
  return (value as Row | null | undefined) ?? {};
}

export function flattenCharacter<T>(row: unknown): T {
  const { character_private: _embed, ...rest } = row as Row;
  void _embed;
  const priv = embedded(row as Row, 'character_private');
  return { ...rest, backstory: priv.backstory ?? null, notes: priv.notes ?? null } as T;
}

export function flattenSession<T>(row: unknown): T {
  const { session_dm: _embed, ...rest } = row as Row;
  void _embed;
  const priv = embedded(row as Row, 'session_dm');
  return {
    ...rest,
    experience_awarded: (priv.experience_awarded as number | undefined) ?? 0,
    loot: priv.loot ?? null,
    notes: priv.notes ?? null,
  } as T;
}

/**
 * Compensation for a create whose private half failed: delete the row that was just inserted so
 * no half-created record (and no duplicate on retry) is left behind, then re-throw the original
 * error. supabase-js resolves on a failed delete, so a rollback failure is surfaced explicitly.
 */
export async function rollbackInsert(table: 'characters' | 'sessions', id: string, original: unknown): Promise<never> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    const message = original instanceof Error ? original.message : String(original);
    throw new Error(
      `Private data write failed and rollback also failed; an orphaned ${table} row (${id}) may remain. ` +
        `Original error: ${message}; rollback error: ${error.message}`,
      { cause: original }
    );
  }
  throw original;
}

export async function writeCharacterPrivate(characterId: string, priv: Row): Promise<void> {
  if (Object.keys(priv).length === 0) return;
  const { data, error } = await supabase
    .from('character_private')
    .update(priv as unknown as TablesUpdate<'character_private'>)
    .eq('character_id', characterId)
    .select('character_id');
  if (error) throw error;
  if (data.length !== 1) throw new Error('Character private data was not updated (0 rows affected)');
}

export async function writeSessionDm(sessionId: string, priv: Row): Promise<void> {
  if (Object.keys(priv).length === 0) return;
  const { data, error } = await supabase
    .from('session_dm')
    .update(priv as unknown as TablesUpdate<'session_dm'>)
    .eq('session_id', sessionId)
    .select('session_id');
  if (error) throw error;
  if (data.length !== 1) throw new Error('Session DM data was not updated (0 rows affected)');
}
