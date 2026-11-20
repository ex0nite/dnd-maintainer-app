// CSP hash of the <style> element that `sonner` injects when it is imported (story 7.4, AD-21).
//
//   node scripts/sonner-csp-hash.mjs        prints the 'sha256-...' source to put in `style-src`
//
// sonner calls `__insertCSS('<css>')` at import time, which appends a <style> whose text is that string. A CSP hash is
// the SHA-256 of exactly that text. A new sonner version usually changes the CSS, hence the hash: the unit test
// `deploy/qnap/csp.test.ts` compares this value with the one in the gateway headers and fails after an upgrade.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const INSERT_CSS_CALL = /__insertCSS\((["'`])((?:\\.|(?!\1)[^\\])*)\1\)/g;

export function sonnerStyleText() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('sonner');
  const source = readFileSync(entry.replace(/index\.js$/, 'index.mjs'), 'utf8');
  const calls = [...source.matchAll(INSERT_CSS_CALL)];
  if (calls.length !== 1) throw new Error(`expected exactly one __insertCSS call in sonner, found ${calls.length}`);
  const [, quote, body] = calls[0];
  // The argument is a plain JS string literal (no variable, no code): evaluate it as one.
  return new Function(`return ${quote}${body}${quote}`)();
}

export function sonnerCspHash() {
  return `'sha256-${createHash('sha256').update(sonnerStyleText(), 'utf8').digest('base64')}'`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${sonnerCspHash()}\n`);
}
