import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLUSH_DELAY_MS,
  MAX_REMOTE_PER_SESSION,
  enableRemoteLogging,
  flushRemoteLogs,
  getLogEntries,
  getSessionId,
  installGlobalErrorHandlers,
  log,
  resetRemoteLogging,
  setLogSilent,
} from './logger';

function parseBatch(body: string | undefined): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(body ?? '{}');
  if (typeof parsed === 'object' && parsed !== null && 'entries' in parsed && Array.isArray(parsed.entries)) {
    return parsed.entries.filter((item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }
  return [];
}

describe('logger: отправка ошибок на сервер (ДЗ6)', () => {
  beforeEach(() => {
    setLogSilent(true);
    vi.useFakeTimers();
  });
  afterEach(() => {
    resetRemoteLogging();
    vi.useRealTimers();
  });

  it('warn и error уходят одной пачкой через 2 с; info — нет', () => {
    const transport = vi.fn((_url: string, _body: string) => true);
    enableRemoteLogging('/api/log', 'abc1234', transport);
    log('info', 'auth.state_changed');
    log('error', 'api.request_failed', { op: 'expenses.insert', status: 403, code: '42501', kind: 'forbidden', email: 'x@y.z' });
    log('warn', 'api.slow', { op: 'my_groups' });
    expect(transport).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, body] = transport.mock.calls[0] ?? [];
    expect(url).toBe('/api/log');
    const batch = parseBatch(body);
    expect(batch.map((entry) => entry.event)).toEqual(['api.request_failed', 'api.slow']);
    expect(batch[0]).toMatchObject({ op: 'expenses.insert', status: 403, release: 'abc1234', session: getSessionId() });
    // Лишние поля контекста (например, email) на сервер не уходят.
    expect(batch[0]).not.toHaveProperty('email');
  });

  it('без включения ничего не отправляет, но журнал в памяти ведётся', () => {
    log('error', 'api.request_failed');
    flushRemoteLogs();
    expect(getLogEntries().at(-1)?.event).toBe('api.request_failed');
  });

  it('не больше 100 отправок за сессию — защита от цикла ошибок', () => {
    const transport = vi.fn((_url: string, _body: string) => true);
    enableRemoteLogging('/api/log', 'r', transport);
    for (let i = 0; i < MAX_REMOTE_PER_SESSION + 30; i += 1) {
      log('error', 'loop');
    }
    flushRemoteLogs();
    expect(parseBatch(transport.mock.calls[0]?.[1])).toHaveLength(MAX_REMOTE_PER_SESSION);
  });

  it('необработанная ошибка и отклонённый промис попадают в журнал', () => {
    const uninstall = installGlobalErrorHandlers(window);
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'https://poravnu.app/assets/index.js', lineno: 7 }));
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('нет сети') });
    window.dispatchEvent(rejection);
    uninstall();
    const events = getLogEntries().slice(-2);
    expect(events[0]).toMatchObject({ event: 'app.uncaught', message: 'boom', source: '/assets/index.js', line: 7 });
    expect(events[1]).toMatchObject({ event: 'app.unhandled_rejection', message: 'нет сети' });
  });
});
