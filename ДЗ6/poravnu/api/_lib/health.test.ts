// api/_lib/health.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readServerEnv } from './env';
import { healthHttpStatus, runHealthCheck, type FetchLike } from './health';

const env = readServerEnv({
  VITE_SUPABASE_URL: 'https://demo.supabase.co/',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
  APP_COMMIT: '0123456789abcdef',
  VERCEL_REGION: 'fra1',
});

function clock(): () => number {
  let t = 1_000;
  return () => (t += 7);
}

function fakeFetch(handlers: Record<string, () => Response | Promise<Response>>): FetchLike {
  return async (input) => {
    const path = new URL(input).pathname;
    const handler = handlers[path];
    if (handler === undefined) {
      throw new Error(`unexpected ${path}`);
    }
    return handler();
  };
}

const healthy = {
  '/auth/v1/settings': () => Response.json({ name: 'GoTrue' }),
  '/rest/v1/rpc/get_invite_preview': () => Response.json({ code: 'PT404', message: 'invalid_invite' }, { status: 404 }),
};

describe('readServerEnv', () => {
  it('убирает слэш в конце адреса и укорачивает коммит', () => {
    expect(env.supabaseUrl).toBe('https://demo.supabase.co');
    expect(env.commit).toBe('0123456');
    expect(env.region).toBe('fra1');
  });

  it('без переменных — значения по умолчанию', () => {
    expect(readServerEnv({})).toEqual({ supabaseUrl: '', supabaseAnonKey: '', commit: 'local', region: 'local' });
  });
});

describe('runHealthCheck', () => {
  it('всё работает → ok и HTTP 200; БД проверяется настоящим RPC с ответом 404 invalid_invite', async () => {
    const report = await runHealthCheck(env, fakeFetch(healthy), clock());
    expect(report.status).toBe('ok');
    expect(report.checks.auth.status).toBe('ok');
    expect(report.checks.database.status).toBe('ok');
    expect(report.commit).toBe('0123456');
    expect(healthHttpStatus(report)).toBe(200);
  });

  it('база недоступна (503 от PostgREST) → down и HTTP 503 с причиной', async () => {
    const report = await runHealthCheck(
      env,
      fakeFetch({ ...healthy, '/rest/v1/rpc/get_invite_preview': () => new Response('{}', { status: 503 }) }),
      clock(),
    );
    expect(report.status).toBe('down');
    expect(report.checks.database).toMatchObject({ status: 'fail', detail: 'HTTP 503, ожидался 404' });
    expect(healthHttpStatus(report)).toBe(503);
  });

  it('функция вернула 404 по другой причине (например, её удалили) → fail', async () => {
    const report = await runHealthCheck(
      env,
      fakeFetch({ ...healthy, '/rest/v1/rpc/get_invite_preview': () => Response.json({ code: 'PGRST202' }, { status: 404 }) }),
      clock(),
    );
    expect(report.checks.database.detail).toBe('Неожиданный ответ функции');
  });

  it('сетевая ошибка и таймаут Auth → fail с понятным текстом', async () => {
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    const report = await runHealthCheck(
      env,
      fakeFetch({
        ...healthy,
        '/auth/v1/settings': () => {
          throw timeout;
        },
      }),
      clock(),
    );
    expect(report.checks.auth).toMatchObject({ status: 'fail', detail: 'Нет ответа за 8000 мс' });
    expect(report.status).toBe('down');
  });

  it('нет конфигурации → down без сетевых запросов', async () => {
    const report = await runHealthCheck(readServerEnv({}), fakeFetch({}), clock());
    expect(report.status).toBe('down');
    expect(report.checks.config.status).toBe('fail');
    expect(report.checks.database.detail).toContain('нет конфигурации');
  });
});
