// The portraits bucket is private (story 1.7): the database keeps the storage PATH of a portrait and the
// browser asks for a short-lived signed URL. Rows written before that stored the old public URL, so both
// shapes are accepted.

export const PORTRAIT_BUCKET = 'character-portraits';

export function portraitPath(characterId: string): string {
  return `${characterId}/portrait.jpg`;
}

/** Storage path of a stored portrait value (a path, or a legacy public URL); null when there is none. */
export function portraitStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const marker = `/${PORTRAIT_BUCKET}/`;
  const at = stored.indexOf(marker);
  const path = at >= 0 ? stored.slice(at + marker.length) : stored;
  const clean = path.split('?')[0];
  return clean.length > 0 ? clean : null;
}
