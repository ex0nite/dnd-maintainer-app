// Story 3.8 integration check against a LOCAL throw-away stack WITH the storage service (never run it elsewhere).
// Needs SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const API = process.env.SPIKE_API_URL;
const PK = process.env.SPIKE_PUBLISHABLE_KEY;
const SK = process.env.SPIKE_SERVICE_KEY;
if (!API || !PK || !SK || new URL(API).hostname !== '127.0.0.1') {
  console.error('Set SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY');
  process.exit(1);
}
const { createPlayerAccount, createDmAccount } = await import('../src/accounts.ts');
const admin = createClient(API, SK, { auth: { persistSession: false } });
const out = (label, value) => console.log(`${label}: ${value}`);
const signIn = async (pseudo, password) => {
  const client = createClient(API, PK, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email: `${pseudo}@table.invalid`, password });
  return { client, token: data.session?.access_token };
};
const makePlayer = async (pseudo, campaignId) => {
  const { userId } = await createPlayerAccount(admin, { pseudo, password: 'Temporary-pass-16', domain: 'table' });
  await signIn(pseudo, 'Temporary-pass-16').then((s) => s.client.auth.updateUser({ password: 'Player-chosen-pass-1' }));
  await admin.from('campaign_members').insert({ campaign_id: campaignId, user_id: userId });
  return { userId, ...(await signIn(pseudo, 'Player-chosen-pass-1')) };
};
const tinyJpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9,
]);

const stamp = Date.now().toString(36);
await createDmAccount(admin, { pseudo: `dm${stamp}`, password: 'Dm-chosen-password-1', domain: 'table' });
const campaign = (
  await admin
    .from('campaigns')
    .insert({ name: `P ${stamp}`, slug: `p-${stamp}` })
    .select('id')
    .single()
).data.id;
const alice = await makePlayer(`al${stamp}`.slice(0, 20), campaign);
const bob = await makePlayer(`bo${stamp}`.slice(0, 20), campaign);
const campaign2 = (
  await admin
    .from('campaigns')
    .insert({ name: `Q ${stamp}`, slug: `q-${stamp}` })
    .select('id')
    .single()
).data.id;
const outsider = await makePlayer(`ou${stamp}`.slice(0, 20), campaign2);

const mk = async (owner, name, type = 'pc') =>
  (
    await admin
      .from('characters')
      .insert({ campaign_id: campaign, name, character_type: type, owner_user_id: owner })
      .select('id')
      .single()
  ).data.id;
const cAlice = await mk(alice.userId, 'Alice PC');
const cBob = await mk(bob.userId, 'Bob PC');
const cNpc = await mk(null, 'Innkeeper', 'npc');

const bucket = (who) => who.client.storage.from('character-portraits');
const path = `${cAlice}/${randomUUID()}.jpg`;
const up = await bucket(alice).upload(path, tinyJpeg, { contentType: 'image/jpeg' });
out('owner uploads a portrait', up.error ? `FAILED ${up.error.message}` : 'OK');
const own = await alice.client.from('characters').update({ portrait_url: path }).eq('id', cAlice).select('id');
out('owner stores the path on the sheet', own.error ? `FAILED ${own.error.message}` : `${own.data.length} row`);

const foreign = await bucket(alice).upload(`${cBob}/${randomUUID()}.jpg`, tinyJpeg, { contentType: 'image/jpeg' });
out(
  "owner uploads into another player's folder",
  foreign.error ? `refused (${foreign.error.statusCode ?? foreign.error.message})` : 'ACCEPTED (BAD)'
);
const npcUp = await bucket(alice).upload(`${cNpc}/${randomUUID()}.jpg`, tinyJpeg, { contentType: 'image/jpeg' });
out('owner uploads for an NPC', npcUp.error ? 'refused' : 'ACCEPTED (BAD)');
const big = await bucket(alice).upload(`${cAlice}/${randomUUID()}.jpg`, new Uint8Array(1048576 + 10), {
  contentType: 'image/jpeg',
});
out('upload over 1 MB', big.error ? `refused (${big.error.statusCode ?? big.error.message})` : 'ACCEPTED (BAD)');
const gif = await bucket(alice).upload(`${cAlice}/${randomUUID()}.jpg`, tinyJpeg, { contentType: 'image/gif' });
out(
  'upload with a non-allowed type',
  gif.error ? `refused (${gif.error.statusCode ?? gif.error.message})` : 'ACCEPTED (BAD)'
);

const signed = await bucket(bob).createSignedUrl(path, 60);
out("campaign mate gets a signed URL for Alice's PC portrait", signed.error ? `FAILED ${signed.error.message}` : 'OK');
if (signed.data) {
  const res = await fetch(signed.data.signedUrl);
  out('that URL serves the image', `${res.status} ${res.headers.get('content-type')}`);
}
const outsiderSigned = await bucket(outsider).createSignedUrl(path, 60);
out('a player of another campaign', outsiderSigned.error ? 'refused' : 'GOT A URL (BAD)');
const anon = createClient(API, PK, { auth: { persistSession: false } });
const anonSigned = await anon.storage.from('character-portraits').createSignedUrl(path, 60);
out('a visitor', anonSigned.error ? 'refused' : 'GOT A URL (BAD)');
const anonUp = await anon.storage
  .from('character-portraits')
  .upload(`${cAlice}/${randomUUID()}.jpg`, tinyJpeg, { contentType: 'image/jpeg' });
out('a visitor uploads', anonUp.error ? 'refused' : 'ACCEPTED (BAD)');
const publicUrl = await fetch(`${API}/storage/v1/object/public/character-portraits/${path}`);
out('public URL', publicUrl.status);

const npcPath = `${cNpc}/${randomUUID()}.jpg`;
await admin.storage.from('character-portraits').upload(npcPath, tinyJpeg, { contentType: 'image/jpeg' });
const npcSigned = await bucket(bob).createSignedUrl(npcPath, 60);
out('a player asks for an NPC portrait', npcSigned.error ? 'refused' : 'GOT A URL (BAD)');

const bobDelete = await bucket(bob).remove([path]);
out("a campaign mate deletes Alice's portrait", `${bobDelete.data?.length ?? 0} object removed`);
const ownDelete = await bucket(alice).remove([path]);
out('the owner deletes it', `${ownDelete.data?.length ?? 0} object removed`);

for (const id of [alice.userId, bob.userId, outsider.userId]) await admin.auth.admin.deleteUser(id);
console.log('done');
