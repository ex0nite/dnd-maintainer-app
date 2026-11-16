// Story 1.3: no horizontal scroll at 360 px and WCAG AA contrast, on the 3 themes in
// light and dark. Reused by later UI stories: add a page to PAGES.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MODES, THEMES, stubBackend, useTheme } from './support';

interface PageUnderTest {
  name: string;
  path: string;
  signedIn: boolean;
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
];

for (const pageUnderTest of PAGES) {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      test(`${pageUnderTest.name} · ${theme} · ${mode}`, async ({ page }) => {
        await stubBackend(page, { signedIn: pageUnderTest.signedIn });
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
