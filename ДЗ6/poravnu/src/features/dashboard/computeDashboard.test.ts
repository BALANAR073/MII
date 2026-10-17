import { describe, expect, it } from 'vitest';
import { createSeed } from '../../mocks/seed';
import type { GroupDetails } from '../../types/group';
import { computeDashboard } from './computeDashboard';

/** Демо-данные mock-API: Боря в «Поездке в Казань», «Квартире на Ленина» и «Дне рождения Вики». */
function seedGroups(): GroupDetails[] {
  const db = createSeed();
  return db.groups.map((group) => ({
    group,
    members: group.members,
    expenses: db.expenses.filter((expense) => expense.groupId === group.id),
    transfers: db.transfers.filter((transfer) => transfer.groupId === group.id),
  }));
}

describe('сводка для главной (ДЗ6)', () => {
  it('суммы «мне должны / я должен» совпадают с балансами групп, люди — из планов переводов', () => {
    const groups = seedGroups().filter((details) => details.members.some((member) => member.id === 'borya'));
    const dashboard = computeDashboard(groups, 'borya', '2026-10-17');

    expect(dashboard.groupsCount).toBe(groups.length);
    // В Казани Боря должен Ане 940,75 ₽ (AC-07.1).
    const anya = dashboard.people.find((person) => person.key === 'anya');
    expect(anya?.netKop).toBe(-94_075);
    expect(anya?.groups).toEqual([{ groupId: 'kazan', groupName: 'Поездка в Казань', emoji: '🏙', amountKop: -94_075 }]);
    expect(dashboard.iOweKop).toBeGreaterThanOrEqual(94_075);
    // Чистый итог по людям равен разнице «мне должны − я должен».
    const net = dashboard.people.reduce((sum, person) => sum + person.netKop, 0);
    expect(net).toBe(dashboard.owedToMeKop - dashboard.iOweKop);
  });

  it('лента — от новых к старым, с лимитом; «вы» вместо своего имени', () => {
    const dashboard = computeDashboard(seedGroups(), 'borya', '2026-10-17', 3);
    expect(dashboard.activity).toHaveLength(3);
    const times = dashboard.activity.map((item) => item.at);
    expect([...times].sort().reverse()).toEqual(times);
    const mine = computeDashboard(seedGroups(), 'borya', '2026-10-17', 50).activity.find(
      (item) => item.kind === 'expense' && item.expense.payerId === 'borya',
    );
    expect(mine?.kind === 'expense' && mine.payerName).toBe('вы');
  });

  it('траты за месяц — моя доля в расходах этого месяца', () => {
    const dashboard = computeDashboard(seedGroups(), 'borya', '2026-10-17');
    expect(dashboard.mySpentThisMonthKop).toBeGreaterThan(0);
    expect(computeDashboard(seedGroups(), 'borya', '2030-01-01').mySpentThisMonthKop).toBe(0);
  });

  it('без групп — нули и пустые списки', () => {
    expect(computeDashboard([], 'me', '2026-10-17')).toEqual({
      owedToMeKop: 0,
      iOweKop: 0,
      people: [],
      activity: [],
      mySpentThisMonthKop: 0,
      myPaidTotalKop: 0,
      groupsCount: 0,
    });
  });
});
