import { categoryOf, type ExpenseCategory } from '../../lib/categories';
import type { Expense, Member, MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { getExpenseShares } from '../balances/getExpenseShares';

export interface CategoryStat {
  category: ExpenseCategory;
  totalKop: Kopecks;
  count: number;
  /** Доля от всех расходов, 0–100, округлённая до целого. */
  percent: number;
}

export interface MemberStat {
  memberId: MemberId;
  /** Сколько участник заплатил за других и за себя. */
  paidKop: Kopecks;
  /** Его доля во всех расходах — сколько он «потратил» на себя. */
  spentKop: Kopecks;
}

export interface MonthStat {
  /** `YYYY-MM`. */
  month: string;
  totalKop: Kopecks;
}

export interface GroupStats {
  totalKop: Kopecks;
  count: number;
  /** Средний расход. */
  averageKop: Kopecks;
  biggest: Expense | null;
  byCategory: CategoryStat[];
  byMember: MemberStat[];
  byMonth: MonthStat[];
}

/**
 * Статистика группы (ДЗ6): траты по категориям, по участникам (заплатил / потратил) и по месяцам.
 * Чистая функция — считает в копейках, как и балансы.
 * @param expenses Расходы группы.
 * @param members Участники в порядке вступления.
 * @returns Сводка для вкладки «Статистика».
 */
export function computeGroupStats(expenses: readonly Expense[], members: readonly Member[]): GroupStats {
  const totalKop = expenses.reduce((sum, expense) => sum + expense.amountKop, 0);

  const categories = new Map<string, { category: ExpenseCategory; totalKop: number; count: number }>();
  const paid = new Map<MemberId, number>();
  const spent = new Map<MemberId, number>();
  const months = new Map<string, number>();
  let biggest: Expense | null = null;

  for (const expense of expenses) {
    const category = categoryOf(expense.category);
    const entry = categories.get(category.id) ?? { category, totalKop: 0, count: 0 };
    entry.totalKop += expense.amountKop;
    entry.count += 1;
    categories.set(category.id, entry);

    paid.set(expense.payerId, (paid.get(expense.payerId) ?? 0) + expense.amountKop);
    for (const share of getExpenseShares(expense, members)) {
      spent.set(share.memberId, (spent.get(share.memberId) ?? 0) + share.amountKop);
    }

    const month = expense.date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + expense.amountKop);

    if (biggest === null || expense.amountKop > biggest.amountKop) {
      biggest = expense;
    }
  }

  return {
    totalKop,
    count: expenses.length,
    averageKop: expenses.length === 0 ? 0 : Math.round(totalKop / expenses.length),
    biggest,
    byCategory: [...categories.values()]
      .map((entry) => ({ ...entry, percent: totalKop === 0 ? 0 : Math.round((entry.totalKop / totalKop) * 100) }))
      .sort((a, b) => b.totalKop - a.totalKop),
    byMember: members
      .filter((member) => member.leftAt === null || paid.has(member.id) || spent.has(member.id))
      .map((member) => ({ memberId: member.id, paidKop: paid.get(member.id) ?? 0, spentKop: spent.get(member.id) ?? 0 })),
    byMonth: [...months.entries()]
      .map(([month, monthTotal]) => ({ month, totalKop: monthTotal }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * Подпись месяца для графика.
 * @param month `YYYY-MM`.
 * @returns «окт 2026».
 */
export function formatMonth(month: string): string {
  const [year = '', index = '1'] = month.split('-');
  return `${MONTHS[Number(index) - 1] ?? ''} ${year}`;
}
