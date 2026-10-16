import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../api';
import { log } from '../lib/logger';
import type { AuthUser } from '../types/api';

type AuthState = { status: 'loading' } | { status: 'ready'; user: AuthUser | null };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string, name: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Сессия пользователя (FR-1.1, FR-1.2). Подписывается на изменения входа: если токен истёк
 * и Supabase не смог его обновить, пользователь станет `null`, а RequireAuth отправит на вход (ERR-6).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    auth
      .getUser()
      .then((user) => {
        if (active) {
          setState({ status: 'ready', user });
        }
      })
      .catch((error: unknown) => {
        log('error', 'auth.session_restore_failed', { message: error instanceof Error ? error.message : String(error) });
        if (active) {
          setState({ status: 'ready', user: null });
        }
      });
    const unsubscribe = auth.onChange((user) => setState({ status: 'ready', user }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: (email, password) => auth.signIn({ email, password }),
      signUp: (email, password, name) => auth.signUp({ email, password, name }),
      signOut: () => auth.signOut(),
    }),
    [state],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Состояние входа и действия с сессией.
 * @returns Контекст авторизации.
 * @throws {Error} Если AuthProvider не подключён.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth нужно вызывать внутри AuthProvider');
  }
  return value;
}

/**
 * Вошедший пользователь на защищённых экранах (их оборачивает RequireAuth).
 * @returns Пользователь.
 * @throws {Error} Если вызвать вне защищённого маршрута.
 */
export function useCurrentUser(): AuthUser {
  const { state } = useAuth();
  if (state.status !== 'ready' || state.user === null) {
    throw new Error('useCurrentUser вызывается только внутри RequireAuth');
  }
  return state.user;
}
