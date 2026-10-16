import { formatRub } from '../../lib/money';
import { splitCountText, toGenitive } from '../../lib/russian';
import type { Expense, Member, MemberId } from '../../types/group';
import { getExpenseShares } from '../balances/getExpenseShares';

/**
 * Подпись под названием расхода в ленте (FR-3.1): кто платил и как делится.
 * «От Ани» вместо «Платила Аня» — форма не зависит от пола участника.
 * @param expense Расход.
 * @param members Участники группы.
 * @param currentUserId Текущий пользователь.
 * @returns Например «От Ани · на четверых» или «Вы заплатили · по долям Боря 1 : Гоша 2».
 */
export function describeExpense(expense: Expense, members: readonly Member[], currentUserId: MemberId): string {
  const payer = expense.payerId === currentUserId ? 'Вы заплатили' : `От ${toGenitive(memberName(members, expense.payerId))}`;
  if (expense.split.kind === 'equal') {
    const splitIds = expense.split.memberIds;
    const activeIds = members.filter((member) => member.leftAt === null).map((member) => member.id);
    const isEveryone = splitIds.length === activeIds.length && activeIds.every((id) => splitIds.includes(id));
    return `${payer} · ${isEveryone ? 'на всех' : splitCountText(expense.split.memberIds.length)}`;
  }
  // Доли показываем в порядке группы, как и считаем их.
  const weightById = new Map(expense.split.shares.map((share) => [share.memberId, share.weight]));
  const parts = members.flatMap((member) => {
    const weight = weightById.get(member.id);
    return weight === undefined ? [] : [`${member.name} ${weight}`];
  });
  return `${payer} · по долям ${parts.join(' : ')}`;
}

/**
 * «Ваша доля X» или «Вас не касается» для строки ленты (FR-3.1, AC-T3.1).
 * @param expense Расход.
 * @param members Участники группы.
 * @param currentUserId Текущий пользователь.
 * @returns Текст доли.
 */
export function describeMyShare(expense: Expense, members: readonly Member[], currentUserId: MemberId): string {
  const share = getExpenseShares(expense, members).find((item) => item.memberId === currentUserId);
  return share === undefined ? 'Вас не касается' : `Ваша доля ${formatRub(share.amountKop)}`;
}

/**
 * Имя участника по id; для неизвестного id — нейтральная подпись.
 * @param members Участники группы.
 * @param memberId Идентификатор.
 * @returns Имя.
 */
export function memberName(members: readonly Member[], memberId: MemberId): string {
  return members.find((member) => member.id === memberId)?.name ?? 'Участник';
}
