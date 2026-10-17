// api/_lib/clientLog.ts
/**
 * Разбор журналов, которые браузер присылает на POST /api/log.
 * Принимаем только белый список полей и обрезаем строки: в логи не должны попасть email, токены
 * и произвольные данные пользователя (152-ФЗ, OWASP A09 — логирование без утечек).
 */

export interface ClientLogRecord {
  ts: string;
  level: 'warn' | 'error';
  event: string;
  op?: string;
  status?: number;
  code?: string;
  kind?: string;
  message?: string;
  path?: string;
  release?: string;
  session?: string;
}

/** Максимальный размер тела запроса, байт. */
export const MAX_BODY_BYTES = 16_384;
/** Максимум записей в одной пачке. */
export const MAX_RECORDS = 20;

const STRING_LIMITS = { event: 60, op: 60, code: 40, kind: 30, message: 300, path: 120, release: 40, session: 40 } as const;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

/**
 * Превращает тело запроса в безопасные записи. Невалидные записи отбрасываются.
 * @param body Распарсенный JSON: объект `{ entries: [...] }` или массив записей.
 * @returns Записи, которые можно писать в лог (не больше {@link MAX_RECORDS}).
 */
export function parseClientLogs(body: unknown): ClientLogRecord[] {
  const list = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.entries) ? body.entries : [];
  const records: ClientLogRecord[] = [];
  for (const item of list.slice(0, MAX_RECORDS)) {
    const record = toRecord(item);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Пришёл ли запрос со страниц самого сайта (аудит ДЗ6, OWASP A04/A05).
 * Без проверки любая чужая страница могла бы слать посетителям скрипт, который засыпает /api/log мусором:
 * журнал раздувается, настоящие ошибки тонут. Браузер сам ставит `Sec-Fetch-Site` и `Origin`,
 * подделать их из скрипта на чужом сайте нельзя. Запросы без этих заголовков (curl, мониторинг)
 * пропускаются: от целенаправленного спама защищает лимит запросов на стороне Vercel (см. security_audit.md).
 * @param headers Заголовки запроса.
 * @param requestUrl Полный адрес запроса — из него берётся свой origin.
 */
export function isSameOriginRequest(headers: Headers, requestUrl: string): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null) {
    return site === 'same-origin';
  }
  const origin = headers.get('origin');
  if (origin === null) {
    return true;
  }
  try {
    return origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Удаляет из текста то, что похоже на персональные данные и секреты.
 * @param text Исходная строка.
 */
export function redact(text: string): string {
  return text.replace(EMAIL, '[email]').replace(JWT, '[jwt]').replace(LONG_TOKEN, '[token]');
}

function toRecord(item: unknown): ClientLogRecord | null {
  if (!isRecord(item)) {
    return null;
  }
  const level = item.level;
  const event = text(item.event, STRING_LIMITS.event);
  if ((level !== 'warn' && level !== 'error') || event === undefined) {
    return null;
  }
  const record: ClientLogRecord = { ts: validTs(item.ts), level, event };
  const op = text(item.op, STRING_LIMITS.op);
  const code = text(item.code, STRING_LIMITS.code);
  const kind = text(item.kind, STRING_LIMITS.kind);
  const message = text(item.message, STRING_LIMITS.message);
  const path = text(item.path, STRING_LIMITS.path);
  const release = text(item.release, STRING_LIMITS.release);
  const session = text(item.session, STRING_LIMITS.session);
  if (op !== undefined) record.op = op;
  if (typeof item.status === 'number' && Number.isInteger(item.status) && item.status >= 0 && item.status < 1000)
    record.status = item.status;
  if (code !== undefined) record.code = code;
  if (kind !== undefined) record.kind = kind;
  if (message !== undefined) record.message = message;
  // Только путь без query: в query бывают токены приглашений.
  if (path !== undefined) record.path = path.split('?')[0];
  if (release !== undefined) record.release = release;
  if (session !== undefined) record.session = session;
  return record;
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return redact(value.trim()).slice(0, limit);
}

function validTs(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
