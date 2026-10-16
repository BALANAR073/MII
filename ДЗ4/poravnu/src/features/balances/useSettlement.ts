import { useMemo } from 'react';
import type { GroupLedger } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { calculateBalances } from './calculateBalances';
import { suggestTransfers } from './suggestTransfers';
import type { MemberBalance, SuggestedTransfer } from './types';

export interface Settlement {
  balances: MemberBalance[];
  transfers: SuggestedTransfer[];
  totalSpentKop: Kopecks;
}

export type SettlementResult = { ok: true; settlement: Settlement } | { ok: false };

/**
 * Балансы, переводы и итог расходов группы. Пересчитывается только при смене данных (NFR-7).
 * Расчёт бросает RangeError на повреждённых данных; здесь ошибка превращается в результат,
 * чтобы экран показал сообщение, а не упал целиком. Error Boundary не используем:
 * он возможен только как class-компонент, а их запрещает правило 15 (находка 7 AI-ревью).
 * @param ledger Участники, видимые расходы и переводы.
 * @returns Результат расчёта или признак ошибки.
 */
export function useSettlement(ledger: GroupLedger): SettlementResult {
  return useMemo(() => {
    try {
      const balances = calculateBalances(ledger);
      return {
        ok: true,
        settlement: {
          balances,
          transfers: suggestTransfers(balances),
          totalSpentKop: ledger.expenses.reduce((sum, expense) => sum + expense.amountKop, 0),
        },
      };
    } catch {
      return { ok: false };
    }
  }, [ledger]);
}
