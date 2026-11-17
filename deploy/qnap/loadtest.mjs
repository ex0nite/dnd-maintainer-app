// Load test of the stack (story 7.1, NFR4, SM-4): 5 simulated players (+ the DM) sign in, read and write for a while.
//
//   BASE_URL=http://gateway:8080 ANON_KEY=... SERVICE_ROLE_KEY=... PLAYERS=5 DURATION_S=1800 node loadtest.mjs
//
// Plain Node (>= 20), no dependency, so it runs in a bare `node:alpine` container on the stack's own Docker network.
// It creates throw-away accounts and data (names start with `lt-`) and removes them at the end. It prints a JSON summary
// of counts and latencies only: no key, no address, no password.

import { randomBytes, randomUUID } from 'node:crypto';

const BASE_URL = required('BASE_URL').replace(/\/$/, '');
const ANON_KEY = required('ANON_KEY');
const SERVICE_KEY = required('SERVICE_ROLE_KEY');
const PLAYERS = Number(process.env.PLAYERS ?? 5);
const DURATION_S = Number(process.env.DURATION_S ?? 1800);
const THINK_MIN_MS = Number(process.env.THINK_MIN_MS ?? 1000);
const THINK_MAX_MS = Number(process.env.THINK_MAX_MS ?? 4000);
const ADMIN_API = process.env.ADMIN_API === '1'; // the account-admin service is part of the stack under test

function required(name) {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Missing ${name}\n`);
    process.exit(2);
  }
  return value;
}

const stats = new Map(); // label -> { n, errors, ms: number[] }
const record = (label, ms, ok) => {
  const s = stats.get(label) ?? { n: 0, errors: 0, ms: [] };
  s.n += 1;
  if (!ok) s.errors += 1;
  s.ms.push(ms);
  stats.set(label, s);
};

async function call(label, path, { method = 'GET', key = ANON_KEY, token, body, headers = {}, raw } = {}) {
  const started = performance.now();
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        apikey: key,
        authorization: `Bearer ${token ?? key}`,
        ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch {
    record(label, performance.now() - started, false);
    return { ok: false, status: 0, data: null };
  }
  const text = await res.text();
  record(label, performance.now() - started, res.ok);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (storage errors, empty bodies): the status is what counts
  }
  return { ok: res.ok, status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS));
const admin = (label, path, opts = {}) => call(label, path, { ...opts, key: SERVICE_KEY });

// ---- setup (administration key, not counted in the figures) -----------------------------------------------------

async function setup() {
  const runId = randomBytes(3).toString('hex');
  const users = [];
  for (let i = 0; i <= PLAYERS; i += 1) {
    const isDm = i === 0;
    const email = `lt-${runId}-${isDm ? 'dm' : `p${i}`}@loadtest.invalid`;
    const password = randomBytes(18).toString('base64url');
    const created = await admin('setup', '/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password, email_confirm: true },
    });
    if (!created.ok) throw new Error(`user creation failed (${created.status})`);
    const id = created.data.id;
    const profile = await admin('setup', '/rest/v1/profiles', {
      method: 'POST',
      body: {
        user_id: id,
        pseudo: `lt-${runId}-${isDm ? 'dm' : `p${i}`}`,
        role: isDm ? 'dm' : 'player',
        must_change_password: false,
      },
    });
    if (!profile.ok) throw new Error(`profile creation failed (${profile.status}): ${JSON.stringify(profile.data)}`);
    users.push({ id, email, password, isDm });
  }
  const dm = users[0];
  const campaign = await admin('setup', '/rest/v1/campaigns', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: { name: `lt-${runId} campaign` },
  });
  if (!campaign.ok) throw new Error(`campaign creation failed (${campaign.status}): ${JSON.stringify(campaign.data)}`);
  const campaignId = campaign.data[0].id;
  const characterIds = [];
  for (const u of users.slice(1)) {
    await admin('setup', '/rest/v1/campaign_members', {
      method: 'POST',
      body: { campaign_id: campaignId, user_id: u.id },
    });
    const ch = await admin('setup', '/rest/v1/characters', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: { campaign_id: campaignId, name: `lt-${runId} hero`, character_type: 'pc', owner_user_id: u.id },
    });
    if (!ch.ok) throw new Error(`character creation failed (${ch.status}): ${JSON.stringify(ch.data)}`);
    u.characterId = ch.data[0].id;
    characterIds.push(ch.data[0].id);
  }
  const session = await admin('setup', '/rest/v1/sessions', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: { campaign_id: campaignId, session_number: 1, name: 'lt session', summary: 'Recap', summary_published: true },
  });
  if (!session.ok) throw new Error(`session creation failed (${session.status}): ${JSON.stringify(session.data)}`);
  return { runId, users, dm, campaignId, sessionId: session.data[0].id, characterIds, extraUsers: [] };
}

async function teardown(ctx) {
  await admin('teardown', `/rest/v1/campaigns?id=eq.${ctx.campaignId}`, { method: 'DELETE' });
  for (const id of [...ctx.users.map((u) => u.id), ...ctx.extraUsers]) {
    await admin('teardown', `/auth/v1/admin/users/${id}?should_soft_delete=false`, { method: 'DELETE' });
  }
}

// ---- virtual users -----------------------------------------------------------------------------------------------

// A tiny valid PNG padded to ~200 KB (portraits are limited to 1 MB by the bucket).
const PORTRAIT = Buffer.concat([
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  ),
  Buffer.alloc(200 * 1024),
]);

async function player(ctx, u, deadline) {
  const signIn = await call('sign-in', '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: u.email, password: u.password },
  });
  if (!signIn.ok) return;
  let token = signIn.data.access_token;
  let refresh = signIn.data.refresh_token;
  let lastRefresh = Date.now();
  let lastUpload = 0;
  let noteId = null;
  const auth = () => ({ token });

  while (Date.now() < deadline) {
    if (Date.now() - lastRefresh > 25 * 60 * 1000) {
      const r = await call('token-refresh', '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: refresh },
      });
      if (r.ok) {
        token = r.data.access_token;
        refresh = r.data.refresh_token;
        lastRefresh = Date.now();
      }
    }

    await call('read-profile', `/rest/v1/profiles?user_id=eq.${u.id}&select=pseudo,role`, auth());
    await call('read-characters', '/rest/v1/characters?select=id,name,status&limit=50', auth());
    await think();
    await call(
      'read-recaps',
      `/rest/v1/sessions?campaign_id=eq.${ctx.campaignId}&summary_published=eq.true&select=id,name,summary`,
      auth()
    );
    await call(
      'read-comments',
      `/rest/v1/session_comments?session_id=eq.${ctx.sessionId}&select=id,body&limit=50`,
      auth()
    );
    await think();

    if (!noteId) {
      const n = await call('write-note-create', '/rest/v1/notes_personal', {
        ...auth(),
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: { campaign_id: ctx.campaignId, title: 'lt note', body: 'first' },
      });
      noteId = n.ok ? n.data[0].id : null;
    } else {
      await call('write-note-update', `/rest/v1/notes_personal?id=eq.${noteId}`, {
        ...auth(),
        method: 'PATCH',
        body: { body: `edit ${Date.now()}` },
      });
    }
    await call('read-notes', `/rest/v1/notes_personal?campaign_id=eq.${ctx.campaignId}&select=id,title,body`, auth());
    await think();

    await call('write-comment', '/rest/v1/session_comments', {
      ...auth(),
      method: 'POST',
      body: { campaign_id: ctx.campaignId, session_id: ctx.sessionId, body: 'lt comment' },
    });
    await call(
      'read-shared-notes',
      `/rest/v1/notes_shared?campaign_id=eq.${ctx.campaignId}&select=id,title&limit=50`,
      auth()
    );

    if (Date.now() - lastUpload > 60_000) {
      lastUpload = Date.now();
      const path = `${u.characterId}/${randomUUID()}.png`;
      const up = await call('portrait-upload', `/storage/v1/object/character-portraits/${path}`, {
        ...auth(),
        method: 'POST',
        raw: true,
        body: PORTRAIT,
        headers: { 'content-type': 'image/png' },
      });
      if (up.ok) {
        await call('portrait-sign', `/storage/v1/object/sign/character-portraits/${path}`, {
          ...auth(),
          method: 'POST',
          body: { expiresIn: 60 },
        });
        await call('portrait-delete', `/storage/v1/object/character-portraits/${path}`, {
          ...auth(),
          method: 'DELETE',
        });
      }
    }
    await think();
  }
}

async function dm(ctx, deadline) {
  const signIn = await call('sign-in', '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: ctx.dm.email, password: ctx.dm.password },
  });
  if (!signIn.ok) return;
  const token = signIn.data.access_token;
  let lastCreate = 0;
  let created = 0;
  while (Date.now() < deadline) {
    if (ADMIN_API && Date.now() - lastCreate > 60_000) {
      lastCreate = Date.now();
      await call('admin-api-health', '/admin-api/health', {});
      created += 1;
      const made = await call('admin-api-create-player', '/admin-api/accounts', {
        token,
        method: 'POST',
        body: { pseudo: `lt-${ctx.runId}-x${created}`, campaignId: ctx.campaignId },
      });
      if (made.ok && made.data?.userId) ctx.extraUsers.push(made.data.userId);
    }
    await call('dm-read-campaigns', '/rest/v1/campaigns?select=id,name', { token });
    await call('dm-read-characters', '/rest/v1/characters?select=*&limit=100', { token });
    await call('dm-read-sessions', `/rest/v1/sessions?campaign_id=eq.${ctx.campaignId}&select=*`, { token });
    await sleep(3000 + Math.random() * 5000);
  }
}

// ---- run ------------------------------------------------------------------------------------------------------------

const pct = (sorted, p) =>
  sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]) : 0;

const ctx = await setup();
stats.delete('setup');
process.stderr.write(`setup done: ${PLAYERS} players, running ${DURATION_S}s\n`);
const deadline = Date.now() + DURATION_S * 1000;
try {
  await Promise.all([dm(ctx, deadline), ...ctx.users.slice(1).map((u) => player(ctx, u, deadline))]);
} finally {
  await teardown(ctx);
}

const summary = {};
let total = 0;
let failed = 0;
for (const [label, s] of [...stats.entries()].filter(([l]) => l !== 'teardown').sort()) {
  const sorted = s.ms.slice().sort((a, b) => a - b);
  summary[label] = {
    n: s.n,
    errors: s.errors,
    p50_ms: pct(sorted, 0.5),
    p95_ms: pct(sorted, 0.95),
    max_ms: pct(sorted, 0.999999),
  };
  total += s.n;
  failed += s.errors;
}
process.stdout.write(
  `${JSON.stringify({ players: PLAYERS, duration_s: DURATION_S, requests: total, errors: failed, byRequest: summary }, null, 2)}\n`
);
process.exit(failed > 0 ? 1 : 0);
