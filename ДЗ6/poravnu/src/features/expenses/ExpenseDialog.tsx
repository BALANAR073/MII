import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { formatShortDate, todayIso } from '../../lib/dates';
import { formatRub } from '../../lib/money';
import { updateExpense } from '../../api';
import { ApiError, type ExpenseInput } from '../../types/api';
import { useCurrentUser } from '../../app/AuthProvider';
import { useGroupOutlet } from '../../pages/groupOutlet';
import type { Expense, Member } from '../../types/group';
import { getExpenseShares, getSplitMemberIds } from '../balances/getExpenseShares';
import { describeExpense, memberName } from './describeExpense';
import { ExpenseForm } from './ExpenseForm';
import { emptyExpenseForm, expenseToForm } from './expenseFormModel';

/**
 * Маршруты `expenses/new` и `expenses/:expenseId` (FR-3.2, FR-3.5).
 * На мобильном — во весь экран, на десктопе — модальное окно поверх группы.
 */
export function ExpenseDialog() {
  const { expenseId } = useParams();
  const { details } = useGroupOutlet();
  const navigate = useNavigate();
  const close = () => navigate(`/groups/${details.group.id}`);

  if (expenseId === undefined) {
    return <NewExpense onClose={close} />;
  }
  const expense = details.expenses.find((item) => item.id === expenseId);
  if (expense === undefined) {
    return (
      <Dialog title="Расход" onClose={close}>
        <StatusMessage tone="empty" icon="🗑" title="Этот расход уже удалён" description="Лента обновлена." />
      </Dialog>
    );
  }
  return <ExistingExpense expense={expense} onClose={close} />;
}

interface NewExpenseProps {
  onClose: () => void;
}

function NewExpense({ onClose }: NewExpenseProps) {
  const { details, createExpense } = useGroupOutlet();
  const currentUserId = useCurrentUser().id;
  const location = useLocation();
  const activeMembers = details.members.filter((member) => member.leftAt === null);
  const draft = readDraft(location.state);
  const initial =
    draft === null
      ? emptyExpenseForm(activeMembers, currentUserId, todayIso())
      : expenseToForm(inputToExpense(draft, details.group.id, currentUserId), activeMembers);

  return (
    <Dialog title="Новый расход" onClose={onClose} fullScreenOnMobile>
      <ExpenseForm
        initialValues={initial}
        activeMembers={activeMembers}
        submitLabel="Сохранить"
        onSubmit={createExpense}
        onCancel={onClose}
      />
    </Dialog>
  );
}

interface ExistingExpenseProps {
  expense: Expense;
  onClose: () => void;
}

function ExistingExpense({ expense, onClose }: ExistingExpenseProps) {
  const { details, reload, requestDelete } = useGroupOutlet();
  const currentUserId = useCurrentUser().id;
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const { pending, run } = useMutation();
  const { showToast } = useToast();
  const activeMembers = details.members.filter((member) => member.leftAt === null);
  const hasLeftMember = getSplitMemberIds(expense.split).some((id) => !activeMembers.some((member) => member.id === id));
  const canEdit = expense.createdBy === currentUserId && !hasLeftMember;

  const save = async (input: ExpenseInput) => {
    try {
      const saved = await run(() => updateExpense(details.group.id, expense.id, input));
      if (saved !== undefined) {
        showToast({ message: 'Расход сохранён', tone: 'success' });
        reload();
        onClose();
      }
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'conflict') {
        // ERR-10: расход удалили с другого устройства — закрываем форму и обновляем ленту.
        showToast({ message: 'Этот расход уже удалён', tone: 'error' });
        reload();
        onClose();
        return;
      }
      showToast({
        message: apiErrorMessage(error, 'save'),
        tone: 'error',
        action: { label: 'Повторить', onClick: () => void save(input) },
      });
    }
  };

  if (mode === 'edit') {
    return (
      <Dialog key="edit" title="Изменить расход" onClose={onClose} fullScreenOnMobile>
        <ExpenseForm
          initialValues={expenseToForm(expense, activeMembers)}
          activeMembers={activeMembers}
          submitLabel="Сохранить"
          pending={pending}
          onSubmit={(input) => void save(input)}
          onCancel={() => setMode('view')}
        />
      </Dialog>
    );
  }

  return (
    // key по режиму: окно пересоздаётся и переводит фокус в новый режим (находка 8 AI-ревью).
    <Dialog key={mode} title={expense.title} onClose={onClose}>
      <ExpenseDetails expense={expense} members={details.members} />
      {mode === 'confirm-delete' ? (
        <div className="mt-5 rounded-xl bg-rose-50 p-4">
          <p className="text-sm text-rose-800">Удалить расход? Балансы пересчитаются. 5 секунд удаление можно будет отменить.</p>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setMode('view')}>
              Не удалять
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                requestDelete(expense);
                onClose();
              }}
            >
              Удалить
            </Button>
          </div>
        </div>
      ) : canEdit ? (
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="danger" onClick={() => setMode('confirm-delete')}>
            Удалить
          </Button>
          <Button onClick={() => setMode('edit')}>Изменить</Button>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-500">
          {hasLeftMember
            ? 'В расходе есть вышедший участник — изменить его нельзя.'
            : `Изменить или удалить расход может только автор — ${memberName(details.members, expense.createdBy)}.`}
        </p>
      )}
    </Dialog>
  );
}

interface ExpenseDetailsProps {
  expense: Expense;
  members: readonly Member[];
}

function ExpenseDetails({ expense, members }: ExpenseDetailsProps) {
  const currentUserId = useCurrentUser().id;
  const shares = getExpenseShares(expense, members);
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums text-slate-900">{formatRub(expense.amountKop)}</p>
      <p className="mt-1 text-sm text-slate-600">
        {describeExpense(expense, members, currentUserId)} · {formatShortDate(expense.date)}
      </p>
      <h3 className="mt-5 text-sm font-semibold text-slate-800">Доли</h3>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {shares.map((share) => (
          <li key={share.memberId} className="flex justify-between px-3 py-2 text-sm">
            <span className="text-slate-800">
              {memberName(members, share.memberId)}
              {share.memberId === currentUserId && <span className="text-slate-500"> (вы)</span>}
            </span>
            <span className="tabular-nums text-slate-900">{formatRub(share.amountKop)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function inputToExpense(input: ExpenseInput, groupId: string, createdBy: string): Expense {
  return { id: 'draft', groupId, ...input, createdBy, createdAt: new Date().toISOString() };
}

function readDraft(state: unknown): ExpenseInput | null {
  if (typeof state === 'object' && state !== null && 'draft' in state && isExpenseInput(state.draft)) {
    return state.draft;
  }
  return null;
}

/** Проверка черновика из history state: он переживает перезагрузку страницы, поэтому типам не верим (находка 22). */
function isExpenseInput(value: unknown): value is ExpenseInput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { title, amountKop, payerId, date, split } = value as Record<string, unknown>;
  return (
    typeof title === 'string' &&
    typeof amountKop === 'number' &&
    Number.isSafeInteger(amountKop) &&
    typeof payerId === 'string' &&
    typeof date === 'string' &&
    isSplit(split)
  );
}

function isSplit(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  if (value.kind === 'equal') {
    return 'memberIds' in value && Array.isArray(value.memberIds) && value.memberIds.every((id: unknown) => typeof id === 'string');
  }
  return (
    value.kind === 'shares' &&
    'shares' in value &&
    Array.isArray(value.shares) &&
    value.shares.every(
      (share: unknown) =>
        typeof share === 'object' && share !== null && 'memberId' in share && 'weight' in share && typeof share.weight === 'number',
    )
  );
}
