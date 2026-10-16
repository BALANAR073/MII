import { describe, expect, it } from 'vitest';
import { formatRub, formatSignedRub, kopToInput, parseRubToKop } from './money';

const NBSP = '\u00a0';
const MINUS = '\u2212';

describe('formatRub', () => {
  it('форматирует рубли и копейки с неразрывными пробелами (NFR-3)', () => {
    expect(formatRub(150_000)).toBe(`1${NBSP}500,00${NBSP}₽`);
    expect(formatRub(1_705_677)).toBe(`17${NBSP}056,77${NBSP}₽`);
  });

  it('ставит типографский минус у отрицательной суммы', () => {
    expect(formatRub(-94_075)).toBe(`${MINUS}940,75${NBSP}₽`);
  });

  it('форматирует ноль и суммы меньше рубля', () => {
    expect(formatRub(0)).toBe(`0,00${NBSP}₽`);
    expect(formatRub(5)).toBe(`0,05${NBSP}₽`);
  });

  it('бросает RangeError для дробной суммы', () => {
    expect(() => formatRub(1.5)).toThrow(RangeError);
  });
});

describe('formatSignedRub', () => {
  it('добавляет «+» только положительной сумме', () => {
    expect(formatSignedRub(813_580)).toBe(`+8${NBSP}135,80${NBSP}₽`);
    expect(formatSignedRub(-100)).toBe(`${MINUS}1,00${NBSP}₽`);
    expect(formatSignedRub(0)).toBe(`0,00${NBSP}₽`);
  });
});

describe('parseRubToKop (FR-3.3)', () => {
  it.each([
    ['12000', 1_200_000],
    ['12 000', 1_200_000],
    ['12000,5', 1_200_050],
    ['12000.50', 1_200_050],
    ['12 000,5', 1_200_050],
    ['0,01', 1],
    ['007', 700],
    ['  999,99 ', 99_999],
    [`3${NBSP}456,78`, 345_678],
    ['1000000', 100_000_000],
  ])('«%s» → %i коп.', (input, expected) => {
    expect(parseRubToKop(input)).toEqual({ ok: true, amountKop: expected });
  });

  it.each(['', '0', '0,00', '-5', '+5', '12,345', '12,', ',5', '1e3', '12.000,00', 'abc', '12  000'])(
    '«%s» — ошибка формата',
    (input) => {
      expect(parseRubToKop(input)).toEqual({ ok: false, error: 'invalid' });
    },
  );

  it('сумма больше 1 000 000 ₽ — отдельная ошибка', () => {
    expect(parseRubToKop('1000000,01')).toEqual({ ok: false, error: 'too-large' });
    expect(parseRubToKop('99999999999999999999')).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('kopToInput', () => {
  it('готовит сумму для поля ввода', () => {
    expect(kopToInput(1_200_000)).toBe('12000');
    expect(kopToInput(345_678)).toBe('3456,78');
    expect(kopToInput(5)).toBe('0,05');
  });
});
