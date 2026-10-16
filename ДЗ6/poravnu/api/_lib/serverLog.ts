// api/_lib/serverLog.ts
/**
 * Структурированные логи серверных функций Vercel: одна строка — один JSON-объект.
 * Vercel собирает stdout функций в Runtime Logs, где строки можно фильтровать по полям,
 * а выгрузку — отдавать AI-агенту на анализ (ДЗ6, раздел «Логирование»).
 * Файлы в папке `api/_lib` не становятся отдельными эндпоинтами: Vercel пропускает имена с `_`.
 */

export type ServerLogLevel = 'info' | 'warn' | 'error';

export interface ServerLogEntry {
  ts: string;
  level: ServerLogLevel;
  service: 'poravnu-api';
  event: string;
  [key: string]: unknown;
}

/** Куда писать строку лога; в тестах подменяется. */
export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => {
  // Vercel читает stdout функции; console.info — штатный способ записать строку (правило 17 касается клиента).
  console.info(line);
};

/**
 * Пишет одну запись серверного лога.
 * @param level Уровень.
 * @param event Имя события `область.что_случилось`.
 * @param context Поля записи: requestId, статус, длительность. Секреты сюда не передаются.
 * @param sink Куда писать (по умолчанию — stdout).
 * @returns Записанный объект — для тестов.
 */
export function serverLog(
  level: ServerLogLevel,
  event: string,
  context: Record<string, unknown> = {},
  sink: LogSink = defaultSink,
): ServerLogEntry {
  const entry: ServerLogEntry = { ts: new Date().toISOString(), level, service: 'poravnu-api', event, ...context };
  sink(JSON.stringify(entry));
  return entry;
}

/**
 * Id запроса: берётся из заголовка Vercel `x-vercel-id`, иначе генерируется.
 * По нему строку лога можно найти в панели Vercel и связать с ответом клиенту.
 * @param headers Заголовки входящего запроса.
 */
export function requestIdOf(headers: Headers): string {
  return headers.get('x-vercel-id') ?? crypto.randomUUID();
}
