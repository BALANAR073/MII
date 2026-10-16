import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { cx } from '../../lib/cx';
import { formatRub } from '../../lib/money';
import type { Member, MemberId } from '../../types/group';
import type { SuggestedTransfer } from './types';
import { memberColorIndex } from '../../lib/memberColor';

interface TransferListProps {
  members: readonly Member[];
  transfers: readonly SuggestedTransfer[];
  currentUserId: MemberId;
  onMark: (transfer: SuggestedTransfer) => void;
}

/**
 * Блок «Кто кому должен» (FR-4.3, концепция 2): стрелки между участниками,
 * свои строки подсвечены, кнопка «Отметить перевод» — только участникам перевода (AC-08.2).
 */
export function TransferList({ members, transfers, currentUserId, onMark }: TransferListProps) {
  if (transfers.length === 0) {
    return (
      <p role="status" className="px-4 py-6 text-center text-sm font-medium text-slate-600">
        Все в расчёте 🎉
      </p>
    );
  }

  const memberIndex = (id: MemberId) => memberColorIndex(members, id);
  const memberName = (id: MemberId) => members.find((member) => member.id === id)?.name ?? 'Участник';

  return (
    <ul className="space-y-2 px-4 pb-4" aria-label="Кто кому должен">
      {transfers.map((transfer) => {
        const involvesMe = transfer.fromId === currentUserId || transfer.toId === currentUserId;
        const fromName = memberName(transfer.fromId);
        const toName = memberName(transfer.toId);
        return (
          <li
            key={`${transfer.fromId}-${transfer.toId}`}
            data-mine={involvesMe || undefined}
            className={cx('rounded-xl border px-3 py-2', involvesMe ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')}
          >
            <div className="flex items-center gap-2">
              <span className="flex -space-x-1.5">
                <Avatar name={fromName} index={memberIndex(transfer.fromId)} size="sm" stacked />
                <Avatar name={toName} index={memberIndex(transfer.toId)} size="sm" stacked />
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-slate-800">
                <span className="sr-only">{`${fromName} переводит ${toName}`}</span>
                <span aria-hidden="true">
                  {fromName} → {toName}
                </span>
              </p>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatRub(transfer.amountKop)}</span>
            </div>
            {involvesMe && (
              <Button variant="secondary" className="mt-2 w-full" onClick={() => onMark(transfer)}>
                Отметить перевод
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
