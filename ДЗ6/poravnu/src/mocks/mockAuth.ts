import { ApiError, type AuthApi, type AuthUser, type OAuthProvider } from '../types/api';

/**
 * Вход и регистрация для демо без бэкенда и для автотестов — тот же контракт AuthApi, что у Supabase Auth.
 * Демо-пользователи совпадают с участниками демо-групп; пароль у всех — `demo-pass`.
 */

interface MockAccount extends AuthUser {
  password: string;
}

const DEMO_PASSWORD = 'demo-pass';
const DEMO_ACCOUNTS: readonly MockAccount[] = [
  { id: 'borya', email: 'borya@poravnu.demo', name: 'Боря', password: DEMO_PASSWORD },
  { id: 'anya', email: 'anya@poravnu.demo', name: 'Аня', password: DEMO_PASSWORD },
  { id: 'vika', email: 'vika@poravnu.demo', name: 'Вика', password: DEMO_PASSWORD },
  { id: 'gosha', email: 'gosha@poravnu.demo', name: 'Гоша', password: DEMO_PASSWORD },
];

let accounts: MockAccount[] = [...DEMO_ACCOUNTS];
// В демо сразу вошёл Боря — как было в ДЗ4, чтобы приложение открывалось без регистрации.
let current: AuthUser | null = publicUser(DEMO_ACCOUNTS[0]);
const listeners = new Set<(user: AuthUser | null) => void>();

/** Id текущего пользователя для mock-API; без входа — пустая строка (запросы получат отказ). */
export function mockUserId(): string {
  return current?.id ?? '';
}

/** Имя текущего пользователя для mock-API. */
export function mockUserName(): string {
  return current?.name ?? '';
}

/**
 * Сбрасывает учётные записи и входит под указанным демо-пользователем (или выходит при `null`).
 * @param userId Id демо-пользователя.
 */
export function resetMockAuth(userId: string | null = 'borya'): void {
  accounts = [...DEMO_ACCOUNTS];
  setCurrent(userId === null ? null : publicUser(accounts.find((account) => account.id === userId)));
}

export const mockAuth: AuthApi = {
  getUser: () => Promise.resolve(current),
  onChange: (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  signUp: ({ email, password, name }) => {
    const normalized = email.trim().toLowerCase();
    if (accounts.some((account) => account.email === normalized)) {
      return Promise.reject(new ApiError('auth-email-taken', 'Этот email уже зарегистрирован'));
    }
    const account: MockAccount = { id: `user-${accounts.length + 1}`, email: normalized, name: name.trim(), password };
    accounts.push(account);
    const user = publicUser(account);
    setCurrent(user);
    return user === null ? Promise.reject(new ApiError('server', 'Не удалось создать сессию')) : Promise.resolve(user);
  },
  signIn: ({ email, password }) => {
    const account = accounts.find((item) => item.email === email.trim().toLowerCase() && item.password === password);
    if (account === undefined) {
      return Promise.reject(new ApiError('auth-invalid-credentials', 'Неверный email или пароль'));
    }
    const user = publicUser(account);
    setCurrent(user);
    return user === null ? Promise.reject(new ApiError('server', 'Не удалось создать сессию')) : Promise.resolve(user);
  },
  signOut: () => {
    setCurrent(null);
    return Promise.resolve();
  },
  oauthProviders: () => Promise.resolve([...mockProviders]),
  signInWithOAuth: (provider) => {
    lastOAuthProvider = provider;
    return Promise.resolve();
  },
};

let mockProviders: OAuthProvider[] = [];
let lastOAuthProvider: OAuthProvider | null = null;

/**
 * Включает кнопки внешнего входа в демо и тестах.
 * @param providers Провайдеры, которые «включены».
 */
export function setMockOAuthProviders(providers: OAuthProvider[]): void {
  mockProviders = providers;
  lastOAuthProvider = null;
}

/** Последний провайдер, на который mock «увёл» пользователя (для тестов). */
export function lastMockOAuthProvider(): OAuthProvider | null {
  return lastOAuthProvider;
}

function setCurrent(user: AuthUser | null): void {
  current = user;
  for (const listener of listeners) {
    listener(user);
  }
}

function publicUser(account: MockAccount | undefined): AuthUser | null {
  return account === undefined ? null : { id: account.id, email: account.email, name: account.name };
}
