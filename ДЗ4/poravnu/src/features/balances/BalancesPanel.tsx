import { cx } from '../../lib/cx';
import { formatRub } from '../../lib/money';
import { plural } from '../../lib/russian';
import type { Member, MemberId } from '../../types/group';
import { BalanceList } from './BalanceList';
import { TransferList } from './TransferList';
import type { Settlement } from './useSettlement';
import type { SuggestedTransfer } from './types';

interface BalancesPanelProps {
  members: readonly Member[];
  settlement: Settlement;
  expensesCount: number;
  currentUserId: MemberId;
  /** Подсветить блок переводов после нажатия «Рассчитаться» (решение Q3). */
  highlightTransfers?: boolean;
  onMarkTransfer: (transfer: SuggestedTransfer) => void;
}

/**
 * Вкладка «Балансы» на телефоне и правая панель на десктопе (FR-4.6):
 * итог расходов, балансы с полосками и «Кто кому должен». Вынесено из GroupPage при рефакторинге.
 */
export function BalancesPanel({ members, settlement, expensesCount, currentUserId, highlightTransfers = false, onMarkTransfer }: BalancesPanelProps) {
  const activeCount = members.filter((member) => member.leftAt === null).length;
  return (
    <>
      <section className="bg-white px-4 py-4 sm:rounded-xl">
        <p className="text-sm text-slate-600">Итого расходов</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{formatRub(settlement.totalSpentKop)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {expensesCount} {plural(expensesCount, ['операция', 'операции', 'операций'])} · {activeCount}{' '}
          {plural(activeCount, ['участник', 'участника', 'участников'])}
        </p>
      </section>
      <section className="bg-white sm:rounded-xl" aria-labelledby="balances-title">
        <h2 id="balances-title" className="px-4 pb-1 pt-4 text-base font-semibold text-slate-900">
          Балансы
        </h2>
        <BalanceList members={members} balances={settlement.balances} currentUserId={currentUserId} />
      </section>
      <section className={cx('bg-white sm:rounded-xl', highlightTransfers && 'ring-2 ring-emerald-700')} aria-labelledby="transfers-title">
        <h2 id="transfers-title" className="px-4 pb-3 pt-4 text-base font-semibold text-slate-900">
          Кто кому должен
        </h2>
        <TransferList members={members} transfers={settlement.transfers} currentUserId={currentUserId} onMark={onMarkTransfer} />
      </section>
    </>
  );
}
