import { IS_SUPABASE } from '../../api';

export interface DemoAccount {
  name: string;
  email: string;
  password: string;
}

/** Пароль демо-аккаунтов на живом сайте (создаёт `scripts/e2e-supabase.mjs --seed-demo`). Аккаунты публичные, данные выдуманные. */
const LIVE_DEMO_PASSWORD = 'Demo-pass-2026';
/** Пароль демо-аккаунтов mock-API (`src/mocks/mockAuth.ts`). */
const MOCK_DEMO_PASSWORD = 'demo-pass';

const PEOPLE = [
  { id: 'borya', name: 'Боря' },
  { id: 'anya', name: 'Аня' },
  { id: 'vika', name: 'Вика' },
  { id: 'gosha', name: 'Гоша' },
] as const;

/**
 * Демо-аккаунты для быстрого входа (ДЗ6): на сайте — аккаунты в Supabase, локально — аккаунты mock-API.
 * @param supabase Работает ли приложение с настоящим сервером.
 * @returns Список аккаунтов для кнопок «Войти как…».
 */
export function demoAccounts(supabase: boolean = IS_SUPABASE): DemoAccount[] {
  return PEOPLE.map((person) => ({
    name: person.name,
    email: supabase ? `${person.id}.poravnu.demo@example.com` : `${person.id}@poravnu.demo`,
    password: supabase ? LIVE_DEMO_PASSWORD : MOCK_DEMO_PASSWORD,
  }));
}

/**
 * Демо-аккаунт ли это: такие не удаляем из профиля, иначе кнопки «Войти как…» перестанут работать.
 * @param email Email пользователя.
 */
export function isDemoEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith('.poravnu.demo@example.com') || normalized.endsWith('@poravnu.demo');
}
