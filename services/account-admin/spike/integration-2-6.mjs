// Story 2.6 integration check against a LOCAL throw-away stack (never run it elsewhere): real GoTrue, real hook.
// Needs SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY, SPIKE_DB_CONTAINER (supabase_db_*).
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const API = process.env.SPIKE_API_URL;
const PK = process.env.SPIKE_PUBLISHABLE_KEY;
const SK = process.env.SPIKE_SERVICE_KEY;
const DB = process.env.SPIKE_DB_CONTAINER;
if (!API || !PK || !SK || !DB || !/^supabase_db_[a-z0-9_-]+$/.test(DB) || new URL(API).hostname !== '127.0.0.1') {
  console.error('Set SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY, SPIKE_DB_CONTAINER');
  process.exit(1);
}
if (process.env.DOCKER_HOST) {
  console.error('DOCKER_HOST is set: refusing to run against a possibly remote docker engine');
  process.exit(1);
}
const { createPlayerAccount } = await import('../src/accounts.ts');
const admin = createClient(API, SK, { auth: { persistSession: false } });
const out = (label, value) => console.log(`${label}: ${value}`);
const sql = (q) =>
  execFileSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-At', '-c', q]).toString().trim();
const signIn = async (pseudo, password) => {
  const client = createClient(API, PK, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: `${pseudo}@table.invalid`, password });
  return { ok: !!data.session, status: error?.status, code: error?.code, message: error?.message };
};
const shape = (r) => `${r.status} ${r.code} "${r.message}"`;

const stamp = Date.now().toString(36);
const a = `pa${stamp}`.slice(0, 20);
const b = `pb${stamp}`.slice(0, 20);
const good = 'Right-password-123';
const ua = (await createPlayerAccount(admin, { pseudo: a, password: good, domain: 'table' })).userId;
const ub = (await createPlayerAccount(admin, { pseudo: b, password: good, domain: 'table' })).userId;

const wrong = await signIn(a, 'Wrong-password-000');
out('a wrong password', shape(wrong));
for (let i = 0; i < 4; i++) await signIn(a, 'Wrong-password-000');
const lockedRight = await signIn(a, good);
out('right password after 5 failures', lockedRight.ok ? 'ACCEPTED (BAD)' : shape(lockedRight));
out('refusal identical to a wrong password', String(shape(lockedRight) === shape(wrong)));
out('another pseudo meanwhile', (await signIn(b, good)).ok ? 'OK' : 'BLOCKED (BAD)');
const stillLocked = await signIn(a, good);
out('insisting', stillLocked.ok ? 'ACCEPTED (BAD)' : 'still refused');
out(
  'failures recorded for the locked pseudo',
  sql(`select count(*) from internal.login_attempts where user_id = '${ua}'`)
);

sql(`update internal.login_attempts set attempted_at = now() - interval '16 minutes' where user_id = '${ua}'`);
out('right password after the delay', (await signIn(a, good)).ok ? 'OK' : 'STILL BLOCKED (BAD)');
out('failures after a success', sql(`select count(*) from internal.login_attempts where user_id = '${ua}'`));

await admin.auth.admin.deleteUser(ua);
await admin.auth.admin.deleteUser(ub);
console.log('done');
