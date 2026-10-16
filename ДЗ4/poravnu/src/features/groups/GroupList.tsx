import { NavLink } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { plural } from '../../lib/russian';
import type { GroupSummary } from '../../types/group';
import { BALANCE_COLOR, describeMyBalance, getBalanceStatus } from '../balances/balanceText';
import { FOCUS_RING_INSET } from '../../components/ui/styles';

interface GroupListProps {
  groups: readonly GroupSummary[];
  /** Компактный вид для боковой панели на десктопе. */
  compact?: boolean;
}

/** Список групп пользователя (FR-2.1): эмодзи, название, участники и свой баланс. */
export function GroupList({ groups, compact = false }: GroupListProps) {
  return (
    <ul className={cx(compact ? 'space-y-1' : 'divide-y divide-slate-100 bg-white sm:rounded-xl')} aria-label="Мои группы">
      {groups.map((group) => {
        const status = getBalanceStatus(group.myBalanceKop);
        return (
          <li key={group.id}>
            <NavLink
              to={`/groups/${group.id}`}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 transition', FOCUS_RING_INSET,
                  compact ? 'rounded-xl px-3 py-2' : 'px-4 py-4 hover:bg-slate-50',
                  compact && (isActive ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-100'),
                )
              }
            >
              <span aria-hidden="true" className={cx('flex shrink-0 items-center justify-center rounded-xl bg-slate-100', compact ? 'h-8 w-8 text-base' : 'h-12 w-12 text-2xl')}>
                {group.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate font-medium', compact ? 'text-sm' : 'text-base text-slate-900')}>{group.name}</span>
                {!compact && (
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {group.activeMembersCount} {plural(group.activeMembersCount, ['участник', 'участника', 'участников'])}
                  </span>
                )}
                {!compact && (
                  <span className={cx('mt-0.5 block text-sm font-medium tabular-nums sm:hidden', BALANCE_COLOR[status])}>
                    {describeMyBalance(group.myBalanceKop)}
                  </span>
                )}
              </span>
              {!compact && (
                <span className={cx('hidden shrink-0 text-right text-sm font-medium tabular-nums sm:block', BALANCE_COLOR[status])}>
                  {describeMyBalance(group.myBalanceKop)}
                </span>
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
