// Caller authentication for the account-admin service (AD-2, AD-4).
//
// A request is accepted only when ALL of these hold:
//   1. it carries a bearer token whose claims say `authenticated` (a `service_role` or `anon` token is refused);
//   2. the authentication server itself accepts the token and its session (GET /auth/v1/user), which also
//      rejects revoked sessions and forged signatures;
//   3. `profiles` (read with the admin client, never the token) says: role `dm` and not archived.
// Nothing about authorization is read from the token's content beyond the `authenticated` pre-check.

import type { SupabaseClient } from '@supabase/supabase-js';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export interface AuthDeps {
  supabaseUrl: string;
  /** Publishable key: only used as the `apikey` header of GET /auth/v1/user. */
  publishableKey: string;
  admin: SupabaseClient;
  fetchImpl?: typeof fetch;
}

export interface Actor {
  userId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_TOKEN_LENGTH = 4096;

function bearerToken(header: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header ?? '');
  if (!match || match[1].length > MAX_TOKEN_LENGTH) throw new HttpError(401, 'unauthorized');
  return match[1];
}

function claimsRole(token: string): unknown {
  const part = token.split('.')[1];
  if (!part) return undefined;
  try {
    return (JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { role?: unknown }).role;
  } catch {
    return undefined;
  }
}

export async function authenticateDm(deps: AuthDeps, authorization: string | undefined): Promise<Actor> {
  const token = bearerToken(authorization);
  // Cheap refusal of service_role / anon tokens before any network call (GoTrue refuses them too).
  if (claimsRole(token) !== 'authenticated') throw new HttpError(401, 'unauthorized');

  const doFetch = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${deps.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: deps.publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, 'auth_unavailable');
  }
  if (res.status >= 500) throw new HttpError(503, 'auth_unavailable');
  if (!res.ok) throw new HttpError(401, 'unauthorized');
  const user = (await res.json().catch(() => null)) as { id?: unknown; role?: unknown } | null;
  if (!user || typeof user.id !== 'string' || !UUID.test(user.id) || user.role !== 'authenticated') {
    throw new HttpError(401, 'unauthorized');
  }

  const { data, error } = await deps.admin
    .from('profiles')
    .select('role, archived_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new HttpError(503, 'database_unavailable');
  if (!data || data.role !== 'dm' || data.archived_at !== null) throw new HttpError(403, 'forbidden');
  return { userId: user.id };
}
