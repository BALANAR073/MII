import { formatRub } from '../../lib/money';
import { toDative, toGenitive } from '../../lib/russian';
import type { Kopecks } from '../../types/money';
import type { BalanceStatus } from './types';

/** Классы цвета по статусу баланса; контраст на белом не ниже 4,5:1 (FR-4.2, NFR-2). */
export const BALANCE_COLOR: Record<BalanceStatus, string> = {
  owed: 'text-emerald-700',
  owes: 'text-rose-600',
  settled: 'text-slate-500',
};

/**
 * Определяет статус баланса, чтобы знак долга передавался текстом, а не только цветом.
 * @param balanceKop Баланс в копейках.
 * @returns `owed` — ему должны, `owes` — он должен, `settled` — в расчёте.
 */
export function getBalanceStatus(balanceKop: Kopecks): BalanceStatus {
  if (balanceKop > 0) {
    return 'owed';
  }
  if (balanceKop < 0) {
    return 'owes';
  }
  return 'settled';
}

/**
 * Текст своего баланса для шапки группы и списка групп (FR-4.2).
 * @param balanceKop Баланс текущего пользователя.
 * @returns «Вам должны 8 135,80 ₽», «Вы должны 940,75 ₽» или «Вы в расчёте».
 */
export function describeMyBalance(balanceKop: Kopecks): string {
  const status = getBalanceStatus(balanceKop);
  if (status === 'owed') {
    return `Вам должны ${formatRub(balanceKop)}`;
  }
  if (status === 'owes') {
    return `Вы должны ${formatRub(-balanceKop)}`;
  }
  return 'Вы в расчёте';
}

/**
 * Текст чужого баланса для вкладки «Балансы» (FR-4.2).
 * @param name Имя участника в именительном падеже.
 * @param balanceKop Его баланс.
 * @returns «Ане должны 8 135,80 ₽», «У Бори долг 940,75 ₽» или «Вика в расчёте».
 */
export function describeMemberBalance(name: string, balanceKop: Kopecks): string {
  const status = getBalanceStatus(balanceKop);
  if (status === 'owed') {
    return `${toDative(name)} должны ${formatRub(balanceKop)}`;
  }
  if (status === 'owes') {
    // «У Вики долг», а не «Вика должен»: пола участника в данных нет, а эта фраза от него не зависит.
    return `У ${toGenitive(name)} долг ${formatRub(-balanceKop)}`;
  }
  return `${name} в расчёте`;
}
