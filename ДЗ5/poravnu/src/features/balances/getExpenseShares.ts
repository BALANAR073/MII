import { splitByWeights } from '../../lib/splitByWeights';
import type { Expense, ExpenseSplit, Member, MemberId, WeightedShare } from '../../types/group';
import type { MemberShare } from './types';

/**
 * Считает долю каждого участника деления в расходе.
 * Участники упорядочиваются по позиции в группе (порядок вступления, Q1),
 * поэтому лишняя копейка не зависит от порядка выбора в форме.
 * @param expense Расход.
 * @param members Участники группы в порядке вступления.
 * @returns Доли в порядке группы; их сумма равна `expense.amountKop`.
 * @throws {RangeError} Если участник повторяется или не состоит в группе.
 */
export function getExpenseShares(expense: Pick<Expense, 'id' | 'amountKop' | 'split'>, members: readonly Member[]): MemberShare[] {
  const shares = toWeightedShares(expense.split);
  const weightByMember = new Map<MemberId, number>(shares.map((share) => [share.memberId, share.weight]));
  if (weightByMember.size !== shares.length) {
    throw new RangeError(`В расходе «${expense.id}» участник указан несколько раз`);
  }
  const groupMemberIds = new Set(members.map((member) => member.id));
  const unknownShare = shares.find((share) => !groupMemberIds.has(share.memberId));
  if (unknownShare !== undefined) {
    throw new RangeError(`Участник «${unknownShare.memberId}» не состоит в группе`);
  }

  const ordered = members.flatMap((member) => {
    const weight = weightByMember.get(member.id);
    return weight === undefined ? [] : [{ memberId: member.id, weight }];
  });
  const amounts = splitByWeights(
    expense.amountKop,
    ordered.map((share) => share.weight),
  );
  return ordered.map((share, index) => ({ memberId: share.memberId, amountKop: amounts[index] ?? 0 }));
}

/**
 * Приводит любой способ деления к списку весов: при делении поровну у каждого вес 1.
 * @param split Способ деления расхода.
 * @returns Доли в том порядке, в котором они указаны в расходе.
 */
export function toWeightedShares(split: ExpenseSplit): WeightedShare[] {
  if (split.kind === 'equal') {
    return split.memberIds.map((memberId) => ({ memberId, weight: 1 }));
  }
  return [...split.shares];
}

/**
 * Возвращает id всех участников деления расхода.
 * @param split Способ деления.
 * @returns Список id без весов.
 */
export function getSplitMemberIds(split: ExpenseSplit): MemberId[] {
  return toWeightedShares(split).map((share) => share.memberId);
}
