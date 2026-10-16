import { describe, expect, it } from 'vitest';
import { createSeed } from '../../mocks/seed';
import type { Expense } from '../../types/group';
import { describeExpense, describeMyShare } from './describeExpense';

const seed = createSeed();
const members = seed.groups.find((group) => group.id === 'kazan')?.members ?? [];
const expense = (id: string): Expense => {
  const found = seed.expenses.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`Нет расхода ${id}`);
  }
  return found;
};

describe('describeExpense (FR-3.1)', () => {
  it('чужой расход на всех: плательщик в родительном падеже', () => {
    expect(describeExpense(expense('e-hostel'), members, 'borya')).toBe('От Ани · на всех');
  });

  it('свой расход и деление на часть группы', () => {
    expect(describeExpense(expense('e-food'), members, 'borya')).toBe('Вы заплатили · на всех');
    expect(describeExpense(expense('e-taxi'), members, 'borya')).toBe('От Вики · на троих');
  });

  it('доли — в порядке вступления в группу', () => {
    expect(describeExpense(expense('e-coffee'), members, 'borya')).toBe('От Гоши · по долям Боря 1 : Гоша 2');
  });
});

describe('describeMyShare (AC-T3.1)', () => {
  it('своя доля или «Вас не касается»', () => {
    expect(describeMyShare(expense('e-coffee'), members, 'borya')).toBe('Ваша доля 200,00 ₽');
    expect(describeMyShare(expense('e-coffee'), members, 'anya')).toBe('Вас не касается');
  });
});
