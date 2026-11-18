// Story 1.3: no horizontal scroll at 360 px and WCAG AA contrast, on the 3 themes in
// light and dark. Reused by later UI stories: add a page to PAGES.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { MODES, THEMES, stubBackend, useTheme } from './support';

interface PageUnderTest {
  name: string;
  path: string;
  signedIn: boolean;
  role?: 'dm' | 'player';
  /** Canned REST answers by table name (everything else is an empty list). */
  rest?: Record<string, unknown>;
  /** Something that proves the page really rendered (not a blank or error screen). */
  ready: (page: Page) => Promise<void>;
}

export const PAGES: PageUnderTest[] = [
  {
    name: 'login',
    path: '/login',
    signedIn: false,
    ready: async (page) => {
      await expect(page.getByLabel('Password')).toBeVisible();
    },
  },
  {
    name: 'home (campaign list)',
    path: '/',
    signedIn: true,
    ready: async (page) => {
      await expect(page.getByText('La mine perdue').first()).toBeVisible();
    },
  },
  {
    name: 'change password',
    path: '/change-password',
    signedIn: true,
    ready: async (page) => {
      await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'player home',
    path: '/',
    signedIn: true,
    role: 'player',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'My characters' })).toBeVisible();
    },
  },
  {
    name: 'campaign notes (player)',
    path: '/campaign/la-mine-perdue/table-notes',
    signedIn: true,
    role: 'player',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Campaign notes' }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'New shared note' })).toBeVisible();
    },
  },
  {
    name: 'campaign notes with long content and the editor open',
    path: '/campaign/la-mine-perdue/table-notes',
    signedIn: true,
    role: 'player',
    rest: {
      notes_shared: [
        {
          id: 'n1',
          campaign_id: '11111111-1111-4111-8111-111111111111',
          author_id: 'e2e-user',
          title: 'https://example.com/a/very/long/address/that/has/no/spaces/at/all/and/keeps/going/and/going/forever',
          category: 'quest',
          pinned: true,
          body: 'Une très longue ligne sans espace: ' + 'x'.repeat(300),
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    },
    ready: async (page) => {
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      await page.getByRole('button', { name: 'New shared note' }).click();
      await expect(page.getByLabel('Title')).toBeVisible();
    },
  },
  {
    name: 'recaps list (player)',
    path: '/campaign/la-mine-perdue/recaps',
    signedIn: true,
    role: 'player',
    rest: {
      sessions: [
        {
          id: 's1',
          slug: 'session-1',
          campaign_id: '11111111-1111-4111-8111-111111111111',
          session_number: 1,
          name: 'La descente dans la mine abandonnée avec un titre vraiment très long pour tester',
          date: '2026-01-10',
        },
      ],
    },
    ready: async (page) => {
      await expect(page.getByRole('link', { name: /Session 1/ })).toBeVisible();
    },
  },
  {
    name: 'recap with comments (player)',
    path: '/campaign/la-mine-perdue/recaps/session-1',
    signedIn: true,
    role: 'player',
    rest: {
      sessions: {
        id: 's1',
        slug: 'session-1',
        campaign_id: '11111111-1111-4111-8111-111111111111',
        session_number: 1,
        name: 'La descente',
        date: '2026-01-10',
        summary: 'Le groupe est entré dans la mine. ' + 'x'.repeat(300),
      },
      session_comments: [
        {
          id: 'c1',
          campaign_id: '11111111-1111-4111-8111-111111111111',
          session_id: 's1',
          author_id: 'e2e-user',
          body: 'Super séance ! https://example.com/a/very/long/address/without/any/space/at/all/for/the/test/ok',
          created_at: '2026-01-11T00:00:00Z',
          updated_at: '2026-01-11T00:00:00Z',
        },
      ],
    },
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: /Session 1/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      await expect(page.getByLabel('Add a comment')).toBeVisible();
    },
  },
  {
    // Story 9.3: the rules library card (an override, an entry waiting for review, an ignored entry).
    name: 'campaign dashboard (DM)',
    path: '/campaign/la-mine-perdue',
    signedIn: true,
    role: 'dm',
    rest: {
      rule_entries: [
        {
          ruleset: '2024',
          kind: 'feat',
          id: 'alert',
          revision: 2,
          content: {
            schema: 1,
            kind: 'feat',
            id: 'alert',
            name: { en: 'Alert (table version)', fr: 'Vigilant (version de la table)' },
            body: { category: 'origin', prerequisites: [], grants: [] },
          },
        },
        {
          ruleset: '2024',
          kind: 'subclass',
          id: 'circle-of-testing-with-a-rather-long-identifier',
          revision: 1,
          content: {
            schema: 1,
            kind: 'subclass',
            id: 'circle-of-testing-with-a-rather-long-identifier',
            name: { en: 'Circle of Testing', fr: 'Cercle du Test' },
            needsReview: ['feature levels read from a scan, to confirm against the book before use'],
            body: { class: 'druid', chosenAtClassLevel: 3, features: [] },
          },
        },
        { ruleset: '2024', kind: 'feat', id: 'broken-feat', revision: 1, content: { schema: 1, kind: 'feat' } },
      ],
    },
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Rules library' })).toBeVisible();
      await expect(page.getByText('Alert (table version) (feat)')).toBeVisible();
    },
  },
  {
    name: 'players',
    path: '/players',
    signedIn: true,
    role: 'dm',
    ready: async (page) => {
      await expect(page.getByLabel('Pseudo')).toBeVisible();
    },
  },
];

for (const pageUnderTest of PAGES) {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      test(`${pageUnderTest.name} · ${theme} · ${mode}`, async ({ page }) => {
        await stubBackend(page, {
          signedIn: pageUnderTest.signedIn,
          role: pageUnderTest.role,
          rest: pageUnderTest.rest,
        });
        await useTheme(page, theme, mode);
        await page.goto(pageUnderTest.path);
        await pageUnderTest.ready(page);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, 'no horizontal page scroll at 360 px').toBeLessThanOrEqual(overflow.clientWidth);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
        expect(summary).toEqual([]);
      });
    }
  }
}

// Story 1.3, criterion 1: a visitor without a session is sent to the sign-in page and no
// campaign data is requested.
// French is longer than English: every page must still fit 360 px (story 6.2). The page is not read by its English
// texts here, only given time to render.
for (const pageUnderTest of PAGES) {
  test(`${pageUnderTest.name} · French · no horizontal scroll`, async ({ page }) => {
    await stubBackend(page, {
      signedIn: pageUnderTest.signedIn,
      role: pageUnderTest.role,
      rest: pageUnderTest.rest,
      language: 'fr',
    });
    await page.goto(pageUnderTest.path);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Missing translation');
    await expect(page.locator('main, [role="main"], form').first()).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

test('a visitor is redirected to sign-in and nothing is fetched', async ({ page }) => {
  await stubBackend(page, { signedIn: false });
  const dataRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/')) dataRequests.push(request.url());
  });

  await page.goto('/campaign/la-mine-perdue');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Password')).toBeVisible();
  expect(dataRequests).toEqual([]);
});
