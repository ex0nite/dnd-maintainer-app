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
const RESET_ROUTE = /^\/accounts\/([0-9a-f-]{36})\/reset-password$/;

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
      const { error: cleanupError } = await deps.admin.auth.admin.deleteUser(created.userId);
      // A failed cleanup leaves an account the owner must remove by hand: say which one (no secret in it).
      if (cleanupError) process.stderr.write(`rollback failed, remove auth user ${created.userId} by hand\n`);
      throw new HttpError(500, 'account_creation_failed');
    }

    return { status: 201, body: { userId: created.userId, pseudo, temporaryPassword } };
  }

  /** A player target only: the DM account (and anything unknown) is never touched (D-31). */
  async function loadPlayerTarget(targetId: string): Promise<{ must_change_password: boolean }> {
    if (!UUID.test(targetId)) throw new HttpError(400, 'invalid_target');
    const { data, error } = await deps.admin
      .from('profiles')
      .select('role, archived_at, must_change_password')
      .eq('user_id', targetId)
      .maybeSingle();
    if (error) throw new HttpError(503, 'database_unavailable');
    if (!data) throw new HttpError(404, 'account_not_found');
    if (data.role !== 'player') throw new HttpError(403, 'forbidden_target');
    if (data.archived_at !== null) throw new HttpError(409, 'account_archived');
    return { must_change_password: data.must_change_password };
  }

  /**
   * DM-initiated reset (FR4). Order matters (docs: password_reset_pending, story 2.3 migration):
   *  1. raise must_change_password + password_reset_pending: from now on the account reads nothing;
   *  2. change the password: the trigger keeps the flag up and consumes the marker;
   *  3. end every session, so the old password's tokens cannot be renewed.
   * A failure at step 2 puts the previous flag back (the old password still works then).
   */
  async function resetPassword(targetId: string): Promise<ApiResponse> {
    const before = await loadPlayerTarget(targetId);

    const { error: raiseError } = await deps.admin
      .from('profiles')
      .update({ must_change_password: true, password_reset_pending: true })
      .eq('user_id', targetId);
    if (raiseError) throw new HttpError(503, 'database_unavailable');

    const temporaryPassword = generateTemporaryPassword();
    const { error: passwordError } = await deps.admin.auth.admin.updateUserById(targetId, {
      password: temporaryPassword,
    });
    if (passwordError) {
      const { error: restoreError } = await deps.admin
        .from('profiles')
        .update({ must_change_password: before.must_change_password, password_reset_pending: false })
        .eq('user_id', targetId);
      if (restoreError) process.stderr.write(`reset failed and flag not restored for ${targetId}\n`);
      throw new HttpError(500, 'password_reset_failed');
    }

    const { error: revokeError } = await deps.admin.rpc('revoke_user_sessions', { p_user_id: targetId });
    if (revokeError) {
      // The new password is set and the account is locked behind it; old tokens just stay renewable until the DM retries.
      process.stderr.write(`sessions of ${targetId} not revoked after reset\n`);
      throw new HttpError(500, 'session_revocation_failed');
    }
    return { status: 200, body: { userId: targetId, temporaryPassword } };
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
      const reset = RESET_ROUTE.exec(route);
      if (reset) {
        if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
        const actor = await authenticateDm(authDeps, req.authorization);
        if (!perActor.allow(actor.userId)) throw new HttpError(429, 'rate_limited');
        return await resetPassword(reset[1]);
      }
      throw new HttpError(404, 'not_found');
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
      // Never echo internals: the cause is logged by server.ts, the caller gets a generic answer.
      throw e;
    }
  };
}
