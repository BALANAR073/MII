import { Link } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { cx } from '../../lib/cx';
import { formatRub } from '../../lib/money';
import type { Group, MemberId } from '../../types/group';
import { BALANCE_COLOR, getBalanceStatus } from '../balances/balanceText';
import { FOCUS_RING } from '../../components/ui/styles';
import { memberColorIndex } from '../../lib/memberColor';
import type { Kopecks } from '../../types/money';

const MAX_AVATARS = 5;

interface GroupHeaderProps {
  group: Group;
  currentUserId: MemberId;
  myBalanceKop: Kopecks;
  onSettle: () => void;
  onInvite: () => void;
  onAddMember: () => void;
  onSettings: () => void;
}

/**
 * Шапка группы по концепции 1 (FR-4.5): название, участники, крупно свой баланс
 * и «Рассчитаться» — кнопка видна только тому, кто должен (решение Q3).
 */
export function GroupHeader({ group, currentUserId, myBalanceKop, onSettle, onInvite, onAddMember, onSettings }: GroupHeaderProps) {
  const activeMembers = group.members.filter((member) => member.leftAt === null);
  const status = getBalanceStatus(myBalanceKop);

  return (
    <header className="bg-white px-4 pb-5 pt-4 sm:rounded-xl">
      <Link
        to="/groups"
        className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900 xl:hidden"
      >
        ← Мои группы
      </Link>
      <div className="flex items-start justify-between gap-2">
        <h1 className="min-w-0 text-2xl font-semibold text-slate-900">
          {group.name} <span aria-hidden="true">{group.emoji}</span>
        </h1>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Настройки группы"
          title="Настройки группы"
          className={cx(
            '-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-slate-500 hover:bg-slate-100',
            FOCUS_RING,
          )}
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {/* Не больше 5 аватаров и «+N»: при 50 участниках строка давала горизонтальную прокрутку (находка 11). */}
        <div className="flex shrink-0 -space-x-1.5">
          {activeMembers.slice(0, MAX_AVATARS).map((member) => (
            <Avatar
              key={member.id}
              name={member.name}
              index={memberColorIndex(group.members, member.id)}
              size="sm"
              stacked
              highlighted={member.id === currentUserId}
            />
          ))}
          {activeMembers.length > MAX_AVATARS && (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-700 ring-2 ring-white">
              +{activeMembers.length - MAX_AVATARS}
            </span>
          )}
        </div>
        <p className="min-w-0 truncate text-sm text-slate-600">{activeMembers.map((member) => member.name).join(', ')}</p>
      </div>

      <div className="mt-6">
        <p className="text-sm text-slate-600">{status === 'owes' ? 'Вы должны' : status === 'owed' ? 'Вам должны' : 'Ваш баланс'}</p>
        <p className={cx('mt-1 text-4xl font-semibold tabular-nums tracking-tight', BALANCE_COLOR[status])}>
          {status === 'settled' ? 'Вы в расчёте' : formatRub(Math.abs(myBalanceKop))}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'owes' && <Button onClick={onSettle}>Рассчитаться</Button>}
        <Button variant="secondary" onClick={onAddMember}>
          + Участник
        </Button>
        <Button variant="secondary" onClick={onInvite}>
          Пригласить
        </Button>
        <Link
          to="history"
          className={cx(
            'inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100',
            FOCUS_RING,
          )}
        >
          История
        </Link>
      </div>
    </header>
  );
}
