import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('оставляет внутренний путь', () => {
    expect(safeNext('/groups/1?tab=balances')).toBe('/groups/1?tab=balances');
    expect(safeNext('/join/abc-123')).toBe('/join/abc-123');
  });

  it('внешние адреса и пустое значение заменяет на /', () => {
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  // Аудит ДЗ6: браузер удаляет \t \n \r из адреса, и `/\t/evil` превращается в `//evil`.
  it('отбрасывает управляющие символы и обратный слэш в любом месте', () => {
    expect(safeNext('/\t/evil.example')).toBe('/');
    expect(safeNext('/\n/evil.example')).toBe('/');
    expect(safeNext('/groups/1\\..\\..\\/evil.example')).toBe('/');
    expect(safeNext('/groups\u0000/1')).toBe('/');
  });

  it('слишком длинный путь заменяет на /', () => {
    expect(safeNext(`/${'a'.repeat(600)}`)).toBe('/');
  });
});
