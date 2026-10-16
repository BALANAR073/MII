import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { deleteExpense } from '../../mocks/mockApi';
import type { Expense } from '../../types/group';

/** Сколько длится возможность отменить удаление (FR-3.5, AC-09.2). */
export const UNDO_DELETE_MS = 5000;

interface PendingDelete {
  expense: Expense;
  timer: number;
  toastId: number;
}

interface DeferredDelete {
  /** Расходы, скрытые из ленты в ожидании удаления. */
  hiddenIds: ReadonlySet<string>;
  requestDelete: (expense: Expense) => void;
}

/**
 * Отложенное удаление расхода: расход сразу скрывается, запрос уходит через 5 секунд,
 * а до этого его можно отменить кнопкой в тосте (FR-3.5).
 * При уходе со страницы, скрытии вкладки или её закрытии запрос отправляется сразу,
 * а тост с «Отменить» закрывается — чтобы не обещать отмену, которой уже не будет
 * (находки 1, 3, 4 и 25 AI-ревью кода).
 * @param groupId Группа.
 * @param onDeleted Вызывается после успешного удаления (перечитать данные).
 * @returns Скрытые id и функция запуска удаления.
 */
export function useDeferredDelete(groupId: string, onDeleted: () => void): DeferredDelete {
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(new Map<string, PendingDelete>());
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;
  const { showToast, dismissToast } = useToast();

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

  /** Снимает удаление из очереди и отправляет запрос. Повторный вызов для того же id ничего не делает. */
  const send = useCallback(
    (id: string, { notify }: { notify: boolean }) => {
      const pending = pendingRef.current.get(id);
      if (pending === undefined) {
        return;
      }
      pendingRef.current.delete(id);
      window.clearTimeout(pending.timer);
      dismissToast(pending.toastId);
      deleteExpense(groupId, id)
        .then(() => {
          if (notify) {
            onDeletedRef.current();
          }
        })
        .catch((error: unknown) => {
          if (notify) {
            setHidden(id, false);
            showToast({ message: apiErrorMessage(error, 'delete'), tone: 'error' });
          }
        });
    },
    [dismissToast, groupId, setHidden, showToast],
  );

  const requestDelete = useCallback(
    (expense: Expense) => {
      setHidden(expense.id, true);
      const timer = window.setTimeout(() => send(expense.id, { notify: true }), UNDO_DELETE_MS);
      const toastId = showToast({
        message: `Расход «${expense.title}» удалён`,
        durationMs: UNDO_DELETE_MS,
        action: {
          label: 'Отменить',
          onClick: () => {
            // Если запрос уже ушёл, отменять нечего — не возвращаем расход в ленту.
            const pending = pendingRef.current.get(expense.id);
            if (pending === undefined) {
              showToast({ message: 'Расход уже удалён' });
              return;
            }
            window.clearTimeout(pending.timer);
            pendingRef.current.delete(expense.id);
            setHidden(expense.id, false);
          },
        },
      });
      pendingRef.current.set(expense.id, { expense, timer, toastId });
    },
    [send, setHidden, showToast],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    const flushAll = (notify: boolean) => {
      for (const id of [...pending.keys()]) {
        send(id, { notify });
      }
    };
    // В ДЗ5 здесь будет запрос с keepalive / sendBeacon: обычный fetch браузер обрывает при закрытии вкладки.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushAll(true);
      }
    };
    const handlePageHide = () => flushAll(false);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      flushAll(false);
    };
  }, [send]);

  return { hiddenIds, requestDelete };
}
