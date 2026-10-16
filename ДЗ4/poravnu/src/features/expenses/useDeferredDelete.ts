import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { deleteExpense } from '../../mocks/mockApi';
import type { Expense } from '../../types/group';

/** Сколько длится возможность отменить удаление (FR-3.5, AC-09.2). */
export const UNDO_DELETE_MS = 5000;

interface DeferredDelete {
  /** Расходы, скрытые из ленты в ожидании удаления. */
  hiddenIds: ReadonlySet<string>;
  requestDelete: (expense: Expense) => void;
}

/**
 * Отложенное удаление расхода: расход сразу скрывается, запрос уходит через 5 секунд,
 * а до этого его можно отменить кнопкой в тосте. При уходе со страницы или закрытии вкладки
 * запрос отправляется сразу, чтобы удаление не потерялось (FR-3.5).
 * @param groupId Группа.
 * @param onDeleted Вызывается после успешного удаления (перечитать данные).
 * @returns Скрытые id и функция запуска удаления.
 */
export function useDeferredDelete(groupId: string, onDeleted: () => void): DeferredDelete {
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const timersRef = useRef(new Map<string, number>());
  // Ожидающие удаления — чтобы отправить их сразу при уходе со страницы.
  const pendingRef = useRef(new Map<string, Expense>());
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;
  const { showToast } = useToast();

  const setHidden = useCallback((id: string, hidden: boolean) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      if (hidden) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const commit = useCallback(
    (expense: Expense) => {
      timersRef.current.delete(expense.id);
      deleteExpense(groupId, expense.id)
        .then(() => onDeletedRef.current())
        .catch((error: unknown) => {
          setHidden(expense.id, false);
          showToast({ message: apiErrorMessage(error, 'save'), tone: 'error' });
        });
    },
    [groupId, setHidden, showToast],
  );

  const requestDelete = useCallback(
    (expense: Expense) => {
      setHidden(expense.id, true);
      const timer = window.setTimeout(() => commit(expense), UNDO_DELETE_MS);
      timersRef.current.set(expense.id, timer);
      showToast({
        message: `Расход «${expense.title}» удалён`,
        durationMs: UNDO_DELETE_MS,
        action: {
          label: 'Отменить',
          onClick: () => {
            window.clearTimeout(timer);
            timersRef.current.delete(expense.id);
            setHidden(expense.id, false);
          },
        },
      });
      pendingRef.current.set(expense.id, expense);
    },
    [commit, setHidden, showToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    const pending = pendingRef.current;
    const flush = () => {
      for (const [id, timer] of timers) {
        window.clearTimeout(timer);
        const expense = pending.get(id);
        if (expense !== undefined) {
          void deleteExpense(groupId, expense.id).catch(() => undefined);
        }
      }
      timers.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [groupId]);

  return { hiddenIds, requestDelete };
}
