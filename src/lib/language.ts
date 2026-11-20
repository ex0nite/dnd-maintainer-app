/** Interface languages (story 6.2): French by default, English on request, remembered on the device. */
export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'fr';
export const LANGUAGE_STORAGE_KEY = 'dnd-language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * The language to start with: the one chosen on this device, else French. The unit tests and the BDD suite (no
 * browser, `MODE === 'test'` or no `localStorage`) keep English, the language their expectations are written in.
 */
export function initialLanguage(): Language {
  try {
    if (typeof localStorage === 'undefined') return 'en';
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
    if (import.meta.env?.MODE === 'test') return 'en';
  } catch {
    // Storage blocked (private window): fall through to the default.
  }
  return DEFAULT_LANGUAGE;
}

/** Remember the choice (best effort: the page still switches when the storage is not available). */
export function rememberLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Not remembered: the choice only lasts for this visit.
  }
}
