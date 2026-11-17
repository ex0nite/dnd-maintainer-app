// Story 2.4 integration check against a LOCAL throw-away stack (never run it elsewhere): real GoTrue, real service.
// Needs SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY, ADMIN_URL (the running service).
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
const newClient = () => createClient(API, PK, { auth: { persistSession: false } });
const signIn = async (pseudo, password) => {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email: `${pseudo}@table.invalid`, password });
  return { client, session: data.session, status: error?.status };
};
const profile = async (pseudo) =>
  (await admin.from('profiles').select('must_change_password, password_reset_pending').eq('pseudo', pseudo).single())
    .data;

const stamp = Date.now().toString(36);
const dmPseudo = `dm${stamp}`;
await createDmAccount(admin, { pseudo: dmPseudo, password: 'Dm-chosen-password-1', domain: 'table' });
const { data: campaign } = await admin
  .from('campaigns')
  .insert({ name: `Spike ${stamp}`, slug: `spike-${stamp}` })
  .select('id')
  .single();
const dm = await signIn(dmPseudo, 'Dm-chosen-password-1');

const pseudo = `pl${stamp}`.slice(0, 20);
const created = await (
  await post('/admin-api/accounts', dm.session.access_token, { pseudo, campaignId: campaign.id })
).json();
const player = await signIn(pseudo, created.temporaryPassword);
await player.client.auth.updateUser({ password: 'Player-chosen-pass-1' });
const chosen = await signIn(pseudo, 'Player-chosen-pass-1');
out('player on their own password: flags', JSON.stringify(await profile(pseudo)));
const { data: ownCampaign } = await chosen.client.from('campaigns').select('id');
out('player reads their campaign before the reset', ownCampaign?.length);

const res = await post(`/admin-api/accounts/${created.userId}/reset-password`, dm.session.access_token, {});
const reset = await res.json();
out('DM resets the password', `${res.status} (password length ${reset.temporaryPassword?.length})`);
out('flags after the reset', JSON.stringify(await profile(pseudo)));

const old = await signIn(pseudo, 'Player-chosen-pass-1');
out('old password', old.status ? `refused ${old.status}` : 'STILL WORKS (BAD)');
const fresh = await signIn(pseudo, reset.temporaryPassword);
out('new temporary password', fresh.session ? 'OK' : `FAILED ${fresh.status}`);
const refreshed = await chosen.client.auth.refreshSession();
out('old session refresh', refreshed.error ? `refused ${refreshed.error.status}` : 'STILL RENEWABLE (BAD)');
const hijack = await chosen.client.auth.updateUser({ password: 'Hijacked-password-1' });
out(
  'old session changes the password after the reset',
  hijack.error ? `refused ${hijack.error.status}` : 'ACCEPTED (BAD)'
);
const { data: afterReset } = await fresh.client.from('campaigns').select('id');
out('player on the temporary password reads campaigns', afterReset?.length);
const { data: staleTokenRead } = await newClient().auth.getUser(chosen.session.access_token);
out('old access token on the auth server', staleTokenRead?.user ? 'still accepted' : 'refused');

const dmId = (await admin.from('profiles').select('user_id').eq('pseudo', dmPseudo).single()).data.user_id;
const onDm = await post(`/admin-api/accounts/${dmId}/reset-password`, dm.session.access_token, {});
out('resetting the DM account', onDm.status);
const asPlayer = await post(`/admin-api/accounts/${created.userId}/reset-password`, fresh.session.access_token, {});
out('a player calls the reset', asPlayer.status);

await admin.auth.admin.deleteUser(created.userId);
console.log('done');
