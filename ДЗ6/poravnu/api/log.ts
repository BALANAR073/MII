// api/log.ts
import { isSameOriginRequest, MAX_BODY_BYTES, parseClientLogs } from './_lib/clientLog.js';
import { requestIdOf, serverLog } from './_lib/serverLog.js';

/**
 * POST /api/log — приём ошибок из браузера (navigator.sendBeacon). Записи проходят белый список полей
 * и очистку от email/токенов, затем пишутся в Runtime Logs Vercel как JSON с `source: "client"`.
 * Всегда отвечает 204, чтобы сбой логирования не мешал пользователю; слишком большое тело — 413,
 * запрос со страницы чужого сайта — 403 (аудит ДЗ6).
 * @param request Входящий запрос.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request.headers);
  if (!isSameOriginRequest(request.headers, request.url)) {
    serverLog('warn', 'client_log.cross_site', { requestId, origin: request.headers.get('origin')?.slice(0, 80) ?? '' });
    return new Response(null, { status: 403 });
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    serverLog('warn', 'client_log.too_large', { requestId, bytes: declared });
    return new Response(null, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    serverLog('warn', 'client_log.too_large', { requestId, bytes: raw.length });
    return new Response(null, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    serverLog('warn', 'client_log.bad_json', { requestId });
    return new Response(null, { status: 204 });
  }
  const records = parseClientLogs(body);
  for (const { ts, level, event, ...rest } of records) {
    serverLog(level, `client.${event}`, { ...rest, clientTs: ts, source: 'client', requestId });
  }
  return new Response(null, { status: 204 });
}
