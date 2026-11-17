// Routes of the account-admin service (AD-2). Transport-free: `server.ts` adapts node:http to this.
//
// Every route except the health check requires an authenticated, non-archived DM (see auth.ts).
// A request that targets the DM account is always refused (D-31).

import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountError, createPlayerAccount } from './accounts.ts';
import { authenticateDm, HttpError, type AuthDeps } from './auth.ts';
import { generateTemporaryPassword } from './password.ts';
import { FixedWindowLimiter } from './rate-limit.ts';

export interface ApiRequest {
  method: string;
  path: string;
  authorization?: string;
  /** Client address as seen by the trusted proxy (see server.ts). */
  ip: string;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface HandlerDeps {
  admin: SupabaseClient;
  supabaseUrl: string;
  publishableKey: string;
  domain: string;
  fetchImpl?: typeof fetch;
  /** Calls per minute before authentication, per client address. */
  anonymousLimit?: number;
  /** Mutating calls per minute, per DM. */
  actorLimit?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROUTE_PREFIX = '/admin-api';

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'invalid_body');
  return body as Record<string, unknown>;
}

export function createHandler(deps: HandlerDeps) {
  const perAddress = new FixedWindowLimiter(deps.anonymousLimit ?? 30, 60_000);
  const perActor = new FixedWindowLimiter(deps.actorLimit ?? 10, 60_000);
  const authDeps: AuthDeps = {
    supabaseUrl: deps.supabaseUrl,
    publishableKey: deps.publishableKey,
    admin: deps.admin,
    fetchImpl: deps.fetchImpl,
  };

  async function createPlayer(body: unknown): Promise<ApiResponse> {
    const input = asObject(body);
    const pseudo = input.pseudo;
    const campaignId = input.campaignId;
    if (typeof pseudo !== 'string' || typeof campaignId !== 'string' || !UUID.test(campaignId)) {
      throw new HttpError(400, 'invalid_body');
    }

    const { data: campaign, error: campaignError } = await deps.admin
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .maybeSingle();
    if (campaignError) throw new HttpError(503, 'database_unavailable');
    if (!campaign) throw new HttpError(404, 'campaign_not_found');

    const { data: taken, error: takenError } = await deps.admin
      .from('profiles')
      .select('user_id')
      .eq('pseudo', pseudo)
      .maybeSingle();
    if (takenError) throw new HttpError(503, 'database_unavailable');
    if (taken) throw new HttpError(409, 'pseudo_taken');

    const temporaryPassword = generateTemporaryPassword();
    let created: { userId: string };
    try {
      created = await createPlayerAccount(deps.admin, { pseudo, password: temporaryPassword, domain: deps.domain });
    } catch (e) {
      if (e instanceof AccountError) {
        if (e.code === 'invalid_pseudo') throw new HttpError(400, 'invalid_pseudo');
        // A concurrent creation of the same pseudo ends here (unique index or authentication conflict).
        if (/already|duplicate|unique/i.test(e.message)) throw new HttpError(409, 'pseudo_taken');
        throw new HttpError(500, 'account_creation_failed');
      }
      throw e;
    }

    const { error: memberError } = await deps.admin
      .from('campaign_members')
      .insert({ campaign_id: campaignId, user_id: created.userId });
    if (memberError) {
      // No half-created account: removing the authentication user cascades to `profiles`.
      await deps.admin.auth.admin.deleteUser(created.userId);
      throw new HttpError(500, 'account_creation_failed');
    }

    return { status: 201, body: { userId: created.userId, pseudo, temporaryPassword } };
  }

  return async function handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      if (!req.path.startsWith(`${ROUTE_PREFIX}/`)) throw new HttpError(404, 'not_found');
      const route = req.path.slice(ROUTE_PREFIX.length);

      if (route === '/health') {
        if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
        return { status: 200, body: { ok: true } };
      }

      // Throttle by address BEFORE any network call: the service must not amplify anonymous traffic.
      if (!perAddress.allow(req.ip)) throw new HttpError(429, 'rate_limited');

      if (route === '/accounts') {
        if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
        const actor = await authenticateDm(authDeps, req.authorization);
        if (!perActor.allow(actor.userId)) throw new HttpError(429, 'rate_limited');
        return await createPlayer(req.body);
      }
      throw new HttpError(404, 'not_found');
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
      // Never echo internals: the cause is logged by server.ts, the caller gets a generic answer.
      throw e;
    }
  };
}
