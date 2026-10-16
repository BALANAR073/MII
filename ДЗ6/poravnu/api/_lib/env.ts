// api/_lib/env.ts
/**
 * Доступ к переменным окружения серверных функций без зависимости от @types/node (правило 14).
 * Значения задаются при выкладке: `vercel deploy -e VITE_SUPABASE_URL=… -e APP_COMMIT=…`.
 */

declare const process: { env: Record<string, string | undefined> } | undefined;

/** Нужные функциям переменные. Секретов среди них нет: адрес и publishable-ключ Supabase публичны. */
export interface ServerEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  commit: string;
  region: string;
}

/**
 * Читает окружение функции.
 * @param source Источник значений; по умолчанию — `process.env`.
 */
export function readServerEnv(source: Record<string, string | undefined> = currentEnv()): ServerEnv {
  return {
    supabaseUrl: (source.VITE_SUPABASE_URL ?? '').replace(/\/+$/, ''),
    supabaseAnonKey: source.VITE_SUPABASE_ANON_KEY ?? '',
    commit: (source.APP_COMMIT ?? source.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    region: source.VERCEL_REGION ?? 'local',
  };
}

function currentEnv(): Record<string, string | undefined> {
  return typeof process === 'undefined' ? {} : process.env;
}
