import { useOutletContext } from 'react-router-dom';
import type { ExpenseInput } from '../types/api';
import type { Expense, GroupDetails } from '../types/group';

/** Что экран группы передаёт вложенным маршрутам (форма расхода). */
export interface GroupOutletContext {
  details: GroupDetails;
  /** Оптимистичное добавление: форма закрывается сразу, расход появляется в ленте (NFR-6). */
  createExpense: (input: ExpenseInput) => void;
  /** Перечитать группу после изменения. */
  reload: () => void;
  /** Удаление с возможностью отмены (FR-3.5). */
  requestDelete: (expense: Expense) => void;
}

/**
 * Данные группы во вложенном маршруте.
 * @returns Контекст, переданный через `<Outlet context>`.
 */
export function useGroupOutlet(): GroupOutletContext {
  return useOutletContext<GroupOutletContext>();
}
