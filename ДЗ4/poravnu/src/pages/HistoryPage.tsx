import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { SkeletonList } from '../components/ui/Skeleton';
import { StatusMessage } from '../components/ui/StatusMessage';
import { memberName } from '../features/expenses/describeExpense';
import { useGroup } from '../features/groups/useGroups';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { formatShortDate } from '../lib/dates';
import { formatRub } from '../lib/money';
import type { GroupDetails, Member } from '../types/group';

interface HistoryItem {
  id: string;
  kind: 'expense' | 'transfer';
  /** Дата для сортировки: дата расхода или дата отметки перевода. */
  date: string;
  createdAt: string;
  title: string;
  subtitle: string;
  amountKop: number;
}

/** История операций группы (US-10, FR-5.2): расходы и переводы одной лентой. */
export function HistoryPage() {
  const { groupId = '' } = useParams();
  const { state, reload } = useGroup(groupId);

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="px-4 pb-4 pt-6 sm:px-0">
        <Link to={`/groups/${groupId}`} className="inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900">
          ← К группе
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">История операций</h1>
      </div>
      {state.status === 'loading' && <SkeletonList rows={5} label="Загружаем историю…" />}
      {state.status === 'error' && (
        <StatusMessage tone="error" title="Не удалось загрузить историю" description={apiErrorMessage(state.error, 'load')} action={<Button onClick={reload}>Повторить</Button>} />
      )}
      {state.status === 'success' && <HistoryList details={state.data} />}
    </div>
  );
}

interface HistoryListProps {
  details: GroupDetails;
}

function HistoryList({ details }: HistoryListProps) {
  const items = buildHistory(details);
  if (items.length === 0) {
    return <StatusMessage tone="empty" icon="📭" title="Операций пока нет" description="Здесь появятся расходы и отмеченные переводы." />;
  }
  return (
    <ul className="divide-y divide-slate-100 bg-white sm:rounded-xl" aria-label="Операции">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
          <span aria-hidden="true" className="mt-0.5 text-lg">
            {item.kind === 'expense' ? '🧾' : '💸'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-slate-900">{item.title}</p>
            <p className="text-sm text-slate-600">
              {item.subtitle} · {formatShortDate(item.date)}
            </p>
          </div>
          <span className="shrink-0 text-base font-semibold tabular-nums text-slate-900">{formatRub(item.amountKop)}</span>
        </li>
      ))}
    </ul>
  );
}

function buildHistory(details: GroupDetails): HistoryItem[] {
  const name = (id: string) => withLeftMark(details.members, id);
  const expenses: HistoryItem[] = details.expenses.map((expense) => ({
    id: expense.id,
    kind: 'expense',
    date: expense.date,
    createdAt: expense.createdAt,
    title: expense.title,
    subtitle: `Расход · автор: ${name(expense.createdBy)}`,
    amountKop: expense.amountKop,
  }));
  const transfers: HistoryItem[] = details.transfers.map((transfer) => ({
    id: transfer.id,
    kind: 'transfer',
    date: transfer.createdAt.slice(0, 10),
    createdAt: transfer.createdAt,
    title: `${name(transfer.fromId)} → ${name(transfer.toId)}`,
    subtitle: `Перевод · отметил(а): ${name(transfer.createdBy)}`,
    amountKop: transfer.amountKop,
  }));
  // Сортировка по решению Q12: по дате, при равенстве — по времени создания.
  return [...expenses, ...transfers].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function withLeftMark(members: readonly Member[], id: string): string {
  const member = members.find((item) => item.id === id);
  if (member === undefined) {
    return memberName(members, id);
  }
  return member.leftAt === null ? member.name : `${member.name} (не в группе)`;
}
