// Shared account-creation module (AD-2, AD-15).
//
// The ONLY place that creates `profiles` rows. Used by the bootstrap script now
// (story 1.2) and by the account-admin service later (story 2.2).
// It never reads a secret itself: the caller hands it an already-configured
// admin client built from environment variables.

import type { SupabaseClient } from '@supabase/supabase-js';

export const PSEUDO_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 12;
const PENDING_BAN = '876000h';

export type AccountRole = 'dm' | 'player';

export type AccountErrorCode =
  | 'invalid_pseudo'
  | 'invalid_password'
  | 'invalid_domain'
  | 'invalid_role'
  | 'auth_failed'
  | 'profile_failed';

export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
  }
}

export function validatePseudo(pseudo: string): void {
  if (!PSEUDO_PATTERN.test(pseudo)) {
    throw new AccountError('invalid_pseudo', 'Pseudo must match ^[a-z0-9_-]{3,20}$');
  }
}

/** Fictitious authentication address derived from the pseudo (never shown, never a real mailbox). */
export function deriveEmail(pseudo: string, domain: string): string {
  validatePseudo(pseudo);
  if (!/^[a-z0-9-]+$/.test(domain)) {
    throw new AccountError('invalid_domain', 'Domain label must match ^[a-z0-9-]+$');
  }
  return `${pseudo}@${domain}.invalid`;
}

export interface CreateAccountInput {
  pseudo: string;
  password: string;
  role: AccountRole;
  domain: string;
  /** The DM bootstrap account chose its own password; a player account starts on a temporary one. */
  mustChangePassword: boolean;
}

export interface CreatedAccount {
  userId: string;
  email: string;
}

/**
 * Create the authentication account (confirmed) and its `profiles` row.
 * If the profile cannot be written (e.g. a second `dm`), the authentication
 * account is deleted again so no orphan remains.
 */
async function createAccount(admin: SupabaseClient, input: CreateAccountInput): Promise<CreatedAccount> {
  if (input.role !== 'dm' && input.role !== 'player') {
    throw new AccountError('invalid_role', 'Role must be dm or player');
  }
  const email = deriveEmail(input.pseudo, input.domain);
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError('invalid_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  // Created banned: until the profile exists the account must not be usable, even if
  // the cleanup below fails. The ban is lifted only once the profile is written.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    ban_duration: PENDING_BAN,
  });
  if (error || !data.user) {
    throw new AccountError('auth_failed', error?.message ?? 'Authentication account not created');
  }
  const userId = data.user.id;

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: userId,
    pseudo: input.pseudo,
    role: input.role,
    must_change_password: input.mustChangePassword,
  });
  if (profileError) {
    // Roll back the authentication account; surface the original failure either way.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    const suffix = cleanupError ? ` (cleanup of auth user ${userId} failed)` : '';
    throw new AccountError('profile_failed', `${profileError.message}${suffix}`);
  }

  const { error: unbanError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });
  if (unbanError) {
    await admin.auth.admin.deleteUser(userId);
    throw new AccountError('auth_failed', `Account activation failed: ${unbanError.message}`);
  }

  return { userId, email };
}

/** The DM account: only the bootstrap script calls this (AD-15). No route may. */
export function createDmAccount(
  admin: SupabaseClient,
  input: Omit<CreateAccountInput, 'role' | 'mustChangePassword'>
): Promise<CreatedAccount> {
  return createAccount(admin, { ...input, role: 'dm', mustChangePassword: false });
}

/** A player account always starts on a temporary password (AD-3). */
export function createPlayerAccount(
  admin: SupabaseClient,
  input: Omit<CreateAccountInput, 'role' | 'mustChangePassword'>
): Promise<CreatedAccount> {
  return createAccount(admin, { ...input, role: 'player', mustChangePassword: true });
}
