// Client of the account-admin service (AD-2), reached through the proxy at /admin-api/.
// It only needs the DM's access token; the service re-checks everything (token, session, role).
// No Supabase import here: the hook that owns the session hands the token in (AD-1).

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

export interface CreatedPlayer {
  userId: string;
  pseudo: string;
  /** Shown once to the DM; never stored by the app. */
  temporaryPassword: string;
}

const BASE = (import.meta.env.VITE_ADMIN_API_URL as string | undefined) ?? '/admin-api';

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new AdminApiError(0, 'network');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new AdminApiError(res.status, typeof json.error === 'string' ? json.error : 'unknown');
  return json as T;
}

export interface ResetPassword {
  userId: string;
  /** Shown once to the DM; never stored by the app. */
  temporaryPassword: string;
}

export function resetPlayerPassword(token: string, userId: string): Promise<ResetPassword> {
  return post<ResetPassword>(`/accounts/${encodeURIComponent(userId)}/reset-password`, token, {});
}

export function createPlayer(token: string, input: { pseudo: string; campaignId: string }): Promise<CreatedPlayer> {
  return post<CreatedPlayer>('/accounts', token, input);
}
