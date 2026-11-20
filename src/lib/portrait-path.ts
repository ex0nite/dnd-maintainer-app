// The portraits bucket is private (story 1.7): the database keeps the storage PATH of a portrait and the
// browser asks for a short-lived signed URL. Rows written before that stored the old public URL, so both
// shapes are accepted.

export const PORTRAIT_BUCKET = 'character-portraits';

/** A new object name for a character: `<character-id>/<random-uuid>.jpg` (story 3.8). Never reused, so a replacement is a new object. */
export function newPortraitPath(characterId: string): string {
  return `${characterId}/${crypto.randomUUID()}.jpg`;
}

const OBJECT_NAME =
  /^[0-9a-f-]{36}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)|portrait\.jpg)$/;

/**
 * The storage path of a stored portrait value, only if it really is an object of THIS character (new or legacy name).
 * Used before deleting: a stored value pointing anywhere else must never make us delete another character's portrait.
 */
export function ownPortraitPath(characterId: string, stored: string | null | undefined): string | null {
  const path = portraitStoragePath(stored);
  if (!path || !path.startsWith(`${characterId}/`)) return null;
  return OBJECT_NAME.test(path) ? path : null;
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
