import type { Kopecks } from '../types/money';

/**
 * Делит сумму пропорционально целым весам методом наибольших остатков (FR-3.4).
 * Лишние копейки получают позиции с наибольшим дробным остатком, а при равных
 * остатках — позиции с меньшим индексом, то есть участники, вступившие раньше (Q1).
 * Сумма результата всегда равна `amountKop`.
 * Модуль перенесён из CoT-эксперимента ДЗ2 (cot_step3.md) без изменений логики.
 * @param amountKop Целая неотрицательная сумма в копейках.
 * @param weights Целые положительные веса; порядок задаёт приоритет при ничьей.
 * @returns Доли той же длины и в том же порядке, что `weights`.
 * @throws {RangeError} Если сумма или вес не целые, вес ≤ 0, массив пуст
 *   или `amountKop * weight` выходит за пределы безопасного целого.
 * @example splitByWeights(100000, [1, 1, 1]) // [33334, 33333, 33333]
 */
export function splitByWeights(amountKop: Kopecks, weights: readonly number[]): Kopecks[] {
  if (!Number.isSafeInteger(amountKop) || amountKop < 0) {
    throw new RangeError(`Сумма должна быть неотрицательным целым числом копеек, получено: ${amountKop}`);
  }
  if (weights.length === 0) {
    throw new RangeError('Нужен хотя бы один вес для деления');
  }
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight <= 0)) {
    throw new RangeError('Веса должны быть целыми положительными числами');
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const parts = weights.map((weight, index) => {
    const product = amountKop * weight;
    if (!Number.isSafeInteger(product)) {
      throw new RangeError('Произведение суммы и веса выходит за пределы безопасного целого');
    }
    const remainder = product % totalWeight;
    // Вычитаем остаток до деления, чтобы частное было точным целым без float-погрешности (NFR-5).
    return { index, baseKop: (product - remainder) / totalWeight, remainder };
  });

  const leftoverKop = amountKop - parts.reduce((sum, part) => sum + part.baseKop, 0);
  const bonusIndices = new Set(
    [...parts]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, leftoverKop)
      .map((part) => part.index),
  );

  return parts.map((part) => part.baseKop + (bonusIndices.has(part.index) ? 1 : 0));
}
