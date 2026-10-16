/**
 * Структурированные логи клиента: одна запись — один JSON-объект с уровнем, событием и контекстом.
 * Последние записи хранятся в памяти: их можно скопировать для анализа AI-агентом
 * (в консоли браузера: `copy(JSON.stringify(window.__poravnuLogs))`).
 * Пароли и токены в логи не пишутся — только код и текст ошибки.
 *
 * ДЗ6: записи уровней warn и error дополнительно отправляются пачками на POST /api/log
 * (navigator.sendBeacon) и попадают в Runtime Logs Vercel вместе с версией сборки и id сессии.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

/** Куда отправлять пачку записей; в тестах подменяется. */
export type LogTransport = (url: string, body: string) => boolean;

interface RemoteConfig {
  url: string;
  release: string;
  transport: LogTransport;
}

const MAX_ENTRIES = 200;
/** Через сколько миллисекунд отправлять накопленные ошибки — чтобы серия ошибок ушла одним запросом. */
export const FLUSH_DELAY_MS = 2000;
/** Не больше стольких записей за сессию: защита от бесконечного цикла ошибок. */
export const MAX_REMOTE_PER_SESSION = 100;

const entries: LogEntry[] = [];
const queue: LogEntry[] = [];
const sessionId = makeSessionId();
let silent = false;
let remote: RemoteConfig | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sentThisSession = 0;

declare global {
  interface Window {
    __poravnuLogs?: LogEntry[];
  }
}

/**
 * Пишет запись в журнал и в консоль разработчика.
 * @param level Уровень.
 * @param event Короткое имя события в формате `область.что_случилось`.
 * @param context Подробности: операция, HTTP-статус, код ошибки.
 */
export function log(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, event, ...context };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
  if (typeof window !== 'undefined') {
    window.__poravnuLogs = entries;
  }
  if (remote !== null && level !== 'info' && sentThisSession < MAX_REMOTE_PER_SESSION) {
    sentThisSession += 1;
    queue.push(entry);
    flushTimer ??= setTimeout(flushRemoteLogs, FLUSH_DELAY_MS);
  }
  if (silent) {
    return;
  }
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/**
 * Включает отправку warn/error на сервер.
 * @param url Адрес приёма, обычно `/api/log`.
 * @param release Версия сборки (короткий хеш коммита) — по ней видно, после какого релиза пошли ошибки.
 * @param transport Способ отправки; по умолчанию navigator.sendBeacon (переживает закрытие вкладки).
 */
export function enableRemoteLogging(url: string, release: string, transport: LogTransport = beacon): void {
  remote = { url, release, transport };
}

/** Немедленно отправляет накопленные записи (вызывается по таймеру и при уходе со страницы). */
export function flushRemoteLogs(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (remote === null || queue.length === 0) {
    return;
  }
  const path = typeof window === 'undefined' ? undefined : window.location.pathname;
  const batch = queue.splice(0).map((entry) => toRemote(entry, remote?.release ?? '', path));
  remote.transport(remote.url, JSON.stringify({ entries: batch }));
}

/**
 * Ловит необработанные ошибки и отклонённые промисы, чтобы они попали в журнал (и на сервер),
 * а не только в консоль браузера пользователя.
 * @param target Объект с событиями error / unhandledrejection (window).
 * @returns Функция отписки.
 */
export function installGlobalErrorHandlers(target: Window): () => void {
  const onError = (event: ErrorEvent) => {
    log('error', 'app.uncaught', { message: event.message, source: shortSource(event.filename), line: event.lineno });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    log('error', 'app.unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason) });
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') {
      flushRemoteLogs();
    }
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  target.document.addEventListener('visibilitychange', onHide);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    target.document.removeEventListener('visibilitychange', onHide);
  };
}

/** Копия журнала (для тестов и диагностики). */
export function getLogEntries(): LogEntry[] {
  return [...entries];
}

/** Id текущей сессии браузера (случайный, без связи с пользователем). */
export function getSessionId(): string {
  return sessionId;
}

/**
 * Включает или выключает вывод в консоль (журнал в памяти ведётся всегда). В тестах вывод выключен.
 * @param value `true` — не писать в консоль.
 */
export function setLogSilent(value: boolean): void {
  silent = value;
}

/** Сбрасывает отправку на сервер (для тестов). */
export function resetRemoteLogging(): void {
  remote = null;
  queue.length = 0;
  sentThisSession = 0;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function toRemote(entry: LogEntry, release: string, path: string | undefined): Record<string, unknown> {
  const { ts, level, event, op, status, code, kind, message } = entry;
  return { ts, level, event, op, status, code, kind, message, path, release, session: sessionId };
}

function beacon(url: string, body: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }
  return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
}

function shortSource(filename: string): string {
  try {
    return new URL(filename).pathname;
  } catch {
    return filename.slice(0, 80);
  }
}

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}
