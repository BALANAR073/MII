import { describe, expect, it } from 'vitest';
import type { Member } from '../../types/group';
import { FORM_ERRORS, emptyExpenseForm, validateExpenseForm, type ExpenseFormValues } from './expenseFormModel';

const MEMBERS: Member[] = [
  { id: 'anya', name: 'Аня', joinedAt: '2026-10-09T18:00:00.000Z', leftAt: null },
  { id: 'borya', name: 'Боря', joinedAt: '2026-10-09T18:05:00.000Z', leftAt: null },
  { id: 'vika', name: 'Вика', joinedAt: '2026-10-09T18:10:00.000Z', leftAt: null },
];

function form(patch: Partial<ExpenseFormValues> = {}): ExpenseFormValues {
  return { ...emptyExpenseForm(MEMBERS, 'borya', '2026-10-16'), ...patch };
}

describe('emptyExpenseForm', () => {
  it('по умолчанию: платил я, делится на всех, поровну, сегодня (FR-3.2)', () => {
    const values = form();
    expect(values.payerId).toBe('borya');
    expect(values.mode).toBe('equal');
    expect(values.selected).toEqual({ anya: true, borya: true, vika: true });
    expect(values.date).toBe('2026-10-16');
  });
});

describe('validateExpenseForm', () => {
  it('собирает расход «Хостел 12000» на всех (AC-04.1)', () => {
    expect(validateExpenseForm(form({ title: ' Хостел ', amount: '12000' }), MEMBERS)).toEqual({
      ok: true,
      input: {
        title: 'Хостел',
        amountKop: 1_200_000,
        payerId: 'borya',
        split: { kind: 'equal', memberIds: ['anya', 'borya', 'vika'] },
        date: '2026-10-16',
      },
    });
  });

  it('собирает деление по долям в порядке группы', () => {
    const result = validateExpenseForm(
      form({
        title: 'Кофе',
        amount: '600',
        mode: 'shares',
        selected: { anya: false, borya: true, vika: true },
        weights: { anya: '1', borya: '1', vika: '2' },
      }),
      MEMBERS,
    );
    expect(result.ok && result.input.split).toEqual({
      kind: 'shares',
      shares: [
        { memberId: 'borya', weight: 1 },
        { memberId: 'vika', weight: 2 },
      ],
    });
  });

  it('показывает ошибки пустой формы (AC-04.3, AC-04.4)', () => {
    const result = validateExpenseForm(form({ selected: { anya: false, borya: false, vika: false } }), MEMBERS);
    expect(result).toEqual({
      ok: false,
      errors: { title: FORM_ERRORS.titleEmpty, amount: FORM_ERRORS.amountInvalid, members: FORM_ERRORS.noMembers },
    });
  });

  it.each(['0', '-5', '12,345'])('сумма «%s» — ошибка', (amount) => {
    const result = validateExpenseForm(form({ title: 'Такси', amount }), MEMBERS);
    expect(result.ok ? null : result.errors.amount).toBe(FORM_ERRORS.amountInvalid);
  });

  it('сумма больше 1 000 000 ₽ — отдельный текст', () => {
    const result = validateExpenseForm(form({ title: 'Машина', amount: '2000000' }), MEMBERS);
    expect(result.ok ? null : result.errors.amount).toBe(FORM_ERRORS.amountTooLarge);
  });

  it.each(['0', '-1', '1,5', '1001', ''])('доля «%s» — ошибка (AC-05.3)', (weight) => {
    const result = validateExpenseForm(
      form({ title: 'Кофе', amount: '600', mode: 'shares', weights: { anya: weight, borya: '1', vika: '1' } }),
      MEMBERS,
    );
    expect(result.ok ? null : result.errors.weights).toBe(FORM_ERRORS.weight);
  });

  it('не проверяет доли невыбранных участников', () => {
    const result = validateExpenseForm(
      form({
        title: 'Кофе',
        amount: '600',
        mode: 'shares',
        selected: { anya: false, borya: true, vika: true },
        weights: { anya: 'abc', borya: '1', vika: '1' },
      }),
      MEMBERS,
    );
    expect(result.ok).toBe(true);
  });
});
