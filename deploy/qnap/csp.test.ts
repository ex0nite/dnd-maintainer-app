import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module without types
import { sonnerCspHash } from '../../scripts/sonner-csp-hash.mjs';

const template = readFileSync(join(import.meta.dirname, 'gateway/security-headers.conf.template'), 'utf8');
const nginx = readFileSync(join(import.meta.dirname, 'gateway/nginx.conf'), 'utf8');
const indexHtml = readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8');

function cspDirectives(): Map<string, string[]> {
  const line = template.split('\n').find((l) => l.startsWith('add_header ${CSP_HEADER_NAME}'));
  expect(line, 'CSP line').toBeDefined();
  const value = /"([^"]+)"/.exec(line as string)?.[1] ?? '';
  const map = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

describe('gateway security headers (AD-9, AD-21)', () => {
  it('allows the style element injected by the installed sonner, and tells when it changes', () => {
    expect(cspDirectives().get('style-src')).toContain(sonnerCspHash());
  });

  it('has the AD-21 directives and no weakening', () => {
    const csp = cspDirectives();
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'", sonnerCspHash()]);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('worker-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(["'self'", 'blob:']);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    const all = [...csp.values()].flat().join(' ');
    expect(all).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
  });

  it('has exactly one CSP line, and every header comes from the template (none hard-coded in nginx.conf)', () => {
    const lines = template.split(/\r?\n/).filter((l) => !l.startsWith('#'));
    expect(lines.filter((l) => l.startsWith('add_header ${CSP_HEADER_NAME}'))).toHaveLength(1);
    expect(lines.filter((l) => /content-security-policy/i.test(l))).toHaveLength(0);
    expect(nginx).not.toMatch(
      /add_header\s+(Content-Security-Policy|Strict-Transport-Security|X-Content-Type-Options)/i
    );
  });

  it('sets HSTS, nosniff and clickjacking headers on every response', () => {
    expect(template).toMatch(/Strict-Transport-Security "max-age=\d+"/);
    const directives = template.split(/\r?\n/).filter((l) => l.startsWith('add_header'));
    expect(directives.join(' ')).not.toMatch(/includeSubDomains/);
    expect(template).toMatch(/X-Content-Type-Options "nosniff"/);
    expect(template).toMatch(/X-Frame-Options "DENY"/);
    expect(template).toMatch(/Referrer-Policy/);
  });

  it('includes the headers in the server and in every location that sets its own add_header', () => {
    // nginx drops inherited add_header lines as soon as a location defines one.
    const locations = nginx.split(/\n\s+location /).slice(1);
    const withOwnHeader = locations.filter((block) => block.includes('add_header'));
    expect(withOwnHeader.length).toBeGreaterThan(0);
    for (const block of withOwnHeader) {
      expect(block, block.split('\n')[0]).toContain('include /etc/nginx/conf.d/security-headers.conf;');
    }
    expect(nginx.split('server {')[1]).toContain('include /etc/nginx/conf.d/security-headers.conf;');
  });

  it('rewrites the client address instead of appending it (a forged header is overwritten)', () => {
    expect(nginx).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(nginx).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(nginx).not.toContain('$proxy_add_x_forwarded_for');
  });
});

describe('index.html (AD-21)', () => {
  it('has no inline script: the theme bootstrap is a static file', () => {
    const inline = [...indexHtml.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
    expect(inline).toHaveLength(0);
    expect(indexHtml).toContain('src="/theme-init.js"');
  });
});
