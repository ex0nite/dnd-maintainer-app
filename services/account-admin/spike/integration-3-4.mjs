// Stories 3.3, 3.4, 3.5, 3.9 integration check against a LOCAL throw-away stack (never run it elsewhere): the very
// requests the character builder and the sheet send (create, private part, level history upsert, items, status),
// made by real players through PostgREST. Needs SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY.
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
  await client.auth.signInWithPassword({ email: `${pseudo}@table.invalid`, password });
  return client;
};
const makePlayer = async (pseudo, campaignId) => {
  const { userId } = await createPlayerAccount(admin, { pseudo, password: 'Temporary-pass-16', domain: 'table' });
  await (await signIn(pseudo, 'Temporary-pass-16')).auth.updateUser({ password: 'Player-chosen-pass-1' });
  await admin.from('campaign_members').insert({ campaign_id: campaignId, user_id: userId });
  return { userId, client: await signIn(pseudo, 'Player-chosen-pass-1') };
};

const stamp = Date.now().toString(36);
const dmPseudo = `dm${stamp}`;
await createDmAccount(admin, { pseudo: dmPseudo, password: 'Dm-chosen-password-1', domain: 'table' });
const dm = await signIn(dmPseudo, 'Dm-chosen-password-1');
const campaign = (
  await admin
    .from('campaigns')
    .insert({ name: `C ${stamp}`, slug: `c-${stamp}` })
    .select('id')
    .single()
).data.id;
const alice = await makePlayer(`al${stamp}`.slice(0, 20), campaign);
const bob = await makePlayer(`bo${stamp}`.slice(0, 20), campaign);

// 3.3 create, as the builder's autosave does (owner and type added, no slug, no id)
const payload = {
  campaign_id: campaign,
  name: 'Elowen',
  character_type: 'pc',
  owner_user_id: alice.userId,
  player_name: 'Alice',
  species: 'elf',
  class: 'wizard',
  level: 1,
  hit_points_max: 8,
  status: 'draft',
};
const created = await alice.client.from('characters').insert(payload).select('id, slug').single();
out(
  'player creates their PC',
  created.error ? `FAILED ${created.error.message}` : `OK (slug ${created.data.slug.slice(0, 14)}…)`
);
const id = created.data?.id;
const asNpc = await alice.client.from('characters').insert({ ...payload, character_type: 'npc', name: 'Npc' });
out('player creates an NPC', asNpc.error ? `refused ${asNpc.error.code}` : 'ACCEPTED (BAD)');
const forOther = await alice.client
  .from('characters')
  .insert({ ...payload, owner_user_id: bob.userId, name: 'ForBob' });
out(
  'player creates a character owned by someone else',
  forOther.error ? `refused ${forOther.error.code}` : 'ACCEPTED (BAD)'
);
const withSlug = await alice.client.from('characters').insert({ ...payload, slug: 'my-own-slug', name: 'Slug' });
out('player picks a slug', withSlug.error ? `refused ${withSlug.error.code}` : 'ACCEPTED (BAD)');

// private part (the row exists already, created by the trigger)
const priv = await alice.client
  .from('character_private')
  .update({ backstory: 'Raised by owls', notes: 'secret' })
  .eq('character_id', id)
  .select('character_id');
out('player writes the private part', `${priv.data?.length ?? 0} row`);

// the autosave tick: update the sheet with the same campaign and type, then upsert the level history
const tick = await alice.client
  .from('characters')
  .update({ ...payload, level: 2, name: 'Elowen the Wise' })
  .eq('id', id)
  .select('id');
out('autosave update of the sheet', `${tick.data?.length ?? 0} row${tick.error ? ` (${tick.error.message})` : ''}`);
const rows = [
  {
    character_id: id,
    sequence: 0,
    base_abilities: { str: 8 },
    ability_method: 'standard',
    choices: {},
    deleted_at: null,
  },
  { character_id: id, sequence: 1, class_id: 'wizard', class_level: 1, choices: {}, deleted_at: null },
];
const up1 = await alice.client.from('character_build_levels').upsert(rows, { onConflict: 'character_id,sequence' });
out('level history upsert', up1.error ? `FAILED ${up1.error.message}` : 'OK');
// 3.4 level up: a new level row + a re-upsert of the old ones (conflict path = update)
const up2 = await alice.client
  .from('character_build_levels')
  .upsert(
    [...rows, { character_id: id, sequence: 2, class_id: 'wizard', class_level: 2, choices: {}, deleted_at: null }],
    { onConflict: 'character_id,sequence' }
  );
out('level up (new level + re-upsert)', up2.error ? `FAILED ${up2.error.message}` : 'OK');
const cleanup = await alice.client
  .from('character_build_levels')
  .update({ deleted_at: new Date().toISOString() })
  .eq('character_id', id)
  .not('sequence', 'in', '(0,1,2)');
out('orphan clean-up update', cleanup.error ? `FAILED ${cleanup.error.message}` : 'OK');

// finalize: items then status ready
const items = await alice.client.from('character_items').insert([
  { character_id: id, item_id: 'quarterstaff' },
  { character_id: id, item_id: 'spellbook' },
]);
out('player adds starting items', items.error ? `FAILED ${items.error.message}` : 'OK');
const fin = await alice.client.from('characters').update({ status: 'ready' }).eq('id', id).select('slug').single();
out('player finalizes', fin.error ? `FAILED ${fin.error.message}` : 'OK');

// what the other player does to it
const bobSees = await bob.client.from('characters').select('id, name, owner_user_id').eq('id', id);
out('another player reads it', `${bobSees.data?.length ?? 0} row`);
const bobPriv = await bob.client.from('character_private').select('backstory').eq('character_id', id);
out('another player reads its private part', `${bobPriv.data?.length ?? 0} row`);
const bobEdit = await bob.client.from('characters').update({ name: 'Pwned' }).eq('id', id).select('id');
out('another player edits it', `${bobEdit.data?.length ?? 0} row`);
const bobLevel = await bob.client
  .from('character_build_levels')
  .insert({ character_id: id, sequence: 9, class_id: 'wizard', class_level: 9, choices: {} });
out('another player adds a level', bobLevel.error ? `refused ${bobLevel.error.code}` : 'ACCEPTED (BAD)');
const bobRebuild = await bob.client.from('characters').update({ status: 'draft' }).eq('id', id).select('id');
out('another player puts it back to draft', `${bobRebuild.data?.length ?? 0} row`);

// 3.5 rebuild by the owner: back to draft, history and inventory untouched
const rebuild = await alice.client
  .from('characters')
  .update({ status: 'draft' })
  .eq('id', id)
  .select('status')
  .single();
out('owner puts it back to draft', rebuild.error ? `FAILED ${rebuild.error.message}` : rebuild.data.status);
const kept = await alice.client.from('character_items').select('id');
const keptLevels = await alice.client
  .from('character_build_levels')
  .select('sequence')
  .eq('character_id', id)
  .is('deleted_at', null);
out('inventory and level history after the rebuild', `${kept.data?.length} items, ${keptLevels.data?.length} levels`);

// player cannot delete (the builder's rollback or abandon)
const del = await alice.client.from('characters').delete().eq('id', id).select('id');
out('owner deletes their character', `${del.data?.length ?? 0} row (no error: ${!del.error})`);

// 3.9 DM reassigns
const give = await dm.from('characters').update({ owner_user_id: bob.userId }).eq('id', id).select('id');
out('DM gives it to the other player', `${give.data?.length ?? 0} row`);
const aliceAfter = await alice.client.from('characters').update({ name: 'Mine still' }).eq('id', id).select('id');
out('former owner edits it', `${aliceAfter.data?.length ?? 0} row`);
const alicePriv = await alice.client.from('character_private').select('backstory').eq('character_id', id);
out('former owner reads its private part', `${alicePriv.data?.length ?? 0} row`);
const bobAfter = await bob.client.from('characters').update({ name: 'Bob now' }).eq('id', id).select('id');
out('new owner edits it', `${bobAfter.data?.length ?? 0} row`);
const dmDel = await dm.from('characters').delete().eq('id', id).select('id');
out('DM deletes it', `${dmDel.data?.length ?? 0} row`);
const left = await admin.from('character_items').select('id', { count: 'exact', head: true }).eq('character_id', id);
out('dependent rows after the DM deletion', left.count);

for (const p of [alice.userId, bob.userId]) await admin.auth.admin.deleteUser(p);
console.log('done');
