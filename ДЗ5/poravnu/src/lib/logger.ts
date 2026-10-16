/**
 * Структурированные логи клиента: одна запись — один JSON-объект с уровнем, событием и контекстом.
 * Последние записи хранятся в памяти: их можно скопировать для анализа AI-агентом
 * (в консоли браузера: `copy(JSON.stringify(window.__poravnuLogs))`).
 * Пароли и токены в логи не пишутся — только код и текст ошибки.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

const MAX_ENTRIES = 200;
const entries: LogEntry[] = [];
let silent = false;

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

/** Копия журнала (для тестов и диагностики). */
export function getLogEntries(): LogEntry[] {
  return [...entries];
}

/**
 * Включает или выключает вывод в консоль (журнал в памяти ведётся всегда). В тестах вывод выключен.
 * @param value `true` — не писать в консоль.
 */
export function setLogSilent(value: boolean): void {
  silent = value;
}
