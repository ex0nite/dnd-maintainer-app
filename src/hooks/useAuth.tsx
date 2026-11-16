import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { pseudoToEmail } from '@/lib/auth-email';

const ACCOUNT_DOMAIN: string | undefined = import.meta.env.VITE_ACCOUNT_DOMAIN;

export interface AuthContextValue {
  session: Session | null;
  /** True until the stored session (if any) has been read. */
  isLoading: boolean;
  /** Resolves true on success. A bad pseudo and a bad password are indistinguishable (FR2). */
  signIn: (pseudo: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setIsLoading(false);
      // Nothing of the previous user may stay in memory.
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = useCallback(async (pseudo: string, password: string) => {
    const email = pseudoToEmail(pseudo, ACCOUNT_DOMAIN);
    if (!email || !password) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({ session, isLoading, signIn, signOut }), [session, isLoading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
