import { useMemo } from 'react';
import type { GroupLedger } from '../../types/group';
import { calculateBalances } from './calculateBalances';
import { suggestTransfers } from './suggestTransfers';
import type { MemberBalance, SuggestedTransfer } from './types';

export interface Settlement {
  balances: MemberBalance[];
  transfers: SuggestedTransfer[];
  totalSpentKop: number;
}

/**
 * Балансы, переводы и итог расходов группы. Пересчитывается только при смене данных (NFR-7).
 * @param ledger Участники, видимые расходы и переводы.
 * @returns Результат расчёта.
 */
export function useSettlement(ledger: GroupLedger): Settlement {
  return useMemo(() => {
    const balances = calculateBalances(ledger);
    return {
      balances,
      transfers: suggestTransfers(balances),
      totalSpentKop: ledger.expenses.reduce((sum, expense) => sum + expense.amountKop, 0),
    };
  }, [ledger]);
}
