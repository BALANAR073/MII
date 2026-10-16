import { describe, expect, it } from 'vitest';
import type { Expense, Member } from '../../types/group';
import { calculateBalances } from './calculateBalances';
import { suggestTransfers } from './suggestTransfers';

const MEMBERS_COUNT = 50;
const EXPENSES_COUNT = 1000;
const LIMIT_MS = 50;

/** Детерминированный генератор (LCG), чтобы данные теста не менялись от запуска к запуску. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function generateLedger() {
  const random = createRandom(42);
  const members: Member[] = Array.from({ length: MEMBERS_COUNT }, (_, index) => ({
    id: `m${index}`,
    name: `Участник ${index}`,
    joinedAt: `2026-10-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    leftAt: null,
  }));
  const pick = () => members[Math.floor(random() * MEMBERS_COUNT)]?.id ?? 'm0';
  const expenses: Expense[] = Array.from({ length: EXPENSES_COUNT }, (_, index) => {
    const ids = [...new Set(Array.from({ length: 2 + Math.floor(random() * 8) }, pick))];
    return {
      id: `e${index}`,
      groupId: 'perf',
      title: `Расход ${index}`,
      amountKop: 1 + Math.floor(random() * 5_000_000),
      payerId: pick(),
      split:
        index % 3 === 0
          ? { kind: 'shares', shares: ids.map((memberId) => ({ memberId, weight: 1 + Math.floor(random() * 5) })) }
          : { kind: 'equal', memberIds: ids },
      date: '2026-10-10',
      createdBy: 'm0',
      createdAt: '2026-10-10T00:00:00.000Z',
    };
  });
  return { members, expenses, transfers: [] };
}

describe('производительность расчёта (NFR-7)', () => {
  it(`50 участников и 1000 расходов считаются быстрее ${LIMIT_MS} мс`, () => {
    const ledger = generateLedger();
    // Прогрев: первый вызов включает JIT-компиляцию и не показателен.
    suggestTransfers(calculateBalances(ledger));

    const start = performance.now();
    const balances = calculateBalances(ledger);
    const transfers = suggestTransfers(balances);
    const elapsedMs = performance.now() - start;

    expect(balances.reduce((sum, item) => sum + item.balanceKop, 0)).toBe(0);
    expect(transfers.length).toBeLessThan(MEMBERS_COUNT);
    expect(elapsedMs).toBeLessThan(LIMIT_MS);
  });
});
