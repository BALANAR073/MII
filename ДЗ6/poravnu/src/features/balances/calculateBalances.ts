import type { GroupLedger, MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { getExpenseShares } from './getExpenseShares';
import type { MemberBalance } from './types';

/**
 * Считает баланс каждого участника, включая вышедших (FR-4.1):
 * оплачено − свои доли + отправлено переводами − получено переводами.
 * Сумма всех балансов равна 0; порядок расходов и переводов на результат не влияет.
 * @param ledger Участники, расходы и переводы группы.
 * @returns Балансы в порядке `ledger.members`.
 * @throws {RangeError} Если запись ссылается на неизвестного участника.
 */
export function calculateBalances(ledger: GroupLedger): MemberBalance[] {
  const balanceByMember = new Map<MemberId, Kopecks>(ledger.members.map((member) => [member.id, 0]));
  if (balanceByMember.size !== ledger.members.length) {
    throw new RangeError('Идентификаторы участников должны быть уникальны');
  }

  for (const expense of ledger.expenses) {
    addToBalance(balanceByMember, expense.payerId, expense.amountKop);
    for (const share of getExpenseShares(expense, ledger.members)) {
      addToBalance(balanceByMember, share.memberId, -share.amountKop);
    }
  }
  for (const transfer of ledger.transfers) {
    // Отправитель гасит свой долг, поэтому его баланс растёт, а у получателя уменьшается.
    addToBalance(balanceByMember, transfer.fromId, transfer.amountKop);
    addToBalance(balanceByMember, transfer.toId, -transfer.amountKop);
  }

  return ledger.members.map((member) => ({
    memberId: member.id,
    balanceKop: balanceByMember.get(member.id) ?? 0,
  }));
}

function addToBalance(balances: Map<MemberId, Kopecks>, memberId: MemberId, deltaKop: Kopecks): void {
  const current = balances.get(memberId);
  if (current === undefined) {
    throw new RangeError(`Участник «${memberId}» не состоит в группе`);
  }
  balances.set(memberId, current + deltaKop);
}
