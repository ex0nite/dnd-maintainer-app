// What the outside world can and cannot do through the gateway (stories 7.2 to 7.4). Run against the stack.
//
//   BASE_URL=http://127.0.0.1:8081 ANON_KEY=... node deploy/qnap/smoke.mjs
//
// It only uses the PUBLIC key, like any visitor. It prints one line per check and exits 1 on the first failure
// at the end of the run. No key, no address is printed.

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/$/, '');
const ANON_KEY = process.env.ANON_KEY ?? '';
if (!BASE_URL || !ANON_KEY) {
  process.stderr.write('Missing BASE_URL or ANON_KEY\n');
  process.exit(2);
}

const headersFor = (extra = {}) => ({ apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, ...extra });
let failures = 0;

async function check(name, fn) {
  try {
    const problem = await fn();
    if (problem) {
      failures += 1;
      process.stdout.write(`FAIL  ${name}: ${problem}\n`);
    } else {
      process.stdout.write(`ok    ${name}\n`);
    }
  } catch (e) {
    failures += 1;
    process.stdout.write(`FAIL  ${name}: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

await check('the gateway answers', async () => {
  const res = await fetch(`${BASE_URL}/healthz`);
  return res.ok ? null : `status ${res.status}`;
});

await check(
  'the site is served with the security headers (HSTS, nosniff, frame-ancestors none, CSP without unsafe-*)',
  async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) return `status ${res.status}`;
    const csp =
      res.headers.get('content-security-policy') ?? res.headers.get('content-security-policy-report-only') ?? '';
    if (!/frame-ancestors 'none'/.test(csp)) return "CSP lacks frame-ancestors 'none'";
    if (/unsafe-inline|unsafe-eval/.test(csp)) return 'CSP allows unsafe-inline or unsafe-eval';
    if (!/max-age=\d+/.test(res.headers.get('strict-transport-security') ?? '')) return 'no HSTS';
    if (res.headers.get('x-content-type-options') !== 'nosniff') return 'no nosniff';
    return null;
  }
);

await check('the headers are also on the hashed assets and on a deep link (SPA fallback)', async () => {
  const deep = await fetch(`${BASE_URL}/campaign/some-slug/notes`);
  if (!deep.ok || !(deep.headers.get('content-type') ?? '').includes('text/html')) return `deep link: ${deep.status}`;
  if (deep.headers.get('x-content-type-options') !== 'nosniff') return 'deep link without nosniff';
  const asset = await fetch(`${BASE_URL}/assets/does-not-exist.js`);
  if (asset.status !== 404) return `missing asset answered ${asset.status}`;
  if (asset.headers.get('x-content-type-options') !== 'nosniff') return '404 without nosniff';
  return null;
});

await check('the schema description (OpenAPI) is not handed out', async () => {
  const res = await fetch(`${BASE_URL}/rest/v1/`, { headers: headersFor() });
  return res.status === 404 ? null : `status ${res.status}`;
});

await check('free sign-up is refused', async () => {
  const res = await fetch(`${BASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: headersFor({ 'content-type': 'application/json' }),
    body: JSON.stringify({ email: 'visitor@table.invalid', password: 'a-long-enough-password' }),
  });
  return res.status >= 400 && res.status < 500 ? null : `status ${res.status}`;
});

await check('the administration endpoints refuse the public key', async () => {
  const res = await fetch(`${BASE_URL}/auth/v1/admin/users`, { headers: headersFor() });
  return res.status === 401 || res.status === 403 ? null : `status ${res.status}`;
});

for (const table of [
  'campaigns',
  'characters',
  'sessions',
  'notes_personal',
  'notes_shared',
  'session_comments',
  'profiles',
]) {
  await check(`a visitor reads nothing from ${table}`, async () => {
    const res = await fetch(`${BASE_URL}/rest/v1/${table}?select=*&limit=5`, { headers: headersFor() });
    if (res.status === 401 || res.status === 403) return null;
    const body = await res.json().catch(() => null);
    return res.ok && Array.isArray(body) && body.length === 0 ? null : `status ${res.status}`;
  });
}

await check('a visitor can not list or read portraits', async () => {
  const list = await fetch(`${BASE_URL}/storage/v1/object/list/character-portraits`, {
    method: 'POST',
    headers: headersFor({ 'content-type': 'application/json' }),
    body: JSON.stringify({ prefix: '', limit: 5 }),
  });
  if (list.ok) {
    const body = await list.json().catch(() => null);
    if (!Array.isArray(body) || body.length > 0) return 'the listing returned objects';
  }
  const read = await fetch(`${BASE_URL}/storage/v1/object/public/character-portraits/anything.png`);
  return read.status === 400 || read.status === 401 || read.status === 403 || read.status === 404
    ? null
    : `public read: ${read.status}`;
});

await check(
  'a request that carries forged client-address headers is still served (the rewrite itself is proved in docs/deploy-qnap.md, section 2)',
  async () => {
    // The real proof needs two clients behind the reverse proxy (docs/deploy-qnap.md): here we only check that the gateway copes.
    const res = await fetch(`${BASE_URL}/auth/v1/settings`, {
      headers: headersFor({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.9, 198.51.100.1' }),
    });
    return res.ok ? null : `status ${res.status}`;
  }
);

if (process.env.ADMIN_API === '1') {
  await check(
    'account-admin answers its health check, and refuses an account creation without a DM token',
    async () => {
      const health = await fetch(`${BASE_URL}/admin-api/health`);
      if (!health.ok) return `health: status ${health.status}`;
      const create = await fetch(`${BASE_URL}/admin-api/accounts`, {
        method: 'POST',
        headers: headersFor({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pseudo: 'visitor', campaignId: '11111111-1111-4111-8111-111111111111' }),
      });
      return create.status === 401 || create.status === 403
        ? null
        : `create without a DM token: status ${create.status}`;
    }
  );
}

if (failures > 0) {
  process.stdout.write(`${failures} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write('all checks passed\n');
