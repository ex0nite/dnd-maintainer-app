// Story 2.2 integration check against a LOCAL throw-away stack (never run it elsewhere).
// Needs: SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY, ADMIN_URL (the running service).
// The DM and the campaign are created by this script, through the same shared module as the bootstrap script.
import { createClient } from '@supabase/supabase-js';

const API = process.env.SPIKE_API_URL;
const PK = process.env.SPIKE_PUBLISHABLE_KEY;
const SK = process.env.SPIKE_SERVICE_KEY;
const ADMIN = process.env.ADMIN_URL;
if (!API || !PK || !SK || !ADMIN || new URL(API).hostname !== '127.0.0.1') {
  console.error('Set SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY, ADMIN_URL');
  process.exit(1);
}
const { createDmAccount } = await import('../src/accounts.ts');

const admin = createClient(API, SK, { auth: { persistSession: false } });
const out = (label, value) => console.log(`${label}: ${value}`);
const post = (path, token, body) =>
  fetch(`${ADMIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const login = async (pseudo, password) => {
  const c = createClient(API, PK, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${pseudo}@table.invalid`, password });
  return { token: data.session?.access_token, error: error?.status };
};

const stamp = Date.now().toString(36);
const dmPseudo = `dm${stamp}`;
const dmPassword = 'Dm-chosen-password-1';
await createDmAccount(admin, { pseudo: dmPseudo, password: dmPassword, domain: 'table' });
const { data: campaign } = await admin
  .from('campaigns')
  .insert({ name: `Spike ${stamp}`, slug: `spike-${stamp}` })
  .select('id')
  .single();
const dm = await login(dmPseudo, dmPassword);

const pseudo = `joueur${stamp}`.slice(0, 20);
const res = await post('/admin-api/accounts', dm.token, { pseudo, campaignId: campaign.id });
const created = await res.json();
out(
  'DM creates a player',
  `${res.status} ${created.userId ? 'userId present' : JSON.stringify(created)} ; password length ${created.temporaryPassword?.length}`
);
out('no-store header', res.headers.get('cache-control'));

const player = await login(pseudo, created.temporaryPassword);
out('player signs in with the temporary password', player.token ? 'OK' : `FAILED ${player.error}`);
const { data: profile } = await admin
  .from('profiles')
  .select('role, must_change_password')
  .eq('pseudo', pseudo)
  .single();
out('profile', JSON.stringify(profile));
const { data: members } = await admin.from('campaign_members').select('campaign_id').eq('user_id', created.userId);
out('attached to the campaign', String(members?.length === 1 && members[0].campaign_id === campaign.id));

const asPlayer = await post('/admin-api/accounts', player.token, {
  pseudo: `autre${stamp}`.slice(0, 20),
  campaignId: campaign.id,
});
out('player calls the service', asPlayer.status);
const asAnon = await post('/admin-api/accounts', null, { pseudo: 'x'.repeat(5), campaignId: campaign.id });
out('visitor calls the service', asAnon.status);
const asService = await post('/admin-api/accounts', SK, { pseudo: 'abcde', campaignId: campaign.id });
out('service_role token calls the service', asService.status);
const dup = await post('/admin-api/accounts', dm.token, { pseudo, campaignId: campaign.id });
out('same pseudo again', dup.status);

const publicClient = createClient(API, PK, { auth: { persistSession: false } });
const signup = await publicClient.auth.signUp({ email: `free${stamp}@table.invalid`, password: 'Free-signup-pass-1' });
out(
  'direct signup with the public key',
  signup.error ? `${signup.error.status} ${signup.error.code}` : 'ACCEPTED (BAD)'
);

// A revoked session is refused: delete the DM sessions (throw-away stack), same token, same call.
const { execFileSync } = await import('node:child_process');
const dbContainer = process.env.SPIKE_DB_CONTAINER;
if (dbContainer && /^supabase_db_[a-z0-9_-]+$/.test(dbContainer)) {
  execFileSync('docker', [
    'exec',
    '-i',
    dbContainer,
    'psql',
    '-U',
    'postgres',
    '-c',
    "delete from auth.sessions where user_id in (select user_id from public.profiles where role = 'dm')",
  ]);
  const revoked = await post('/admin-api/accounts', dm.token, {
    pseudo: `revoq${stamp}`.slice(0, 20),
    campaignId: campaign.id,
  });
  out('DM token after its session was revoked', revoked.status);
}
console.log('done');
