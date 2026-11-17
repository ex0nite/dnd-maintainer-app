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
  profiles?: Record<string, { role: string; archived_at: string | null } | undefined>;
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
    auth: {
      admin: {
        createUser: vi
          .fn()
          .mockResolvedValue(
            opts.createUserError
              ? { data: { user: null }, error: { message: opts.createUserError } }
              : { data: { user: { id: NEW_ID } }, error: null }
          ),
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
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
