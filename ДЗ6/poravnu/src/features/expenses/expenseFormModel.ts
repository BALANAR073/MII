import { kopToInput, parseRubToKop } from '../../lib/money';
import type { ExpenseInput } from '../../types/api';
import type { Expense, Member, MemberId } from '../../types/group';
import { toWeightedShares } from '../balances/getExpenseShares';

export type SplitMode = 'equal' | 'shares';

export interface ExpenseFormValues {
  title: string;
  amount: string;
  payerId: MemberId;
  mode: SplitMode;
  /** Кто участвует в делении. */
  selected: Record<MemberId, boolean>;
  /** Доли в режиме «по долям» — строки, как их ввёл пользователь. */
  weights: Record<MemberId, string>;
  date: string;
}

export type ExpenseFormField = 'title' | 'amount' | 'members' | 'weights' | 'date';
export type ExpenseFormErrors = Partial<Record<ExpenseFormField, string>>;

export type ExpenseFormResult = { ok: true; input: ExpenseInput } | { ok: false; errors: ExpenseFormErrors };

/** Тексты ошибок из раздела 6 ТЗ (ERR-1). */
export const FORM_ERRORS = {
  titleEmpty: 'Введите название',
  titleLong: 'Название — не длиннее 60 символов',
  amountInvalid: 'Введите сумму больше 0, до копеек',
  amountTooLarge: 'Сумма не больше 1 000 000 ₽',
  noMembers: 'Выберите хотя бы одного участника',
  weight: 'Доля — целое число от 1 до 1000',
  date: 'Укажите дату расхода',
} as const;

const MAX_TITLE_LENGTH = 60;
const WEIGHT_PATTERN = /^\d{1,4}$/;
const MAX_WEIGHT = 1000;

/**
 * Начальные значения формы: платил — я, делится — на всех активных, поровну, сегодня (FR-3.2).
 * @param activeMembers Активные участники группы.
 * @param currentUserId Текущий пользователь.
 * @param today Дата по умолчанию.
 * @returns Значения новой формы.
 */
export function emptyExpenseForm(activeMembers: readonly Member[], currentUserId: MemberId, today: string): ExpenseFormValues {
  return {
    title: '',
    amount: '',
    payerId: currentUserId,
    mode: 'equal',
    selected: Object.fromEntries(activeMembers.map((member) => [member.id, true])),
    weights: Object.fromEntries(activeMembers.map((member) => [member.id, '1'])),
    date: today,
  };
}

/**
 * Значения формы для редактирования существующего расхода.
 * @param expense Расход.
 * @param activeMembers Активные участники группы.
 * @returns Значения формы.
 */
export function expenseToForm(expense: Expense, activeMembers: readonly Member[]): ExpenseFormValues {
  const shares = toWeightedShares(expense.split);
  const weightById = new Map(shares.map((share) => [share.memberId, share.weight]));
  return {
    title: expense.title,
    amount: kopToInput(expense.amountKop),
    payerId: expense.payerId,
    mode: expense.split.kind,
    selected: Object.fromEntries(activeMembers.map((member) => [member.id, weightById.has(member.id)])),
    weights: Object.fromEntries(activeMembers.map((member) => [member.id, String(weightById.get(member.id) ?? 1)])),
    date: expense.date,
  };
}

/**
 * Проверяет форму расхода и собирает данные для API (FR-3.2, FR-3.3, ERR-1).
 * Порядок участников берётся из группы, а не из порядка галочек.
 * @param values Значения формы.
 * @param activeMembers Активные участники в порядке вступления.
 * @returns Данные для сохранения или ошибки по полям.
 */
export function validateExpenseForm(values: ExpenseFormValues, activeMembers: readonly Member[]): ExpenseFormResult {
  const errors: ExpenseFormErrors = {};
  const title = values.title.trim();
  if (title.length === 0) {
    errors.title = FORM_ERRORS.titleEmpty;
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = FORM_ERRORS.titleLong;
  }

  const amount = parseRubToKop(values.amount);
  if (!amount.ok) {
    errors.amount = amount.error === 'too-large' ? FORM_ERRORS.amountTooLarge : FORM_ERRORS.amountInvalid;
  }

  const memberIds = activeMembers.filter((member) => values.selected[member.id] === true).map((member) => member.id);
  if (memberIds.length === 0) {
    errors.members = FORM_ERRORS.noMembers;
  }

  const shares = memberIds.map((memberId) => ({ memberId, weight: parseWeight(values.weights[memberId] ?? '') }));
  if (values.mode === 'shares' && shares.some((share) => share.weight === null)) {
    errors.weights = FORM_ERRORS.weight;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    errors.date = FORM_ERRORS.date;
  }

  if (Object.keys(errors).length > 0 || !amount.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      title,
      amountKop: amount.amountKop,
      payerId: values.payerId,
      split:
        values.mode === 'equal'
          ? { kind: 'equal', memberIds }
          : { kind: 'shares', shares: shares.map((share) => ({ memberId: share.memberId, weight: share.weight ?? 1 })) },
      date: values.date,
    },
  };
}

function parseWeight(value: string): number | null {
  const trimmed = value.trim();
  if (!WEIGHT_PATTERN.test(trimmed)) {
    return null;
  }
  const weight = Number.parseInt(trimmed, 10);
  return weight >= 1 && weight <= MAX_WEIGHT ? weight : null;
}
