// Story 2.5 integration check against a LOCAL throw-away stack (never run it elsewhere): real GoTrue, real service.
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
const signIn = async (pseudo, password) => {
  const client = createClient(API, PK, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: `${pseudo}@table.invalid`, password });
  return { client, session: data.session, status: error?.status, message: error?.message };
};
const count = async (client, table) => (await client.from(table).select('*')).data?.length;

const stamp = Date.now().toString(36);
const dmPseudo = `dm${stamp}`;
await createDmAccount(admin, { pseudo: dmPseudo, password: 'Dm-chosen-password-1', domain: 'table' });
const mkCampaign = async (name) =>
  (
    await admin
      .from('campaigns')
      .insert({ name: `${name} ${stamp}`, slug: `${name}-${stamp}`.toLowerCase() })
      .select('id')
      .single()
  ).data.id;
const campA = await mkCampaign('A');
const campB = await mkCampaign('B');
const dm = await signIn(dmPseudo, 'Dm-chosen-password-1');

const pseudo = `pl${stamp}`.slice(0, 20);
const created = await (
  await post('/admin-api/accounts', dm.session.access_token, { pseudo, campaignId: campA })
).json();
await (await signIn(pseudo, created.temporaryPassword)).client.auth.updateUser({ password: 'Player-chosen-pass-1' });
const player = await signIn(pseudo, 'Player-chosen-pass-1');

await admin.from('characters').insert([
  { campaign_id: campA, name: 'Active PC', character_type: 'pc', owner_user_id: created.userId, is_active: true },
  {
    campaign_id: campA,
    name: 'Hand-disabled PC',
    character_type: 'pc',
    owner_user_id: created.userId,
    is_active: false,
  },
]);
const states = async () =>
  JSON.stringify(
    (
      await admin
        .from('characters')
        .select('name, is_active, archived_with_owner')
        .eq('owner_user_id', created.userId)
        .order('name')
    ).data
  );

// --- membership ---
const selfAdd = await player.client.from('campaign_members').insert({ campaign_id: campB, user_id: created.userId });
out('player adds themself to another campaign', selfAdd.error ? `refused ${selfAdd.error.code}` : 'ACCEPTED (BAD)');
const dmAdd = await dm.client.from('campaign_members').insert({ campaign_id: campB, user_id: created.userId });
out('DM adds the player to campaign B', dmAdd.error ? `FAILED ${dmAdd.error.message}` : 'OK');
out('player sees campaigns A and B', await count(player.client, 'campaigns'));
const dmRemove = await dm.client
  .from('campaign_members')
  .delete()
  .eq('campaign_id', campB)
  .eq('user_id', created.userId)
  .select('user_id');
out(
  'DM removes the player from B only',
  `${dmRemove.data?.length} row; player now sees ${await count(player.client, 'campaigns')} campaign`
);
const selfRemove = await player.client
  .from('campaign_members')
  .delete()
  .eq('campaign_id', campA)
  .eq('user_id', created.userId)
  .select('user_id');
out('player removes themself from A', `${selfRemove.data?.length ?? 0} row touched`);

// --- archive ---
const arch = await post(`/admin-api/accounts/${created.userId}/archive`, dm.session.access_token, {});
out('archive', arch.status);
out(
  'same token right after archiving: campaigns / characters visible',
  `${await count(player.client, 'campaigns')} / ${await count(player.client, 'characters')}`
);
const again = await signIn(pseudo, 'Player-chosen-pass-1');
out('sign-in of the archived player', again.session ? 'ACCEPTED (BAD)' : `refused ${again.status}`);
out('characters after archiving', await states());
const archAgain = await post(`/admin-api/accounts/${created.userId}/archive`, dm.session.access_token, {});
out('archiving twice (retry)', archAgain.status);
out(
  'profile still readable by the DM, listed archived',
  JSON.stringify((await dm.client.from('profiles').select('pseudo, archived_at').eq('pseudo', pseudo).single()).data)
);

// --- reactivate ---
const react = await post(`/admin-api/accounts/${created.userId}/reactivate`, dm.session.access_token, {});
out('reactivate', react.status);
const back = await signIn(pseudo, 'Player-chosen-pass-1');
out('sign-in after reactivation', back.session ? 'OK' : `FAILED ${back.status}`);
out('campaign visible again', await count(back.client, 'campaigns'));
out('characters after reactivation (hand-disabled one stays disabled)', await states());

// --- the DM can never be archived ---
const dmId = (await admin.from('profiles').select('user_id').eq('pseudo', dmPseudo).single()).data.user_id;
out('archiving the DM', (await post(`/admin-api/accounts/${dmId}/archive`, dm.session.access_token, {})).status);
out(
  'a player archiving someone',
  (await post(`/admin-api/accounts/${created.userId}/archive`, back.session.access_token, {})).status
);

await admin.auth.admin.deleteUser(created.userId);
console.log('done');
