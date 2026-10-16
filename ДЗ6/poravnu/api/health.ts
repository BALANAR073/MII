// api/health.ts
import { readServerEnv } from './_lib/env.js';
import { healthHttpStatus, runHealthCheck } from './_lib/health.js';
import { requestIdOf, serverLog } from './_lib/serverLog.js';

/**
 * GET /api/health — состояние приложения и его зависимостей (Supabase Auth и БД).
 * 200 — всё работает, 503 — что-то недоступно. Ответ не кэшируется (vercel.json).
 * @param request Входящий запрос.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdOf(request.headers);
  const report = await runHealthCheck(readServerEnv());
  const status = healthHttpStatus(report);
  serverLog(status === 200 ? 'info' : 'error', 'health.checked', {
    requestId,
    status,
    commit: report.commit,
    authMs: report.checks.auth.latencyMs,
    dbMs: report.checks.database.latencyMs,
    failed: Object.entries(report.checks)
      .filter(([, check]) => check.status === 'fail')
      .map(([name, check]) => `${name}: ${check.detail ?? ''}`),
    userAgent: request.headers.get('user-agent')?.slice(0, 80) ?? '',
  });
  return Response.json(report, { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
}

/** HEAD /api/health — для мониторингов, которые проверяют только статус. */
export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
