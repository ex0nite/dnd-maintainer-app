// Story 2.1 spike: observes what the installed GoTrue really does (AD-2, AD-11).
// Run against a LOCAL throw-away stack only: SPIKE_API_URL, SPIKE_ANON_KEY, SPIKE_SERVICE_KEY, SPIKE_DB_CONTAINER.
// Writes nothing outside the throw-away stack; prints one line per finding.
import { execFileSync } from 'node:child_process';

const API = process.env.SPIKE_API_URL;
const ANON = process.env.SPIKE_ANON_KEY;
const SERVICE = process.env.SPIKE_SERVICE_KEY;
const DB = process.env.SPIKE_DB_CONTAINER;
if (!API || !ANON || !SERVICE || !DB || !/^supabase_db_/.test(DB) || !/^http:\/\/127\.0\.0\.1:/.test(API)) {
  console.error('Set SPIKE_API_URL (127.0.0.1), SPIKE_ANON_KEY, SPIKE_SERVICE_KEY, SPIKE_DB_CONTAINER (supabase_db_*)');
  process.exit(1);
}

const sql = (q) => execFileSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-At', '-c', q]).toString().trim();
const call = async (method, path, { key = ANON, token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
};
const login = (email, password) => call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
const out = (n, label, value) => console.log(`(${n}) ${label}: ${value}`);

// The stack must be started with [auth.hook.password_verification_attempt] pointing to public.spike_pw_hook;
// the function exists before the first login (a missing hook function makes EVERY login fail with a 500: fail closed).
sql(`create table if not exists public.spike_attempts(user_id uuid, at timestamptz default now(), valid boolean)`);
sql(`create or replace function public.spike_pw_hook(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $f$
declare fails int; uid uuid := (event->>'user_id')::uuid;
begin
  select count(*) into fails from public.spike_attempts where user_id = uid and not valid and at > now() - interval '15 minutes';
  if fails >= 5 then
    return jsonb_build_object('decision', 'reject', 'message', 'Too many attempts');
  end if;
  insert into public.spike_attempts(user_id, valid) values (uid, (event->>'valid')::boolean);
  return jsonb_build_object('decision', 'continue');
end $f$`);
sql(`grant execute on function public.spike_pw_hook to supabase_auth_admin; grant all on table public.spike_attempts to supabase_auth_admin; revoke execute on function public.spike_pw_hook from authenticated, anon, public`);
const stamp = Date.now().toString(36);
const email = `spike-${stamp}@table.invalid`;
const pw1 = 'Temporary-pass-1';
const pw2 = 'Another-pass-22';

// (1)+(2) .invalid address, created confirmed through the admin API
const created = await call('POST', '/auth/v1/admin/users', { key: SERVICE, body: { email, password: pw1, email_confirm: true } });
out(1, 'admin createUser with .invalid address', `${created.status} ${created.status === 200 ? 'ACCEPTED' : JSON.stringify(created.json)}`);
const uid = created.json?.id;
out(2, 'user is confirmed without any mail', `email_confirmed_at=${created.json?.email_confirmed_at ? 'set' : 'MISSING'}`);
const first = await login(email, pw1);
out(1, 'password login with .invalid address', `${first.status} ${first.json?.access_token ? 'OK' : JSON.stringify(first.json)}`);
const token = first.json?.access_token;

// (3) auth.sessions
out(3, 'auth.sessions table', `${sql("select to_regclass('auth.sessions')")} ; rows for user=${sql(`select count(*) from auth.sessions where user_id='${uid}'`)}`);

// (4) admin password change, old password dies
const changed = await call('PUT', `/auth/v1/admin/users/${uid}`, { key: SERVICE, body: { password: pw2 } });
const oldPw = await login(email, pw1);
const newPw = await login(email, pw2);
out(4, 'admin password change', `${changed.status}; old password -> ${oldPw.status}; new password -> ${newPw.status}`);
const sessionsAfter = sql(`select count(*) from auth.sessions where user_id='${uid}'`);
out(4, 'sessions kept after admin password change (revocation must be explicit)', sessionsAfter);
// explicit revocation: delete from auth.sessions, then the old refresh token / access token behaviour
sql(`delete from auth.sessions where user_id='${uid}'`);
const stillValid = await call('GET', '/auth/v1/user', { token });
out(3, 'access token after auth.sessions row deleted (immediate revocation?)', `${stillValid.status}`);
const refresh = await call('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: first.json?.refresh_token } });
out(3, 'refresh token after session deleted', `${refresh.status}`);

// (5) user-initiated email change
const second = await login(email, pw2);
const emailChange = await call('PUT', '/auth/v1/user', { token: second.json?.access_token, body: { email: `evil-${stamp}@table.invalid` } });
out(5, 'user PUT /user {email}', `${emailChange.status} ${JSON.stringify(emailChange.json)?.slice(0, 160)}`);
out(5, 'DB state after the attempt', sql(`select 'email=' || email || ' ; email_change=' || coalesce(nullif(email_change,''),'<none>') from auth.users where id='${uid}'`));
const passOwn = await call('PUT', '/auth/v1/user', { token: second.json?.access_token, body: { password: 'Own-chosen-pass-9' } });
out('3.x', 'user changes own password through PUT /user', `${passOwn.status}`);

// (5b) mitigation: a trigger on auth.users refusing any email / email_change write (the sign-in address is derived from the pseudo and never changes)
sql(`update auth.users set email_change='', email_change_token_new='' where id='${uid}'`);
sql(`create or replace function public.spike_refuse_email_change() returns trigger language plpgsql set search_path='' as $f$ begin
  if new.email is distinct from old.email or coalesce(new.email_change,'') <> coalesce(old.email_change,'') then
    raise exception 'sign-in address is immutable' using errcode = '42501';
  end if; return new; end $f$`);
sql(`create trigger spike_refuse_email_change before update on auth.users for each row execute function public.spike_refuse_email_change()`);
const blocked = await call('PUT', '/auth/v1/user', { token: second.json?.access_token, body: { email: `evil2-${stamp}@table.invalid` } });
out('5b', 'user PUT /user {email} with the refusing trigger', `${blocked.status} ${JSON.stringify(blocked.json)?.slice(0, 140)}`);
out('5b', 'DB state after the refused attempt', sql(`select 'email=' || email || ' ; email_change=' || coalesce(nullif(email_change,''),'<none>') from auth.users where id='${uid}'`));
const stillWorks = await call('PUT', `/auth/v1/admin/users/${uid}`, { key: SERVICE, body: { password: pw1 } });
out('5b', 'admin password change with the trigger present', `${stillWorks.status}`);
sql('drop trigger spike_refuse_email_change on auth.users; drop function public.spike_refuse_email_change()');

// (7) open signup with the publishable key
const signup = await call('POST', '/auth/v1/signup', { body: { email: `x-${stamp}@table.invalid`, password: 'Signup-attempt-12' } });
out(7, 'signup with public key', `${signup.status} ${JSON.stringify(signup.json)?.slice(0, 120)}`);
const inviteLike = await call('POST', '/auth/v1/otp', { body: { email: `y-${stamp}@table.invalid`, create_user: true } });
out(7, 'otp create_user with public key', `${inviteLike.status} ${JSON.stringify(inviteLike.json)?.slice(0, 120)}`);
out(7, 'user rows created by those attempts', sql(`select count(*) from auth.users where email like 'x-${stamp}%' or email like 'y-${stamp}%'`));

// (6) password verification attempt hook: install a throw-away lockout, check it is called and can reject
const hookUser = await call('POST', '/auth/v1/admin/users', { key: SERVICE, body: { email: `hook-${stamp}@table.invalid`, password: pw1, email_confirm: true } });
const hid = hookUser.json?.id;
const other = await call('POST', '/auth/v1/admin/users', { key: SERVICE, body: { email: `other-${stamp}@table.invalid`, password: pw1, email_confirm: true } });
const statuses = [];
for (let i = 0; i < 7; i++) statuses.push((await login(`hook-${stamp}@table.invalid`, 'wrong-password-xx')).status);
out(6, '7 wrong passwords on one pseudo (statuses)', statuses.join(','));
const locked = await login(`hook-${stamp}@table.invalid`, pw1);
out(6, 'correct password while locked', `${locked.status} ${JSON.stringify(locked.json)?.slice(0, 140)}`);
const unaffected = await login(`other-${stamp}@table.invalid`, pw1);
out(6, 'another pseudo during the lock', `${unaffected.status}`);
const ghost = await login(`nobody-${stamp}@table.invalid`, 'wrong-password-xx');
out(6, 'unknown pseudo (hook called?)', `${ghost.status} ${JSON.stringify(ghost.json)?.slice(0, 100)}; attempts rows=${sql('select count(*) from public.spike_attempts')}`);
out(6, 'attempt rows recorded for the locked user', sql(`select count(*) from public.spike_attempts where user_id='${hid}'`));
await call('DELETE', `/auth/v1/admin/users/${hid}`, { key: SERVICE });
await call('DELETE', `/auth/v1/admin/users/${other.json?.id}`, { key: SERVICE });
sql('drop table public.spike_attempts cascade; drop function public.spike_pw_hook(jsonb)');

// cleanup
await call('DELETE', `/auth/v1/admin/users/${uid}`, { key: SERVICE });
