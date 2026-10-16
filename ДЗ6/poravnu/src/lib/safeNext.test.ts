import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('оставляет внутренний путь', () => {
    expect(safeNext('/groups/1?tab=balances')).toBe('/groups/1?tab=balances');
  });

  it('внешние адреса и пустое значение заменяет на /', () => {
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
