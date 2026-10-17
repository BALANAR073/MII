import { Link } from 'react-router-dom';
import { FOCUS_RING_INSET } from '../../components/ui/styles';
import { expenseCategory } from '../../lib/categories';
import { cx } from '../../lib/cx';
import { formatShortDate } from '../../lib/dates';
import { formatRub } from '../../lib/money';
import type { ActivityItem } from './computeDashboard';

interface ActivityFeedProps {
  items: readonly ActivityItem[];
  /** Показывать название группы в строке (на главной — да, в фильтре по одной группе — нет). */
  showGroup?: boolean;
}

/**
 * Лента операций по всем группам (ДЗ6): расходы и переводы от новых к старым.
 * Строка ведёт в группу; формулировки без рода («Платит: Вика»), как и на экране группы.
 */
export function ActivityFeed({ items, showGroup = true }: ActivityFeedProps) {
  return (
    <ul className="divide-y divide-slate-100" aria-label="Последние операции">
      {items.map((item) => {
        const key = item.kind === 'expense' ? `e-${item.expense.id}` : `t-${item.transfer.id}`;
        const icon = item.kind === 'expense' ? expenseCategory(item.expense).emoji : '💱';
        const title = item.kind === 'expense' ? item.expense.title : `${item.fromName} → ${item.toName}`;
        const subtitle = item.kind === 'expense' ? `Платит: ${item.payerName}` : 'Перевод отмечен';
        const amountKop = item.kind === 'expense' ? item.expense.amountKop : item.transfer.amountKop;
        const date = item.kind === 'expense' ? item.expense.date : item.at.slice(0, 10);
        return (
          <li key={key}>
            <Link to={`/groups/${item.groupId}`} className={cx('flex items-start gap-3 px-4 py-3 hover:bg-slate-50', FOCUS_RING_INSET)}>
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl"
              >
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{title}</span>
                <span className="mt-0.5 block truncate text-sm text-slate-600">{subtitle}</span>
                {showGroup && (
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    <span aria-hidden="true">{item.emoji}</span> {item.groupName}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums text-slate-900">{formatRub(amountKop)}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{formatShortDate(date)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
