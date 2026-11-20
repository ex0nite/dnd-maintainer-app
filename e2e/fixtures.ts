import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test as base } from '@playwright/test';

// Every e2e test runs under the production Content-Security-Policy (story 7.4, AD-21) and fails on any violation.
// The policy is read from the gateway's header template, so what is tested is what is deployed. The only difference:
// the stubbed backend lives on another origin in the test build, so that origin is added to `connect-src`.

const BACKEND_ORIGIN = 'http://127.0.0.1:54321';
const APP_PORT = '5199';

function productionCsp(): string {
  const template = readFileSync(
    join(import.meta.dirname, '../deploy/qnap/gateway/security-headers.conf.template'),
    'utf8'
  );
  const line = template.split(/\r?\n/).find((l) => l.startsWith('add_header ${CSP_HEADER_NAME}'));
  const value = /"([^"]+)"/.exec(line ?? '')?.[1];
  if (!value) throw new Error('CSP not found in security-headers.conf.template');
  return value.replace("connect-src 'self'", `connect-src 'self' ${BACKEND_ORIGIN}`);
}

const CSP = productionCsp();

interface PageWindow {
  __csp?: string[];
}

export const test = base.extend<{ csp: void }>({
  csp: [
    async ({ page }, use) => {
      // Serve every page of the app with the policy (blocking, not report-only).
      await page.route(
        (url) => url.port === APP_PORT,
        async (route) => {
          if (route.request().resourceType() !== 'document') return route.fallback();
          const response = await route.fetch();
          return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP } });
        }
      );

      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const store = ((window as unknown as PageWindow).__csp ??= []);
          const where = event.sourceFile ? ` at ${event.sourceFile.split('/').pop()}:${event.lineNumber}` : '';
          store.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}${where}`);
        });
      });

      await use();

      // A page that closed or crashed has nothing to read; any other failure must fail the test (no silent pass).
      if (page.isClosed()) return;
      const { violations, styleElements, withoutSheet } = await page.evaluate(() => {
        const styles = [...document.querySelectorAll('style')];
        return {
          violations: (window as unknown as PageWindow).__csp ?? [],
          styleElements: styles.length,
          // A <style> blocked by the policy gets no stylesheet at all (`.sheet` is null).
          withoutSheet: styles.filter((s) => s.sheet === null).length,
        };
      });

      // `sonner` appends its (empty) <style> to <head> and fills it afterwards: Chromium reports the empty element as
      // `style-src-elem` although the filled one matches the hash and is applied. Exactly that one event per document
      // is expected, and only while exactly one <style> exists (sonner's): a second style element, whoever injects it,
      // is a real violation, and so is any <style> without a stylesheet.
      const sonnerNoise = /^style-src-elem blocked inline at index-[\w-]+\.js:\d+$/;
      const noise = violations.filter((v) => sonnerNoise.test(v));
      const real = violations.filter((v) => !sonnerNoise.test(v));
      expect(real, 'Content-Security-Policy violations').toEqual([]);
      expect(noise.length, 'sonner style-src-elem events').toBeLessThanOrEqual(1);
      expect(styleElements, '<style> elements in the page').toBeLessThanOrEqual(1);
      expect(withoutSheet, '<style> elements blocked by the policy').toBe(0);
    },
    { auto: true },
  ],
});

export { expect };
