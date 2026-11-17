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
const ACTION_ROUTE = /^\/accounts\/([0-9a-f-]{36})\/(reset-password|archive|reactivate)$/;
const BAN_FOREVER = '876000h';

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
  async function loadPlayerTarget(targetId: string): Promise<{ archived: boolean }> {
    if (!UUID.test(targetId)) throw new HttpError(400, 'invalid_target');
    const { data, error } = await deps.admin
      .from('profiles')
      .select('role, archived_at')
      .eq('user_id', targetId)
      .maybeSingle();
    if (error) throw new HttpError(503, 'database_unavailable');
    if (!data) throw new HttpError(404, 'account_not_found');
    if (data.role !== 'player') throw new HttpError(403, 'forbidden_target');
    return { archived: data.archived_at !== null };
  }

  /** One action per account at a time (this service is a single process). */
  const resetsInFlight = new Set<string>();

  /**
   * DM-initiated reset (FR4). The account must never be readable while the DM knows (or is about to know) its
   * password, whatever fails or interleaves (docs: password_reset_pending, story 2.3 migration):
   *  1. raise must_change_password + password_reset_pending, only on a live player row (nothing is readable from now on);
   *  2. end every session first, so nobody holding one can change the password behind the DM's back; abort if it fails;
   *  3. change the password (the trigger keeps the flag up and consumes the marker);
   *  4. write the final state explicitly (flag up, marker down): it does not depend on the marker having survived;
   *  5. end the sessions again (a sign-in with the old password between steps 2 and 3 would have opened one).
   * The flag is never lowered by a failure: at worst the player has to choose a new password again.
   * One reset per account at a time (this service is a single process).
   */
  async function resetPassword(targetId: string): Promise<ApiResponse> {
    if ((await loadPlayerTarget(targetId)).archived) throw new HttpError(409, 'account_archived');
    if (resetsInFlight.has(targetId)) throw new HttpError(409, 'action_in_progress');
    resetsInFlight.add(targetId);
    try {
      const settle = async (): Promise<void> => {
        const { error } = await deps.admin
          .from('profiles')
          .update({ must_change_password: true, password_reset_pending: false })
          .eq('user_id', targetId);
        if (error) process.stderr.write(`reset of ${targetId}: marker not cleared, retry the reset\n`);
      };
      const revoke = async (): Promise<boolean> => {
        const { error } = await deps.admin.rpc('revoke_user_sessions', { p_user_id: targetId });
        return !error;
      };

      const { data: raised, error: raiseError } = await deps.admin
        .from('profiles')
        .update({ must_change_password: true, password_reset_pending: true })
        .eq('user_id', targetId)
        .eq('role', 'player')
        .is('archived_at', null)
        .select('user_id');
      if (raiseError) throw new HttpError(503, 'database_unavailable');
      if (!raised || raised.length !== 1) throw new HttpError(404, 'account_not_found');

      if (!(await revoke())) {
        await settle();
        process.stderr.write(`sessions of ${targetId} not revoked, reset aborted\n`);
        throw new HttpError(500, 'session_revocation_failed');
      }

      const temporaryPassword = generateTemporaryPassword();
      const { error: passwordError } = await deps.admin.auth.admin.updateUserById(targetId, {
        password: temporaryPassword,
      });
      if (passwordError) {
        await settle();
        throw new HttpError(500, 'password_reset_failed');
      }

      await settle();
      if (!(await revoke())) {
        process.stderr.write(`sessions of ${targetId} not revoked after the reset, retry it\n`);
        throw new HttpError(500, 'session_revocation_failed');
      }
      return { status: 200, body: { userId: targetId, temporaryPassword } };
    } finally {
      resetsInFlight.delete(targetId);
    }
  }

  /**
   * Archive (FR5, D-30): the database function stamps the profile (immediate cut-off through the restrictive policy),
   * ends the sessions and disables the player's characters in one transaction; then the authentication account is
   * banned so no new sign-in is possible. A failure of the ban leaves the account archived and unreadable: retry.
   */
  async function archiveAccount(targetId: string): Promise<ApiResponse> {
    await loadPlayerTarget(targetId);
    if (resetsInFlight.has(targetId)) throw new HttpError(409, 'action_in_progress');
    resetsInFlight.add(targetId);
    try {
      const { error } = await deps.admin.rpc('archive_player', { p_user_id: targetId });
      if (error) throw new HttpError(500, 'archive_failed');
      const { error: banError } = await deps.admin.auth.admin.updateUserById(targetId, { ban_duration: BAN_FOREVER });
      if (banError) {
        process.stderr.write(`archive of ${targetId}: ban not applied, retry the archiving\n`);
        throw new HttpError(500, 'ban_failed');
      }
      return { status: 200, body: { userId: targetId, status: 'archived' } };
    } finally {
      resetsInFlight.delete(targetId);
    }
  }

  /**
   * Reactivate: lift the ban FIRST, then the database. If the database step fails the account is still archived (it
   * reads nothing and the list still offers "Reactivate"), so the retry is always possible. Only an archived account
   * can be reactivated.
   */
  async function reactivateAccount(targetId: string): Promise<ApiResponse> {
    if (!(await loadPlayerTarget(targetId)).archived) throw new HttpError(409, 'not_archived');
    if (resetsInFlight.has(targetId)) throw new HttpError(409, 'action_in_progress');
    resetsInFlight.add(targetId);
    try {
      const { error: unbanError } = await deps.admin.auth.admin.updateUserById(targetId, { ban_duration: 'none' });
      if (unbanError) throw new HttpError(500, 'unban_failed');
      const { error } = await deps.admin.rpc('reactivate_player', { p_user_id: targetId });
      if (error) {
        process.stderr.write(`reactivation of ${targetId}: database step failed, retry the reactivation\n`);
        throw new HttpError(500, 'reactivate_failed');
      }
      return { status: 200, body: { userId: targetId, status: 'active' } };
    } finally {
      resetsInFlight.delete(targetId);
    }
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
      const action = ACTION_ROUTE.exec(route);
      if (action) {
        if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
        const actor = await authenticateDm(authDeps, req.authorization);
        if (!perActor.allow(actor.userId)) throw new HttpError(429, 'rate_limited');
        if (action[2] === 'archive') return await archiveAccount(action[1]);
        if (action[2] === 'reactivate') return await reactivateAccount(action[1]);
        return await resetPassword(action[1]);
      }
      throw new HttpError(404, 'not_found');
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
      // Never echo internals: the cause is logged by server.ts, the caller gets a generic answer.
      throw e;
    }
  };
}
