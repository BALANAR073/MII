import type { MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';
import type { MemberBalance, SuggestedTransfer } from './types';

interface Party {
  memberId: MemberId;
  restKop: Kopecks;
}

/**
 * Строит список переводов, после которых все балансы станут нулевыми (FR-4.3).
 * Сначала закрываются пары с точно совпадающими суммами, затем жадно:
 * самый крупный должник платит самому крупному кредитору.
 * Ничьи разрешаются по порядку участников в группе, поэтому результат детерминирован.
 * Переводов не больше N − 1, где N — число ненулевых балансов (AC-07.2).
 * Модуль перенесён из CoT-эксперимента ДЗ2 (cot_step3.md).
 * @param balances Балансы участников в порядке группы.
 * @returns Рекомендуемые переводы; пустой массив, если все в расчёте.
 * @throws {RangeError} Если сумма балансов не равна 0 или баланс не целый.
 */
export function suggestTransfers(balances: readonly MemberBalance[]): SuggestedTransfer[] {
  assertSettleable(balances);

  // filter сохраняет порядок группы — на нём держится детерминизм при равных суммах.
  const debtors: Party[] = balances
    .filter((balance) => balance.balanceKop < 0)
    .map((balance) => ({ memberId: balance.memberId, restKop: -balance.balanceKop }));
  const creditors: Party[] = balances
    .filter((balance) => balance.balanceKop > 0)
    .map((balance) => ({ memberId: balance.memberId, restKop: balance.balanceKop }));
  const transfers: SuggestedTransfer[] = [];

  // Совпадающие суммы закрываются одним переводом, иначе жадный шаг может их раздробить.
  for (const debtor of debtors) {
    const creditor = creditors.find((candidate) => candidate.restKop > 0 && candidate.restKop === debtor.restKop);
    if (creditor !== undefined) {
      settle(debtor, creditor, debtor.restKop, transfers);
    }
  }

  let debtor = findLargest(debtors);
  let creditor = findLargest(creditors);
  while (debtor !== null && creditor !== null) {
    settle(debtor, creditor, Math.min(debtor.restKop, creditor.restKop), transfers);
    debtor = findLargest(debtors);
    creditor = findLargest(creditors);
  }
  return transfers;
}

function assertSettleable(balances: readonly MemberBalance[]): void {
  if (balances.some((balance) => !Number.isSafeInteger(balance.balanceKop))) {
    throw new RangeError('Балансы должны быть целыми числами копеек');
  }
  const total = balances.reduce((sum, balance) => sum + balance.balanceKop, 0);
  if (total !== 0) {
    throw new RangeError(`Сумма балансов должна быть равна 0, получено: ${total}`);
  }
}

function settle(debtor: Party, creditor: Party, amountKop: Kopecks, transfers: SuggestedTransfer[]): void {
  transfers.push({ fromId: debtor.memberId, toId: creditor.memberId, amountKop });
  debtor.restKop -= amountKop;
  creditor.restKop -= amountKop;
}

function findLargest(parties: readonly Party[]): Party | null {
  let largest: Party | null = null;
  for (const party of parties) {
    // Строгое «больше»: при равенстве остаётся участник, вступивший раньше.
    if (party.restKop > 0 && (largest === null || party.restKop > largest.restKop)) {
      largest = party;
    }
  }
  return largest;
}
