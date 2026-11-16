import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountError, createAccount, deriveEmail, validatePseudo } from './accounts.ts';

function fakeAdmin(opts: { createError?: string; insertError?: string } = {}) {
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const createUser = vi
    .fn()
    .mockResolvedValue(
      opts.createError
        ? { data: { user: null }, error: { message: opts.createError } }
        : { data: { user: { id: 'u-1' } }, error: null }
    );
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ? { message: opts.insertError } : null });
  const admin = {
    auth: { admin: { createUser, deleteUser } },
    from: vi.fn().mockReturnValue({ insert }),
  } as unknown as SupabaseClient;
  return { admin, createUser, deleteUser, insert };
}

const input = {
  pseudo: 'maitre',
  password: 'a-long-enough-pass',
  role: 'dm' as const,
  domain: 'table',
  mustChangePassword: false,
};

describe('validatePseudo', () => {
  it.each(['abc', 'max_20-chars_pseudo1', 'a1_-'])('accepts %s', (p) => {
    expect(() => validatePseudo(p)).not.toThrow();
  });
  it.each(['ab', 'Upper', 'with space', 'a'.repeat(21), 'accént', 'a@b.c', ''])('rejects %j', (p) => {
    expect(() => validatePseudo(p)).toThrow(AccountError);
  });
});

describe('deriveEmail', () => {
  it('builds <pseudo>@<domain>.invalid', () => {
    expect(deriveEmail('maitre', 'table')).toBe('maitre@table.invalid');
  });
  it('rejects a bad domain label', () => {
    expect(() => deriveEmail('maitre', 'a.b')).toThrow(AccountError);
  });
});

describe('createAccount', () => {
  it('creates a confirmed auth user then its profile', async () => {
    const { admin, createUser, insert } = fakeAdmin();
    await expect(createAccount(admin, input)).resolves.toEqual({
      userId: 'u-1',
      email: 'maitre@table.invalid',
    });
    expect(createUser).toHaveBeenCalledWith({
      email: 'maitre@table.invalid',
      password: input.password,
      email_confirm: true,
    });
    expect(insert).toHaveBeenCalledWith({
      user_id: 'u-1',
      pseudo: 'maitre',
      role: 'dm',
      must_change_password: false,
    });
  });

  it('refuses a bad pseudo before any call', async () => {
    const { admin, createUser } = fakeAdmin();
    await expect(createAccount(admin, { ...input, pseudo: 'Bad Pseudo' })).rejects.toMatchObject({
      code: 'invalid_pseudo',
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('refuses a short password before any call', async () => {
    const { admin, createUser } = fakeAdmin();
    await expect(createAccount(admin, { ...input, password: 'short' })).rejects.toMatchObject({
      code: 'invalid_password',
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('reports an authentication failure', async () => {
    const { admin, insert } = fakeAdmin({ createError: 'boom' });
    await expect(createAccount(admin, input)).rejects.toMatchObject({ code: 'auth_failed' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('deletes the auth user again when the profile is refused (second DM)', async () => {
    const { admin, deleteUser } = fakeAdmin({
      insertError: 'duplicate key value violates unique constraint "profiles_single_dm"',
    });
    await expect(createAccount(admin, input)).rejects.toMatchObject({ code: 'profile_failed' });
    expect(deleteUser).toHaveBeenCalledWith('u-1');
  });
});
