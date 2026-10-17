import { describe, expect, it } from 'vitest';
import type { Expense, Member } from '../../types/group';
import { computeGroupStats, formatMonth } from './groupStats';

const MEMBERS: Member[] = [
  { id: 'a', name: 'Аня', joinedAt: '2026-10-01', leftAt: null },
  { id: 'b', name: 'Боря', joinedAt: '2026-10-02', leftAt: null },
  { id: 'c', name: 'Вика', joinedAt: '2026-10-03', leftAt: null, isVirtual: true },
];

function expense(id: string, amountKop: number, payerId: string, date: string, category: string | null): Expense {
  return {
    id,
    groupId: 'g',
    title: id,
    amountKop,
    payerId,
    split: { kind: 'equal', memberIds: ['a', 'b', 'c'] },
    date,
    category,
    createdBy: 'a',
    createdAt: `${date}T10:00:00Z`,
  };
}

describe('статистика группы (ДЗ6)', () => {
  it('считает итог, категории, вклад участников и месяцы', () => {
    const stats = computeGroupStats(
      [
        expense('Хостел', 90_000, 'a', '2026-09-30', 'housing'),
        expense('Такси', 30_000, 'b', '2026-10-01', 'transport'),
        expense('Ещё такси', 30_000, 'c', '2026-10-02', 'transport'),
        expense('Сувенир', 1_000, 'a', '2026-10-03', null),
      ],
      MEMBERS,
    );
    expect(stats.totalKop).toBe(151_000);
    expect(stats.count).toBe(4);
    expect(stats.averageKop).toBe(37_750);
    expect(stats.biggest?.id).toBe('Хостел');
    expect(stats.byCategory.map((item) => [item.category.id, item.totalKop, item.count, item.percent])).toEqual([
      ['housing', 90_000, 1, 60],
      ['transport', 60_000, 2, 40],
      ['other', 1_000, 1, 1],
    ]);
    // Каждый потратил треть от каждого расхода; копейки раздаются по порядку вступления.
    expect(stats.byMember).toEqual([
      { memberId: 'a', paidKop: 91_000, spentKop: 50_334 },
      { memberId: 'b', paidKop: 30_000, spentKop: 50_333 },
      { memberId: 'c', paidKop: 30_000, spentKop: 50_333 },
    ]);
    expect(stats.byMonth).toEqual([
      { month: '2026-09', totalKop: 90_000 },
      { month: '2026-10', totalKop: 61_000 },
    ]);
  });

  it('пустая группа — нули без деления на ноль', () => {
    const stats = computeGroupStats([], MEMBERS);
    expect(stats).toMatchObject({ totalKop: 0, count: 0, averageKop: 0, biggest: null, byCategory: [], byMonth: [] });
    expect(stats.byMember.every((item) => item.paidKop === 0 && item.spentKop === 0)).toBe(true);
  });

  it('подпись месяца', () => {
    expect(formatMonth('2026-10')).toBe('окт 2026');
  });
});
