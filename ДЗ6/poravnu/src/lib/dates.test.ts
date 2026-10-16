import { describe, expect, it } from 'vitest';
import { formatShortDate, todayIso } from './dates';

describe('formatShortDate', () => {
  it('форматирует дату расхода и метку времени', () => {
    expect(formatShortDate('2026-10-12')).toBe('12 окт');
    expect(formatShortDate('2026-05-01T23:59:00.000Z')).toBe('1 мая');
  });

  it('возвращает строку как есть, если формат неизвестен', () => {
    expect(formatShortDate('вчера')).toBe('вчера');
    expect(formatShortDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('todayIso', () => {
  it('дополняет месяц и день нулями', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
