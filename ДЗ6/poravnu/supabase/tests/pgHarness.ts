import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Тестовый стенд базы: настоящий PostgreSQL (PGlite, WebAssembly) с минимальной заглушкой Supabase:
 * схема auth, таблица auth.users, функция auth.uid() и роли anon / authenticated.
 * На него накатываются те же миграции, что уходят в Supabase, — так схема, RLS и RPC
 * проверяются автотестами без облака и без Docker.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  -- Как в Supabase: id пользователя берётся из JWT, который PostgREST кладёт в настройки запроса.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Как в Supabase: по умолчанию роли API получают права на новые таблицы, миграция их забирает.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

export interface TestDb {
  db: PGlite;
  /** Создаёт пользователя в auth.users (профиль создаст триггер) и возвращает его id. */
  createUser: (name: string) => Promise<string>;
  /** Дальнейшие запросы — от имени вошедшего пользователя с этим id. */
  asUser: (userId: string) => Promise<void>;
  /** Дальнейшие запросы — от имени гостя. */
  asAnon: () => Promise<void>;
  /** Дальнейшие запросы — от владельца базы (обходит RLS), для подготовки данных. */
  asAdmin: () => Promise<void>;
}

/**
 * Поднимает чистую базу и накатывает все миграции из supabase/migrations по порядку имён.
 * @returns База и помощники для смены роли.
 */
export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  let userCounter = 0;
  const asAdmin = async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  };
  return {
    db,
    asAdmin,
    asUser: async (userId) => {
      await db.exec(`reset role; set role authenticated;`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    },
    asAnon: async () => {
      await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`);
    },
    createUser: async (name) => {
      await asAdmin();
      userCounter += 1;
      const id = `00000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`;
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
        id,
        `user${userCounter}@example.com`,
        JSON.stringify({ name }),
      ]);
      return id;
    },
  };
}

/**
 * Код SQLSTATE из ошибки PGlite (или `null`, если это не ошибка базы).
 * @param error Пойманная ошибка.
 * @returns Код вида 42501, 23514, PT403.
 */
export function sqlState(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : null;
}
