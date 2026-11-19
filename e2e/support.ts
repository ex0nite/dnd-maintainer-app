import type { Page, Request } from '@playwright/test';

export const THEMES = ['default', 'sylvan', 'arcane'] as const;
export const MODES = ['light', 'dark'] as const;

const SUPABASE_URL = 'http://127.0.0.1:54321';

// supabase-js reads the stored session from `sb-<first host label>-auth-token`.
const STORAGE_KEY = 'sb-127-auth-token';

export function fakeJwt(): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: 'e2e-user', role: 'authenticated', exp: 4102444800 })}.sig`;
}

export const SAMPLE_CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'la-mine-perdue',
  previous_slugs: [],
  name: 'La mine perdue',
  description: 'Une campagne de test pour les contrôles automatiques.',
  setting: 'Faerûn',
  status: 'active',
  theme: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  ruleset: '2024',
  allowed_source_books: ['phb-2024'],
};

/** Pick the colour theme / mode the way the ThemeProvider stores them. */
export async function useTheme(page: Page, theme: string, mode: string): Promise<void> {
  await page.addInitScript(
    ([t, m]) => {
      localStorage.setItem('dnd-theme', t);
      localStorage.setItem('dnd-color-mode', m);
    },
    [theme, mode]
  );
}

/** Stub the whole backend: the checks look at layout and colours, not at data. */
export async function stubBackend(
  page: Page,
  opts: {
    signedIn: boolean;
    role?: 'dm' | 'player';
    /** Canned REST answers by table name; a function answers per request (a stateful stub for a journey). */
    rest?: Record<string, unknown | ((request: Request) => unknown)>;
    /** Interface language (the app starts in French on a new device, the checks read English by default). */
    language?: 'fr' | 'en' | null;
    /** A password sign-in succeeds (journeys that start from the login page). */
    loginOk?: boolean;
    /** Fields of the sample campaign to replace (the rules edition, for instance). */
    campaign?: Partial<typeof SAMPLE_CAMPAIGN>;
  }
): Promise<void> {
  // `language: null` leaves the device alone (a new device, or a choice that must survive a reload).
  if (opts.language !== null) {
    await page.addInitScript((language) => {
      if (sessionStorage.getItem('e2e-language-set') === null) {
        localStorage.setItem('dnd-language', language);
        sessionStorage.setItem('e2e-language-set', '1');
      }
    }, opts.language ?? 'en');
  }
  if (opts.signedIn) {
    await page.addInitScript(
      ([key, token]) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: token,
            refresh_token: 'e2e-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: 4102444800,
            user: { id: 'e2e-user', aud: 'authenticated', role: 'authenticated', email: 'maitre@table.invalid' },
          })
        );
      },
      [STORAGE_KEY, fakeJwt()]
    );
  }
  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (opts.role && url.pathname.startsWith('/rest/v1/profiles')) {
      // The signed-in user's own profile (read with .single(): one object, not a list).
      return route.fulfill({
        json: { role: opts.role, pseudo: 'e2e', must_change_password: false, archived_at: null },
      });
    }
    if (url.pathname.startsWith('/rest/v1/campaigns')) {
      // .single() asks for one object (PostgREST answers with the object, not a one-row list).
      const wantsObject = (route.request().headers()['accept'] ?? '').includes('application/vnd.pgrst.object');
      const campaign = { ...SAMPLE_CAMPAIGN, ...opts.campaign };
      return route.fulfill({ json: wantsObject ? campaign : [campaign] });
    }
    const table = url.pathname.replace('/rest/v1/', '').split('/')[0];
    if (opts.rest && url.pathname.startsWith('/rest/v1/') && table in opts.rest) {
      const answer = opts.rest[table];
      return route.fulfill({ json: typeof answer === 'function' ? answer(route.request()) : answer });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      return route.fulfill({ json: [] });
    }
    if (url.pathname.startsWith('/auth/v1/token') && opts.loginOk) {
      return route.fulfill({
        json: {
          access_token: fakeJwt(),
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 4102444800,
          refresh_token: 'e2e-refresh',
          user: { id: 'e2e-user', aud: 'authenticated', role: 'authenticated', email: 'alice@table.invalid' },
        },
      });
    }
    if (url.pathname === '/auth/v1/user') {
      return route.fulfill({
        json: { id: 'e2e-user', aud: 'authenticated', role: 'authenticated', email: 'alice@table.invalid' },
      });
    }
    if (url.pathname.startsWith('/auth/v1/token')) {
      return route.fulfill({
        status: 400,
        json: { error: 'invalid_grant', error_description: 'Invalid login credentials' },
      });
    }
    return route.fulfill({ status: 200, json: {} });
  });
}
