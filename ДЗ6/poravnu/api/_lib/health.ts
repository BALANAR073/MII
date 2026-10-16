// api/_lib/health.ts
import type { ServerEnv } from './env.js';

/**
 * Health check приложения: проверяет не только «функция отвечает», но и зависимости —
 * Supabase Auth и базу данных (настоящий запрос к PostgreSQL через RPC).
 * Мониторинг (UptimeRobot, плановая проверка в GitHub Actions) смотрит на HTTP-статус: 200 или 503.
 */

export type CheckStatus = 'ok' | 'fail';

export interface CheckResult {
  status: CheckStatus;
  latencyMs: number;
  detail?: string;
}

export interface HealthReport {
  status: 'ok' | 'down';
  service: 'poravnu';
  commit: string;
  region: string;
  checkedAt: string;
  checks: {
    config: CheckResult;
    auth: CheckResult;
    database: CheckResult;
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Сколько ждать каждую зависимость. Больше — мониторинг сочтёт сайт «зависшим». */
export const CHECK_TIMEOUT_MS = 8000;
/** Токен, которого точно нет в базе: get_invite_preview ответит 404 invalid_invite — значит, БД и функция работают. */
const PROBE_TOKEN = 'health-check-probe';

/**
 * Выполняет все проверки.
 * @param env Окружение функции.
 * @param fetchImpl Реализация fetch (в тестах — заглушка).
 * @param now Часы (в тестах — фиксированные).
 */
export async function runHealthCheck(env: ServerEnv, fetchImpl: FetchLike = fetch, now: () => number = Date.now): Promise<HealthReport> {
  const configured = env.supabaseUrl.startsWith('https://') && env.supabaseAnonKey !== '';
  const config: CheckResult = configured
    ? { status: 'ok', latencyMs: 0 }
    : { status: 'fail', latencyMs: 0, detail: 'Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY' };
  const skipped: CheckResult = { status: 'fail', latencyMs: 0, detail: 'Пропущено: нет конфигурации' };

  const headers = { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' };
  const [auth, database] = configured
    ? await Promise.all([
        timed(now, async () => {
          const response = await fetchImpl(`${env.supabaseUrl}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
          return response.ok ? null : `HTTP ${response.status}`;
        }),
        timed(now, async () => {
          const response = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/get_invite_preview`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ p_token: PROBE_TOKEN }),
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
          });
          if (response.status !== 404) {
            return `HTTP ${response.status}, ожидался 404`;
          }
          const body: unknown = await response.json();
          return isRecord(body) && body.message === 'invalid_invite' ? null : 'Неожиданный ответ функции';
        }),
      ])
    : [skipped, skipped];

  const allOk = [config, auth, database].every((check) => check.status === 'ok');
  return {
    status: allOk ? 'ok' : 'down',
    service: 'poravnu',
    commit: env.commit,
    region: env.region,
    checkedAt: new Date(now()).toISOString(),
    checks: { config, auth, database },
  };
}

/**
 * HTTP-статус ответа для мониторинга.
 * @param report Результат проверки.
 */
export function healthHttpStatus(report: HealthReport): 200 | 503 {
  return report.status === 'ok' ? 200 : 503;
}

async function timed(now: () => number, probe: () => Promise<string | null>): Promise<CheckResult> {
  const started = now();
  try {
    const problem = await probe();
    const latencyMs = now() - started;
    return problem === null ? { status: 'ok', latencyMs } : { status: 'fail', latencyMs, detail: problem };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const detail = name === 'TimeoutError' ? `Нет ответа за ${CHECK_TIMEOUT_MS} мс` : `Сетевая ошибка: ${name}`;
    return { status: 'fail', latencyMs: now() - started, detail };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
