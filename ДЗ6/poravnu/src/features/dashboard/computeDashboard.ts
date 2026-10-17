import type { Expense, GroupDetails, MemberId, Transfer } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { calculateBalances } from '../balances/calculateBalances';
import { getExpenseShares } from '../balances/getExpenseShares';
import { suggestTransfers } from '../balances/suggestTransfers';

/** Человек, с которым у меня есть расчёты в одной или нескольких группах. */
export interface PersonDebt {
  /** Ключ строки: id аккаунта; у участника без аккаунта — id группы и участника (он есть только в одной группе). */
  key: string;
  name: string;
  /** > 0 — человек должен мне, < 0 — я должен ему. Сумма по всем группам. */
  netKop: Kopecks;
  groups: { groupId: string; groupName: string; emoji: string; amountKop: Kopecks }[];
}

export type ActivityItem =
  | {
      kind: 'expense';
      at: string;
      groupId: string;
      groupName: string;
      emoji: string;
      expense: Expense;
      actorName: string;
      payerName: string;
    }
  | {
      kind: 'transfer';
      at: string;
      groupId: string;
      groupName: string;
      emoji: string;
      transfer: Transfer;
      fromName: string;
      toName: string;
    };

export interface Dashboard {
  /** Сколько должны мне — сумма положительных балансов по группам. */
  owedToMeKop: Kopecks;
  /** Сколько должен я — сумма модулей отрицательных балансов. */
  iOweKop: Kopecks;
  people: PersonDebt[];
  activity: ActivityItem[];
  /** Моя доля в расходах с датой в текущем месяце. */
  mySpentThisMonthKop: Kopecks;
  /** Сколько я заплатил за всё время во всех группах. */
  myPaidTotalKop: Kopecks;
  groupsCount: number;
}

/**
 * Сводка по всем группам для главной (ДЗ6). Долги считаются так же, как на экране группы:
 * балансы → минимальный план переводов; из плана берутся только переводы с моим участием.
 * @param groups Данные групп пользователя.
 * @param me Id текущего пользователя.
 * @param today Сегодня в формате `YYYY-MM-DD` — для «трат за месяц».
 * @param activityLimit Сколько последних операций вернуть.
 */
export function computeDashboard(groups: readonly GroupDetails[], me: MemberId, today: string, activityLimit = 8): Dashboard {
  let owedToMeKop = 0;
  let iOweKop = 0;
  let mySpentThisMonthKop = 0;
  let myPaidTotalKop = 0;
  const people = new Map<string, PersonDebt>();
  const activity: ActivityItem[] = [];
  const month = today.slice(0, 7);

  for (const details of groups) {
    const { group, members, expenses, transfers } = details;
    const nameOf = (id: MemberId) => members.find((member) => member.id === id)?.name ?? 'Участник';
    const balances = calculateBalances(details);
    const myBalance = balances.find((balance) => balance.memberId === me)?.balanceKop ?? 0;
    if (myBalance > 0) owedToMeKop += myBalance;
    if (myBalance < 0) iOweKop += -myBalance;

    for (const transfer of suggestTransfers(balances)) {
      if (transfer.fromId !== me && transfer.toId !== me) continue;
      const otherId = transfer.fromId === me ? transfer.toId : transfer.fromId;
      const other = members.find((member) => member.id === otherId);
      const key = other?.isVirtual === true ? `${group.id}:${otherId}` : otherId;
      const signed = transfer.toId === me ? transfer.amountKop : -transfer.amountKop;
      const person = people.get(key) ?? { key, name: nameOf(otherId), netKop: 0, groups: [] };
      person.netKop += signed;
      person.groups.push({ groupId: group.id, groupName: group.name, emoji: group.emoji, amountKop: signed });
      people.set(key, person);
    }

    for (const expense of expenses) {
      if (expense.payerId === me) myPaidTotalKop += expense.amountKop;
      if (expense.date.startsWith(month)) {
        mySpentThisMonthKop += getExpenseShares(expense, members).find((share) => share.memberId === me)?.amountKop ?? 0;
      }
      activity.push({
        kind: 'expense',
        at: expense.createdAt,
        groupId: group.id,
        groupName: group.name,
        emoji: group.emoji,
        expense,
        actorName: expense.createdBy === me ? 'Вы' : nameOf(expense.createdBy),
        payerName: expense.payerId === me ? 'вы' : nameOf(expense.payerId),
      });
    }
    for (const transfer of transfers) {
      activity.push({
        kind: 'transfer',
        at: transfer.createdAt,
        groupId: group.id,
        groupName: group.name,
        emoji: group.emoji,
        transfer,
        fromName: transfer.fromId === me ? 'Вы' : nameOf(transfer.fromId),
        toName: transfer.toId === me ? 'вам' : nameOf(transfer.toId),
      });
    }
  }

  return {
    owedToMeKop,
    iOweKop,
    // Сначала самые крупные суммы — неважно, в какую сторону.
    people: [...people.values()].filter((person) => person.netKop !== 0).sort((a, b) => Math.abs(b.netKop) - Math.abs(a.netKop)),
    activity: activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, activityLimit),
    mySpentThisMonthKop,
    myPaidTotalKop,
    groupsCount: groups.length,
  };
}
