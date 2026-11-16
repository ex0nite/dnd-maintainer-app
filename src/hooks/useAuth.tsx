import { createContext, useCallback, useRef, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { pseudoToEmail } from '@/lib/auth-email';

const ACCOUNT_DOMAIN: string | undefined = import.meta.env.VITE_ACCOUNT_DOMAIN;

export type SignInResult = 'ok' | 'invalid' | 'unavailable';

export interface AuthContextValue {
  session: Session | null;
  /** True until the stored session (if any) has been read. */
  isLoading: boolean;
  /**
   * 'invalid' covers a bad pseudo and a bad password alike (FR2); 'unavailable' is any other
   * failure (network, rate limit, server), so the user knows retrying the same input may work.
   */
  signIn: (pseudo: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      userIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setIsLoading(false);
      // Nothing of the previous user may stay in memory: clear on sign-out and on any change of user.
      const nextUserId = next?.user?.id ?? null;
      if (event === 'SIGNED_OUT' || (userIdRef.current !== null && nextUserId !== userIdRef.current)) {
        queryClient.clear();
      }
      userIdRef.current = nextUserId;
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = useCallback(async (pseudo: string, password: string) => {
    const email = pseudoToEmail(pseudo, ACCOUNT_DOMAIN);
    if (!email || !password) return 'invalid';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return 'ok';
    return error.status === 400 || error.status === 401 ? 'invalid' : 'unavailable';
  }, []);

  const signOut = useCallback(async () => {
    // The network call can fail (offline, 5xx) and then keeps the local session: always drop it locally.
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo(() => ({ session, isLoading, signIn, signOut }), [session, isLoading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
