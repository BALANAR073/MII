import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { addExpense } from '../../mocks/mockApi';
import { type ExpenseInput } from '../../types/api';
import type { Expense, MemberId } from '../../types/group';

interface OptimisticItem {
  expense: Expense;
  saved: boolean;
}

interface OptimisticExpenses {
  /** Расходы с сервера плюс ещё не подтверждённые, от новых к старым. */
  expenses: Expense[];
  /** Id расходов, которые ещё сохраняются. */
  pendingIds: ReadonlySet<string>;
  createExpense: (input: ExpenseInput) => void;
}

/**
 * Оптимистичное добавление расхода (NFR-6): форма закрывается сразу, расход появляется в ленте
 * с пометкой «Сохраняется…». При ошибке строка убирается, а форма открывается снова
 * с введёнными данными (ERR-4, AC-T6.1). Вынесено из GroupPage при рефакторинге.
 * @param groupId Группа.
 * @param serverExpenses Расходы, пришедшие с сервера.
 * @param currentUserId Автор новых расходов.
 * @param onSaved Вызывается после подтверждения сервером (перечитать группу).
 * @returns Объединённая лента, id сохраняющихся расходов и функция добавления.
 */
export function useOptimisticExpenses(
  groupId: string,
  serverExpenses: readonly Expense[],
  currentUserId: MemberId,
  onSaved: () => void,
): OptimisticExpenses {
  const [items, setItems] = useState<OptimisticItem[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  // Текущий адрес в ref: ответ сервера приходит позже, и пользователь мог уже уйти с экрана.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const { showToast } = useToast();

  // Подтверждённые расходы убираем из локального списка, когда они пришли с сервера.
  useEffect(() => {
    const serverIds = new Set(serverExpenses.map((expense) => expense.id));
    // Тот же массив, если убирать нечего, — без лишней перерисовки (находка 23).
    setItems((current) => (current.some((item) => serverIds.has(item.expense.id)) ? current.filter((item) => !serverIds.has(item.expense.id)) : current));
  }, [serverExpenses]);

  const expenses = useMemo(() => {
    const serverIds = new Set(serverExpenses.map((expense) => expense.id));
    const extra = items.map((item) => item.expense).filter((expense) => !serverIds.has(expense.id));
    return [...extra, ...serverExpenses].sort(byDateDesc);
  }, [serverExpenses, items]);

  const pendingIds = useMemo(() => new Set(items.filter((item) => !item.saved).map((item) => item.expense.id)), [items]);

  const createExpense = useCallback(
    function create(input: ExpenseInput): void {
      const tempId = `tmp-${randomId()}`;
      const temp: Expense = { id: tempId, groupId, ...input, createdBy: currentUserId, createdAt: new Date().toISOString() };
      setItems((current) => [...current, { expense: temp, saved: false }]);
      navigate(`/groups/${groupId}`);
      addExpense(groupId, input)
        .then((saved) => {
          setItems((current) => current.map((item) => (item.expense.id === tempId ? { expense: saved, saved: true } : item)));
          showToast({ message: `Расход «${saved.title}» добавлен`, tone: 'success' });
          onSaved();
        })
        .catch((error: unknown) => {
          setItems((current) => current.filter((item) => item.expense.id !== tempId));
          // Форму с черновиком открываем, только если пользователь всё ещё в этой группе (находка 5).
          if (pathnameRef.current.startsWith(`/groups/${groupId}`)) {
            navigate(`/groups/${groupId}/expenses/new`, { state: { draft: input } });
          }
          showToast({
            message: apiErrorMessage(error, 'save'),
            tone: 'error',
            action: { label: 'Повторить', onClick: () => create(input) },
          });
        });
    },
    [groupId, currentUserId, navigate, onSaved, showToast],
  );

  return { expenses, pendingIds, createExpense };
}

function randomId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Сортировка ленты по решению Q12: по дате расхода, при равенстве — по времени создания. */
function byDateDesc(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}
