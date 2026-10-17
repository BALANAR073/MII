// api/_lib/clientLog.test.ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../log';
import { isSameOriginRequest, MAX_RECORDS, parseClientLogs, redact } from './clientLog';
import { serverLog } from './serverLog';

describe('parseClientLogs', () => {
  it('оставляет только белый список полей', () => {
    const [record] = parseClientLogs({
      entries: [
        {
          ts: '2026-10-16T18:00:00.000Z',
          level: 'error',
          event: 'api.request_failed',
          op: 'expenses.insert',
          status: 403,
          code: '42501',
          kind: 'forbidden',
          path: '/groups/1?invite=abc',
          password: 'secret',
          accessToken: 'x',
        },
      ],
    });
    expect(record).toEqual({
      ts: '2026-10-16T18:00:00.000Z',
      level: 'error',
      event: 'api.request_failed',
      op: 'expenses.insert',
      status: 403,
      code: '42501',
      kind: 'forbidden',
      path: '/groups/1',
    });
  });

  it('отбрасывает info, записи без события и мусор; ограничивает размер пачки', () => {
    const many = Array.from({ length: 50 }, () => ({ level: 'warn', event: 'x' }));
    expect(parseClientLogs([{ level: 'info', event: 'a' }, { level: 'error' }, 42, null])).toEqual([]);
    expect(parseClientLogs(many)).toHaveLength(MAX_RECORDS);
    expect(parseClientLogs('строка')).toEqual([]);
  });

  it('обрезает длинное сообщение и чинит неверную дату', () => {
    const [record] = parseClientLogs([{ level: 'error', event: 'app.uncaught', message: 'я'.repeat(1000), ts: 'вчера' }]);
    expect(record?.message).toHaveLength(300);
    expect(Number.isNaN(Date.parse(record?.ts ?? ''))).toBe(false);
  });
});

describe('redact', () => {
  it('прячет email, JWT и длинные токены', () => {
    expect(redact('borya@example.com не найден')).toBe('[email] не найден');
    expect(redact('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123')).toBe('token [jwt]');
    expect(redact('key sb_publishable_DPLSycxPnbtYSka2R9PHEw_GICNas3o')).toBe('key [token]');
    expect(redact('Нет доступа к группе')).toBe('Нет доступа к группе');
  });
});

describe('isSameOriginRequest', () => {
  const url = 'https://poravnu.vercel.app/api/log';

  it('свой сайт — да, чужой — нет (по Sec-Fetch-Site)', () => {
    expect(isSameOriginRequest(new Headers({ 'sec-fetch-site': 'same-origin' }), url)).toBe(true);
    expect(isSameOriginRequest(new Headers({ 'sec-fetch-site': 'cross-site' }), url)).toBe(false);
    expect(isSameOriginRequest(new Headers({ 'sec-fetch-site': 'same-site' }), url)).toBe(false);
  });

  it('без Sec-Fetch-Site сравнивает Origin; без обоих заголовков пропускает', () => {
    expect(isSameOriginRequest(new Headers({ origin: 'https://poravnu.vercel.app' }), url)).toBe(true);
    expect(isSameOriginRequest(new Headers({ origin: 'https://evil.example' }), url)).toBe(false);
    expect(isSameOriginRequest(new Headers(), url)).toBe(true);
  });
});

describe('serverLog', () => {
  it('пишет одну JSON-строку со служебными полями', () => {
    const lines: string[] = [];
    serverLog('error', 'health.checked', { status: 503 }, (line) => lines.push(line));
    const parsed: unknown = JSON.parse(lines[0] ?? '');
    expect(parsed).toMatchObject({ level: 'error', service: 'poravnu-api', event: 'health.checked', status: 503 });
  });
});

describe('POST /api/log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('пишет очищенные записи с source: client и отвечает 204', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await POST(
      new Request('https://poravnu.test/api/log', {
        method: 'POST',
        body: JSON.stringify({ entries: [{ level: 'error', event: 'app.uncaught', message: 'Ошибка у anya@example.com' }] }),
      }),
    );
    expect(response.status).toBe(204);
    const line: unknown = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ event: 'client.app.uncaught', source: 'client', message: 'Ошибка у [email]', level: 'error' });
    expect(JSON.stringify(line)).not.toContain('anya@');
  });

  it('слишком большое тело — 413, неверный JSON — 204 без падения', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const big = await POST(new Request('https://poravnu.test/api/log', { method: 'POST', body: 'x'.repeat(20_000) }));
    expect(big.status).toBe(413);
    const bad = await POST(new Request('https://poravnu.test/api/log', { method: 'POST', body: '{не json' }));
    expect(bad.status).toBe(204);
  });

  it('запрос со страницы чужого сайта — 403, в журнал попадает только предупреждение', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await POST(
      new Request('https://poravnu.test/api/log', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
        body: JSON.stringify({ entries: [{ level: 'error', event: 'spam' }] }),
      }),
    );
    expect(response.status).toBe(403);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]?.[0])).toContain('client_log.cross_site');
  });
});
