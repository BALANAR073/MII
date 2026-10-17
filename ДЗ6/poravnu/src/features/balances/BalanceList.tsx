import { BalanceBar } from '../../components/ui/BalanceBar';
import { Avatar } from '../../components/ui/Avatar';
import { cx } from '../../lib/cx';
import { formatSignedRub } from '../../lib/money';
import type { Member, MemberId } from '../../types/group';
import { BALANCE_COLOR, describeMemberBalance, describeMyBalance, getBalanceStatus } from './balanceText';
import type { MemberBalance } from './types';
import { FOCUS_RING } from '../../components/ui/styles';

interface BalanceListProps {
  members: readonly Member[];
  balances: readonly MemberBalance[];
  currentUserId: MemberId;
  /** Открыть участника без аккаунта: переименовать или убрать (ДЗ6). */
  onEditMember?: (member: Member, balanceKop: number) => void;
}

/**
 * Балансы активных участников с полосками (FR-2.6, FR-4.2, FR-4.6).
 * Вышедшие участники не показываются: их баланс всегда 0 (выйти можно только в расчёте).
 */
export function BalanceList({ members, balances, currentUserId, onEditMember }: BalanceListProps) {
  const maxAbsKop = balances.reduce((max, balance) => Math.max(max, Math.abs(balance.balanceKop)), 0);
  const rows = members.flatMap((member, index) => {
    if (member.leftAt !== null) {
      return [];
    }
    const balanceKop = balances.find((balance) => balance.memberId === member.id)?.balanceKop ?? 0;
    return [{ member, index, balanceKop }];
  });

  return (
    <ul className="divide-y divide-slate-100" aria-label="Балансы участников">
      {rows.map(({ member, index, balanceKop }) => {
        const isMe = member.id === currentUserId;
        const status = getBalanceStatus(balanceKop);
        return (
          <li key={member.id} className={cx('px-4 py-3', isMe && 'bg-emerald-50/60')}>
            <div className="flex items-center gap-3">
              <Avatar name={member.name} index={index} size="sm" highlighted={isMe} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {member.name}
                  {isMe && <span className="ml-1 text-xs font-normal text-slate-500">(вы)</span>}
                  {member.isVirtual === true && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-normal text-slate-600">
                      без аккаунта
                    </span>
                  )}
                </p>
                <p className={cx('text-sm', BALANCE_COLOR[status])}>
                  {isMe ? describeMyBalance(balanceKop) : describeMemberBalance(member.name, balanceKop)}
                </p>
              </div>
              <span aria-hidden="true" className={cx('shrink-0 text-sm font-semibold tabular-nums', BALANCE_COLOR[status])}>
                {formatSignedRub(balanceKop)}
              </span>
              {member.isVirtual === true && onEditMember !== undefined && (
                <button
                  type="button"
                  aria-label={`Изменить участника ${member.name}`}
                  className={cx(
                    '-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100',
                    FOCUS_RING,
                  )}
                  onClick={() => onEditMember(member, balanceKop)}
                >
                  <span aria-hidden="true">✎</span>
                </button>
              )}
            </div>
            <div className="mt-2 pl-10">
              <BalanceBar balanceKop={balanceKop} maxAbsKop={maxAbsKop} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
