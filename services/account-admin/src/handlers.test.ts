import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHandler, type ApiRequest } from './handlers.ts';
import { generateTemporaryPassword } from './password.ts';
import { FixedWindowLimiter } from './rate-limit.ts';

const DM_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444';

function jwt(role: string): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ role, sub: DM_ID })}.sig`;
}

interface FakeOptions {
  profiles?: Record<string, { role: string; archived_at: string | null; must_change_password?: boolean } | undefined>;
  raiseError?: boolean;
  updatePasswordError?: boolean;
  revokeError?: boolean;
  existingPseudo?: boolean;
  campaignExists?: boolean;
  memberError?: boolean;
  createUserError?: string;
  authUserStatus?: number;
  authUser?: Record<string, unknown>;
}

function setup(opts: FakeOptions = {}) {
  const profiles = opts.profiles ?? {
    [DM_ID]: { role: 'dm', archived_at: null },
    [PLAYER_ID]: { role: 'player', archived_at: null },
  };
  const calls = {
    deleteUser: vi.fn().mockResolvedValue({ error: null }),
    memberInsert: vi.fn(),
    profileInsert: vi.fn(),
    profileUpdate: vi.fn(),
    order: [] as string[],
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: (cols: string) => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => {
              if (column === 'user_id') return { data: profiles[value] ?? null, error: null };
              void cols;
              return { data: opts.existingPseudo ? { user_id: PLAYER_ID } : null, error: null };
            },
          }),
        }),
        insert: async (row: unknown) => {
          calls.profileInsert(row);
          return { error: null };
        },
        update: (row: unknown) => ({
          eq: async () => {
            calls.profileUpdate(row);
            calls.order.push(`profile:${JSON.stringify(row)}`);
            return { error: opts.raiseError && calls.profileUpdate.mock.calls.length === 1 ? { message: 'x' } : null };
          },
        }),
      };
    }
    if (table === 'campaigns') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.campaignExists === false ? null : { id: CAMPAIGN_ID },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'campaign_members') {
      return {
        insert: async (row: unknown) => {
          calls.memberInsert(row);
          return { error: opts.memberError ? { message: 'boom' } : null };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  const admin = {
    from,
    rpc: vi.fn(async (name: string) => {
      calls.order.push(`rpc:${name}`);
      return { error: opts.revokeError ? { message: 'x' } : null };
    }),
    auth: {
      admin: {
        createUser: vi
          .fn()
          .mockResolvedValue(
            opts.createUserError
              ? { data: { user: null }, error: { message: opts.createUserError } }
              : { data: { user: { id: NEW_ID } }, error: null }
          ),
        updateUserById: vi.fn(async () => {
          calls.order.push('password');
          return { error: opts.updatePasswordError ? { message: 'x' } : null };
        }),
        deleteUser: calls.deleteUser,
      },
    },
  } as unknown as SupabaseClient;

  const fetchImpl = vi.fn(async () => {
    const status = opts.authUserStatus ?? 200;
    return new Response(JSON.stringify(opts.authUser ?? { id: DM_ID, role: 'authenticated' }), { status });
  }) as unknown as typeof fetch;

  const handle = createHandler({
    admin,
    supabaseUrl: 'http://gw',
    publishableKey: 'pk',
    domain: 'table',
    fetchImpl,
    anonymousLimit: 1000,
    actorLimit: 1000,
  });
  return { handle, admin, fetchImpl, calls };
}

const create = (over: Partial<ApiRequest> = {}): ApiRequest => ({
  method: 'POST',
  path: '/admin-api/accounts',
  authorization: `Bearer ${jwt('authenticated')}`,
  ip: '1.2.3.4',
  body: { pseudo: 'aragorn', campaignId: CAMPAIGN_ID },
  ...over,
});

describe('POST /admin-api/accounts', () => {
  it('creates a player account on a temporary password and attaches it to the campaign', async () => {
    const { handle, admin, calls } = setup();
    const res = await handle(create());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: NEW_ID, pseudo: 'aragorn' });
    const password = res.body.temporaryPassword as string;
    expect(password).toHaveLength(16);
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'aragorn@table.invalid', password, email_confirm: true })
    );
    expect(calls.profileInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'player', must_change_password: true, pseudo: 'aragorn' })
    );
    expect(calls.memberInsert).toHaveBeenCalledWith({ campaign_id: CAMPAIGN_ID, user_id: NEW_ID });
  });

  it.each([
    ['no token', { authorization: undefined }],
    ['malformed header', { authorization: 'Basic abc' }],
    ['service_role token', { authorization: `Bearer ${jwt('service_role')}` }],
    ['anon token', { authorization: `Bearer ${jwt('anon')}` }],
    ['opaque secret key', { authorization: 'Bearer sb_secret_abcdef' }],
  ])('refuses %s with 401 and never reaches the authentication server', async (_label, over) => {
    const { handle, fetchImpl, calls } = setup();
    const res = await handle(create(over));
    expect(res.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls.memberInsert).not.toHaveBeenCalled();
  });

  it('refuses a token the authentication server rejects (forged, expired, revoked session)', async () => {
    const { handle, calls } = setup({ authUserStatus: 403 });
    const res = await handle(create());
    expect(res.status).toBe(401);
    expect(calls.memberInsert).not.toHaveBeenCalled();
  });

  it('answers 503 when the authentication server is down, without leaking anything', async () => {
    const { handle } = setup({ authUserStatus: 502 });
    const res = await handle(create());
    expect(res).toEqual({ status: 503, body: { error: 'auth_unavailable' } });
  });

  it.each([
    ['GoTrue says service_role', { id: DM_ID, role: 'service_role' }],
    ['GoTrue returns a non-UUID id', { id: 'not-a-uuid', role: 'authenticated' }],
    ['GoTrue returns no id', { role: 'authenticated' }],
  ])('refuses a token that claims authenticated when %s', async (_label, authUser) => {
    const { handle, calls } = setup({ authUser });
    expect((await handle(create())).status).toBe(401);
    expect(calls.memberInsert).not.toHaveBeenCalled();
  });

  it('refuses a player (role read from profiles, not from the token)', async () => {
    const { handle } = setup({ authUser: { id: PLAYER_ID, role: 'authenticated' } });
    expect((await handle(create())).status).toBe(403);
  });

  it('refuses a DM whose profile is archived or missing', async () => {
    const archived = setup({ profiles: { [DM_ID]: { role: 'dm', archived_at: '2026-01-01T00:00:00Z' } } });
    expect((await archived.handle(create())).status).toBe(403);
    const missing = setup({ profiles: {} });
    expect((await missing.handle(create())).status).toBe(403);
  });

  it.each([
    ['not an object', 'text'],
    ['missing campaign', { pseudo: 'aragorn' }],
    ['bad campaign id', { pseudo: 'aragorn', campaignId: 'nope' }],
    ['pseudo of the wrong type', { pseudo: 42, campaignId: CAMPAIGN_ID }],
  ])('rejects an invalid body (%s)', async (_label, body) => {
    const { handle } = setup();
    expect((await handle(create({ body }))).status).toBe(400);
  });

  it('rejects an invalid pseudo before creating anything', async () => {
    const { handle, admin } = setup();
    const res = await handle(create({ body: { pseudo: 'Bad Pseudo!', campaignId: CAMPAIGN_ID } }));
    expect(res).toEqual({ status: 400, body: { error: 'invalid_pseudo' } });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown campaign and creates nothing', async () => {
    const { handle, admin } = setup({ campaignExists: false });
    expect((await handle(create())).status).toBe(404);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('answers 409 for a pseudo already in use', async () => {
    const { handle, admin } = setup({ existingPseudo: true });
    expect((await handle(create())).status).toBe(409);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('maps a concurrent duplicate reported by the authentication server to 409', async () => {
    const { handle } = setup({ createUserError: 'A user with this email address has already been registered' });
    expect((await handle(create())).status).toBe(409);
  });

  it('removes the account again when the campaign attachment fails (no half-created account)', async () => {
    const { handle, calls } = setup({ memberError: true });
    const res = await handle(create());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'account_creation_failed' });
    expect(calls.deleteUser).toHaveBeenCalledWith(NEW_ID);
  });

  it('reports a failed rollback on stderr without leaking a secret and still answers 500', async () => {
    const { handle, calls } = setup({ memberError: true });
    calls.deleteUser.mockResolvedValue({ error: { message: 'cannot delete' } });
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const res = await handle(create());
    expect(res.status).toBe(500);
    expect(write).toHaveBeenCalledWith(expect.stringContaining(NEW_ID));
    expect(String(write.mock.calls[0][0])).not.toMatch(/password/i);
  });

  it('never puts the administration key or a password in an error answer', async () => {
    const { handle } = setup({ memberError: true });
    const res = await handle(create());
    expect(JSON.stringify(res.body)).not.toMatch(/service|key|password/i);
  });
});

describe('POST /admin-api/accounts/:id/reset-password', () => {
  const reset = (over: Partial<ApiRequest> = {}): ApiRequest => ({
    method: 'POST',
    path: `/admin-api/accounts/${PLAYER_ID}/reset-password`,
    authorization: `Bearer ${jwt('authenticated')}`,
    ip: '1.2.3.4',
    body: {},
    ...over,
  });

  it('raises the flag and the marker BEFORE changing the password, then revokes the sessions', async () => {
    const { handle, calls, admin } = setup();
    const res = await handle(reset());
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toHaveLength(16);
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(PLAYER_ID, {
      password: res.body.temporaryPassword,
    });
    expect(calls.order).toEqual([
      'profile:{"must_change_password":true,"password_reset_pending":true}',
      'password',
      'rpc:revoke_user_sessions',
    ]);
  });

  it('refuses the DM account as a target, whatever the caller', async () => {
    const { handle, calls } = setup();
    const res = await handle(reset({ path: `/admin-api/accounts/${DM_ID}/reset-password` }));
    expect(res).toEqual({ status: 403, body: { error: 'forbidden_target' } });
    expect(calls.order).toEqual([]);
  });

  it.each([
    ['a visitor', { authorization: undefined }, 401],
    ['a service_role token', { authorization: `Bearer ${jwt('service_role')}` }, 401],
  ])('refuses %s', async (_label, over, status) => {
    const { handle, calls } = setup();
    expect((await handle(reset(over))).status).toBe(status);
    expect(calls.order).toEqual([]);
  });

  it('refuses a player caller', async () => {
    const { handle, calls } = setup({ authUser: { id: PLAYER_ID, role: 'authenticated' } });
    expect((await handle(reset())).status).toBe(403);
    expect(calls.order).toEqual([]);
  });

  it('answers 404 for an unknown account and 409 for an archived one, changing nothing', async () => {
    const unknown = setup();
    expect((await unknown.handle(reset({ path: `/admin-api/accounts/${NEW_ID}/reset-password` }))).status).toBe(404);
    expect(unknown.calls.order).toEqual([]);
    const archived = setup({
      profiles: {
        [DM_ID]: { role: 'dm', archived_at: null },
        [PLAYER_ID]: { role: 'player', archived_at: '2026-01-01T00:00:00Z' },
      },
    });
    expect((await archived.handle(reset())).status).toBe(409);
    expect(archived.calls.order).toEqual([]);
  });

  it('rejects a malformed target id before any database call', async () => {
    const { handle, calls } = setup();
    expect((await handle(reset({ path: '/admin-api/accounts/not-a-uuid-at-all/reset-password' }))).status).toBe(404);
    const almost = `/admin-api/accounts/${'a'.repeat(36)}/reset-password`;
    expect((await handle(reset({ path: almost }))).status).toBe(400);
    expect(calls.order).toEqual([]);
  });

  it('puts the previous flag back and does not leak when the password change fails', async () => {
    const { handle, calls } = setup({
      updatePasswordError: true,
      profiles: {
        [DM_ID]: { role: 'dm', archived_at: null },
        [PLAYER_ID]: { role: 'player', archived_at: null, must_change_password: false },
      },
    });
    const res = await handle(reset());
    expect(res).toEqual({ status: 500, body: { error: 'password_reset_failed' } });
    expect(calls.profileUpdate).toHaveBeenLastCalledWith({
      must_change_password: false,
      password_reset_pending: false,
    });
    expect(calls.order).not.toContain('rpc:revoke_user_sessions');
  });

  it('does not touch the password when the flag could not be raised', async () => {
    const { handle, calls } = setup({ raiseError: true });
    expect((await handle(reset())).status).toBe(503);
    expect(calls.order).not.toContain('password');
  });

  it('reports a failed session revocation as an error (the DM must retry)', async () => {
    const { handle } = setup({ revokeError: true });
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const res = await handle(reset());
    expect(res).toEqual({ status: 500, body: { error: 'session_revocation_failed' } });
    expect(String(write.mock.calls[0][0])).not.toMatch(/password/i);
  });

  it('only accepts POST', async () => {
    const { handle } = setup();
    expect((await handle(reset({ method: 'GET' }))).status).toBe(405);
  });
});

describe('routing and limits', () => {
  it('serves the health check without authentication', async () => {
    const { handle } = setup();
    expect(await handle({ method: 'GET', path: '/admin-api/health', ip: 'x', body: undefined })).toEqual({
      status: 200,
      body: { ok: true },
    });
  });

  it.each([
    ['GET', '/admin-api/accounts', 405],
    ['POST', '/admin-api/health', 405],
    ['POST', '/admin-api/unknown', 404],
    ['POST', '/accounts', 404],
  ])('%s %s -> %i', async (method, path, status) => {
    const { handle } = setup();
    expect((await handle(create({ method, path }))).status).toBe(status);
  });

  it('throttles by address before any network call', async () => {
    const { admin, fetchImpl } = setup();
    const handle = createHandler({
      admin,
      supabaseUrl: 'http://gw',
      publishableKey: 'pk',
      domain: 'table',
      fetchImpl,
      anonymousLimit: 2,
    });
    const bad = create({ authorization: undefined });
    expect((await handle(bad)).status).toBe(401);
    expect((await handle(bad)).status).toBe(401);
    expect((await handle(bad)).status).toBe(429);
    // another address is not affected
    expect((await handle({ ...bad, ip: '9.9.9.9' })).status).toBe(401);
  });

  it('throttles creations per DM', async () => {
    const { admin, fetchImpl } = setup();
    const handle = createHandler({
      admin,
      supabaseUrl: 'http://gw',
      publishableKey: 'pk',
      domain: 'table',
      fetchImpl,
      anonymousLimit: 1000,
      actorLimit: 1,
    });
    expect((await handle(create())).status).toBe(201);
    expect((await handle(create({ body: { pseudo: 'legolas', campaignId: CAMPAIGN_ID } }))).status).toBe(429);
  });
});

describe('generateTemporaryPassword', () => {
  it('is 16 readable characters and different each time', () => {
    const a = generateTemporaryPassword();
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    expect(generateTemporaryPassword()).not.toBe(a);
  });
});

describe('FixedWindowLimiter', () => {
  it('counts per key and resets after the window', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(2, 1000, () => now);
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a'), limiter.allow('b')]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    now = 1001;
    expect(limiter.allow('a')).toBe(true);
  });
});
