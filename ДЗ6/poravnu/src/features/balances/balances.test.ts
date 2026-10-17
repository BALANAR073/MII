import { describe, expect, it } from 'vitest';
import { createSeed } from '../../mocks/seed';
import type { GroupLedger } from '../../types/group';
import { describeMemberBalance, describeMyBalance, getBalanceStatus } from './balanceText';
import { calculateBalances } from './calculateBalances';
import { getExpenseShares } from './getExpenseShares';
import { suggestTransfers } from './suggestTransfers';

const NBSP = '\u00a0';

function kazanLedger(): GroupLedger {
  const seed = createSeed();
  const group = seed.groups.find((item) => item.id === 'kazan');
  if (group === undefined) {
    throw new Error('В демо-данных нет группы kazan');
  }
  return {
    members: group.members,
    expenses: seed.expenses.filter((expense) => expense.groupId === 'kazan'),
    transfers: seed.transfers.filter((transfer) => transfer.groupId === 'kazan'),
  };
}

describe('getExpenseShares', () => {
  it('раздаёт лишнюю копейку по порядку вступления, а не по порядку в форме (AC-T3.3)', () => {
    const { members } = kazanLedger();
    const shares = getExpenseShares(
      { id: 'x', amountKop: 100_000, split: { kind: 'equal', memberIds: ['vika', 'borya', 'anya'] } },
      members,
    );
    expect(shares).toEqual([
      { memberId: 'anya', amountKop: 33_334 },
      { memberId: 'borya', amountKop: 33_333 },
      { memberId: 'vika', amountKop: 33_333 },
    ]);
  });

  it('бросает RangeError для участника не из группы', () => {
    const { members } = kazanLedger();
    expect(() => getExpenseShares({ id: 'x', amountKop: 100, split: { kind: 'equal', memberIds: ['ghost'] } }, members)).toThrow(
      RangeError,
    );
  });
});

describe('calculateBalances', () => {
  it('считает балансы группы «Поездка в Казань» (данные UI-концепций)', () => {
    expect(calculateBalances(kazanLedger())).toEqual([
      { memberId: 'anya', balanceKop: 813_580 },
      { memberId: 'borya', balanceKop: -94_075 },
      { memberId: 'vika', balanceKop: -319_753 },
      { memberId: 'gosha', balanceKop: -399_752 },
    ]);
  });

  it('даёт нулевую сумму балансов (AC-06.2)', () => {
    const total = calculateBalances(kazanLedger()).reduce((sum, item) => sum + item.balanceKop, 0);
    expect(total).toBe(0);
  });

  it('учитывает переводы: после перевода Бори его баланс 0 (AC-08.1)', () => {
    const ledger = kazanLedger();
    const withTransfer: GroupLedger = {
      ...ledger,
      transfers: [
        {
          id: 't',
          groupId: 'kazan',
          fromId: 'borya',
          toId: 'anya',
          amountKop: 94_075,
          createdBy: 'borya',
          createdAt: '2026-10-13T00:00:00.000Z',
        },
      ],
    };
    const balances = calculateBalances(withTransfer);
    expect(balances.find((item) => item.memberId === 'borya')?.balanceKop).toBe(0);
    expect(balances.find((item) => item.memberId === 'anya')?.balanceKop).toBe(813_580 - 94_075);
  });
});

describe('suggestTransfers', () => {
  it('предлагает 3 перевода Ане (AC-07.1)', () => {
    expect(suggestTransfers(calculateBalances(kazanLedger()))).toEqual([
      { fromId: 'gosha', toId: 'anya', amountKop: 399_752 },
      { fromId: 'vika', toId: 'anya', amountKop: 319_753 },
      { fromId: 'borya', toId: 'anya', amountKop: 94_075 },
    ]);
  });

  it('разрешает ничьи по порядку вступления (AC-T4.2)', () => {
    expect(
      suggestTransfers([
        { memberId: 'a', balanceKop: -10_000 },
        { memberId: 'b', balanceKop: -10_000 },
        { memberId: 'c', balanceKop: 10_000 },
        { memberId: 'd', balanceKop: 10_000 },
      ]),
    ).toEqual([
      { fromId: 'a', toId: 'c', amountKop: 10_000 },
      { fromId: 'b', toId: 'd', amountKop: 10_000 },
    ]);
  });

  it('даёт не больше N−1 переводов и обнуляет все балансы (AC-07.2)', () => {
    const balances = [
      { memberId: 'a', balanceKop: 700 },
      { memberId: 'b', balanceKop: -300 },
      { memberId: 'c', balanceKop: -250 },
      { memberId: 'd', balanceKop: 100 },
      { memberId: 'e', balanceKop: -250 },
    ];
    const transfers = suggestTransfers(balances);
    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
    const rest = new Map(balances.map((item) => [item.memberId, item.balanceKop]));
    for (const transfer of transfers) {
      rest.set(transfer.fromId, (rest.get(transfer.fromId) ?? 0) + transfer.amountKop);
      rest.set(transfer.toId, (rest.get(transfer.toId) ?? 0) - transfer.amountKop);
    }
    expect([...rest.values()].every((value) => value === 0)).toBe(true);
  });

  it('пустой список, если все в расчёте (AC-07.3)', () => {
    expect(suggestTransfers([{ memberId: 'a', balanceKop: 0 }])).toEqual([]);
  });

  it('бросает RangeError, если сумма балансов не 0', () => {
    expect(() => suggestTransfers([{ memberId: 'a', balanceKop: 1 }])).toThrow(RangeError);
  });
});

describe('тексты балансов (FR-4.2)', () => {
  it('свой баланс', () => {
    expect(describeMyBalance(813_580)).toBe(`Вам должны 8${NBSP}135,80${NBSP}₽`);
    expect(describeMyBalance(-94_075)).toBe(`Вы должны 940,75${NBSP}₽`);
    expect(describeMyBalance(0)).toBe('Вы в расчёте');
  });

  it('чужой баланс (AC-T4.1)', () => {
    expect(describeMemberBalance('Аня', 813_580)).toBe(`Ане должны 8${NBSP}135,80${NBSP}₽`);
    expect(describeMemberBalance('Вика', -319_753)).toBe(`У Вики долг 3${NBSP}197,53${NBSP}₽`);
    expect(describeMemberBalance('Гоша', 0)).toBe('Гоша в расчёте');
  });

  it('статус', () => {
    expect(getBalanceStatus(1)).toBe('owed');
    expect(getBalanceStatus(-1)).toBe('owes');
    expect(getBalanceStatus(0)).toBe('settled');
  });
});
