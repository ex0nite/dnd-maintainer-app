// The user types a pseudo; the authentication service knows a derived, never-displayed
// address `<pseudo>@<domain>.invalid` (AD-3). Same pattern as services/account-admin.

export const PSEUDO_PATTERN = /^[a-z0-9_-]{3,20}$/;
const DEFAULT_DOMAIN = 'table';

/** Returns the derived address, or null when the input cannot be a valid pseudo. */
export function pseudoToEmail(input: string, domain: string = DEFAULT_DOMAIN): string | null {
  const pseudo = input.trim().toLowerCase();
  if (!PSEUDO_PATTERN.test(pseudo)) return null;
  return `${pseudo}@${domain}.invalid`;
}
