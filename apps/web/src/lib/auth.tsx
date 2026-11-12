import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { callFunction, supabase } from './supabase';

type AuthState = { session: Session | null; loading: boolean; tgError?: boolean };
const AuthContext = createContext<AuthState>({ session: null, loading: true });

const emailFor = (tgId: number) => `tg_${tgId}@users.topteam.local`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let ready = false;
    let cancelled = false;

    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      let tgError = false;
      // Внутри Telegram Mini App входим автоматически по подписанным initData
      const wa = window.Telegram?.WebApp;
      const tgUser = wa?.initData ? wa.initDataUnsafe.user : undefined;
      if (tgUser && session?.user.email !== emailFor(tgUser.id)) {
        try {
          const { data } = await callFunction<{ token_hash?: string }>('auth-telegram', { init_data: wa!.initData });
          if (data.token_hash) {
            const v = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
            session = v.data.session;
            tgError = !session;
          } else tgError = true;
        } catch {
          tgError = true;
        }
      }
      ready = true;
      if (!cancelled) setState({ session, loading: false, tgError });
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (ready) setState({ session, loading: false });
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

/** Код приглашения из /join/:code, сохранённый до входа. */
const PENDING_KEY = 'topteam.pendingInvite';
// eslint-disable-next-line react-refresh/only-export-components
export const pendingInvite = {
  get: () => {
    try {
      return localStorage.getItem(PENDING_KEY);
    } catch {
      return null;
    }
  },
  set: (code: string) => {
    try {
      localStorage.setItem(PENDING_KEY, code.toUpperCase());
    } catch {
      /* приватный режим */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* приватный режим */
    }
  },
};
