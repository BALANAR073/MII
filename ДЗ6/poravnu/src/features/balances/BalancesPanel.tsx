import { cx } from '../../lib/cx';
import { formatRub } from '../../lib/money';
import { plural } from '../../lib/russian';
import type { Member, MemberId } from '../../types/group';
import { Button } from '../../components/ui/Button';
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
  /** Добавить участника по имени (ДЗ6). */
  onAddMember?: () => void;
  onInvite?: () => void;
  onEditMember?: (member: Member, balanceKop: number) => void;
}

/**
 * Вкладка «Балансы» на телефоне и правая панель на десктопе (FR-4.6):
 * итог расходов, балансы с полосками и «Кто кому должен». Вынесено из GroupPage при рефакторинге.
 */
export function BalancesPanel({
  members,
  settlement,
  expensesCount,
  currentUserId,
  highlightTransfers = false,
  onMarkTransfer,
  onAddMember,
  onInvite,
  onEditMember,
}: BalancesPanelProps) {
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
        <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
          <h2 id="balances-title" className="text-base font-semibold text-slate-900">
            Участники и балансы
          </h2>
          {onAddMember !== undefined && (
            <Button variant="ghost" className="min-h-9 px-3 text-emerald-800" onClick={onAddMember}>
              + Добавить
            </Button>
          )}
        </div>
        <BalanceList members={members} balances={settlement.balances} currentUserId={currentUserId} onEditMember={onEditMember} />
        {activeCount === 1 && onAddMember !== undefined && (
          <p className="px-4 pb-3 text-sm text-slate-600">
            В группе пока только вы. Добавьте участников по имени или отправьте им ссылку — и начинайте делить расходы.
          </p>
        )}
        {onInvite !== undefined && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Button variant="secondary" className="w-full" onClick={onInvite}>
              Пригласить по ссылке
            </Button>
          </div>
        )}
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
