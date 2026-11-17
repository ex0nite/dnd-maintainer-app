// Story 2.3 integration check against a LOCAL throw-away stack (never run it elsewhere): real GoTrue, real triggers.
// Needs SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY.
import { createClient } from '@supabase/supabase-js';

const API = process.env.SPIKE_API_URL;
const PK = process.env.SPIKE_PUBLISHABLE_KEY;
const SK = process.env.SPIKE_SERVICE_KEY;
if (!API || !PK || !SK || new URL(API).hostname !== '127.0.0.1') {
  console.error('Set SPIKE_API_URL (127.0.0.1), SPIKE_PUBLISHABLE_KEY, SPIKE_SERVICE_KEY');
  process.exit(1);
}
const { createPlayerAccount } = await import('../src/accounts.ts');
const admin = createClient(API, SK, { auth: { persistSession: false } });
const out = (label, value) => console.log(`${label}: ${value}`);
const flag = async (pseudo) =>
  (await admin.from('profiles').select('must_change_password').eq('pseudo', pseudo).single()).data
    ?.must_change_password;

const stamp = Date.now().toString(36);
const pseudo = `pl${stamp}`.slice(0, 20);
const temp = 'Temporary-pass-16';
const { userId } = await createPlayerAccount(admin, { pseudo, password: temp, domain: 'table' });
out('flag after creation', await flag(pseudo));

const client = createClient(API, PK, { auth: { persistSession: false } });
const { error: signInError } = await client.auth.signInWithPassword({
  email: `${pseudo}@table.invalid`,
  password: temp,
});
out('sign-in with the temporary password', signInError ? `FAILED ${signInError.status}` : 'OK');
out('flag after sign-in (GoTrue must not rehash and clear it)', await flag(pseudo));

const same = await client.auth.updateUser({ password: temp });
out('changing to the very same password', same.error ? `${same.error.status} ${same.error.code}` : 'accepted');
out('flag after same-password attempt', await flag(pseudo));
const weak = await client.auth.updateUser({ password: 'short-pw' });
out('weak password (8 chars)', weak.error ? `${weak.error.status} ${weak.error.code}` : 'ACCEPTED (BAD)');

const chosen = await client.auth.updateUser({ password: 'My-own-chosen-pass-1' });
out('player chooses a password', chosen.error ? `FAILED ${chosen.error.code}` : 'OK');
out('flag after the change', await flag(pseudo));

const old = await createClient(API, PK, { auth: { persistSession: false } }).auth.signInWithPassword({
  email: `${pseudo}@table.invalid`,
  password: temp,
});
out('temporary password after the change', old.error ? `refused ${old.error.status}` : 'STILL WORKS (BAD)');

const emailChange = await client.auth.updateUser({ email: `evil${stamp}@table.invalid` });
out('address change attempt', emailChange.error ? `refused ${emailChange.error.status}` : 'ACCEPTED (BAD)');

await admin.auth.admin.deleteUser(userId);
console.log('done');
