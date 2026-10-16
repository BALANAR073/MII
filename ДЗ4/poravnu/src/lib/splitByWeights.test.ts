import { describe, expect, it } from 'vitest';
import { splitByWeights } from './splitByWeights';

describe('splitByWeights', () => {
  it('1 000 ₽ на троих: лишняя копейка — первому (AC-04.2)', () => {
    expect(splitByWeights(100_000, [1, 1, 1])).toEqual([33_334, 33_333, 33_333]);
  });

  it('600 ₽ по долям 2:1 (AC-05.1)', () => {
    expect(splitByWeights(60_000, [2, 1])).toEqual([40_000, 20_000]);
  });

  it('отдаёт остаток по наибольшему дробному остатку, а не по индексу', () => {
    expect(splitByWeights(10, [1, 2])).toEqual([3, 7]);
  });

  it('сохраняет сумму при любом делении', () => {
    for (let amountKop = 0; amountKop <= 300; amountKop += 1) {
      const parts = splitByWeights(amountKop, [3, 1, 2, 7]);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(amountKop);
    }
  });

  it.each([
    { label: 'пустой список весов', amountKop: 100, weights: [] },
    { label: 'нулевой вес', amountKop: 100, weights: [1, 0] },
    { label: 'дробный вес', amountKop: 100, weights: [1.5] },
    { label: 'отрицательная сумма', amountKop: -1, weights: [1] },
    { label: 'переполнение', amountKop: Number.MAX_SAFE_INTEGER, weights: [2] },
  ])('бросает RangeError: $label', ({ amountKop, weights }) => {
    expect(() => splitByWeights(amountKop, weights)).toThrow(RangeError);
  });
});
