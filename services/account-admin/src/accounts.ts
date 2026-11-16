// Shared account-creation module (AD-2, AD-15).
//
// The ONLY place that creates `profiles` rows. Used by the bootstrap script now
// (story 1.2) and by the account-admin service later (story 2.2).
// It never reads a secret itself: the caller hands it an already-configured
// admin client built from environment variables.

import type { SupabaseClient } from '@supabase/supabase-js';

export const PSEUDO_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 12;

export type AccountRole = 'dm' | 'player';

export type AccountErrorCode =
  | 'invalid_pseudo'
  | 'invalid_password'
  | 'invalid_domain'
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
export async function createAccount(admin: SupabaseClient, input: CreateAccountInput): Promise<CreatedAccount> {
  const email = deriveEmail(input.pseudo, input.domain);
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError('invalid_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
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

  return { userId, email };
}
