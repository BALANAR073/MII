import { Link } from 'react-router-dom';
import { formatShortDate } from '../../lib/dates';
import { cx } from '../../lib/cx';
import { formatRub } from '../../lib/money';
import type { Expense, Member, MemberId } from '../../types/group';
import { describeExpense, describeMyShare } from './describeExpense';
import { FOCUS_RING_INSET } from '../../components/ui/styles';

const NO_PENDING: ReadonlySet<string> = new Set();

interface ExpenseListProps {
  expenses: readonly Expense[];
  members: readonly Member[];
  currentUserId: MemberId;
  /** Расходы, которые ещё сохраняются (оптимистичное добавление, NFR-6). */
  pendingIds?: ReadonlySet<string>;
}

/**
 * Лента расходов группы (FR-3.1): без карточек, тонкие разделители — концепция 1.
 * Каждая строка — ссылка на просмотр или редактирование расхода.
 */
export function ExpenseList({ expenses, members, currentUserId, pendingIds = NO_PENDING }: ExpenseListProps) {
  return (
    <ul className="divide-y divide-slate-100" aria-label="Расходы">
      {expenses.map((expense) => {
        const pending = pendingIds.has(expense.id);
        const content = (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-slate-900">{expense.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{describeExpense(expense, members, currentUserId)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-semibold tabular-nums text-slate-900">{formatRub(expense.amountKop)}</p>
              <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                {pending ? 'Сохраняется…' : describeMyShare(expense, members, currentUserId)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{formatShortDate(expense.date)}</p>
            </div>
          </>
        );
        return (
          <li key={expense.id}>
            {pending ? (
              <div aria-busy="true" className="flex items-start gap-4 bg-slate-50 px-4 py-3">
                {content}
              </div>
            ) : (
              <Link
                to={`expenses/${expense.id}`}
                className={cx('flex items-start gap-4 px-4 py-3 transition hover:bg-slate-50', FOCUS_RING_INSET)}
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
