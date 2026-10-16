import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGroup } from '../../mocks/mockApi';
import { renderApp, resetApi } from '../../test/renderApp';
import { UNDO_DELETE_MS } from './useDeferredDelete';

async function expenseExists(id: string): Promise<boolean> {
  const details = await getGroup('kazan');
  return details.expenses.some((expense) => expense.id === id);
}

/** Открывает свой расход «Продукты» и подтверждает удаление. */
async function deleteFood() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = renderApp('/groups/kazan/expenses/e-food');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const dialog = await screen.findByRole('dialog', { name: 'Продукты' });
  await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
  await user.click(screen.getByRole('button', { name: 'Удалить' }));
  return { ...view, user };
}

describe('отложенное удаление расхода (FR-3.5, AC-T3.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('запрос уходит ровно через 5 секунд, не раньше', async () => {
    await deleteFood();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_DELETE_MS - 100);
    });
    expect(await expenseExists('e-food')).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(await expenseExists('e-food')).toBe(false);
  });

  it('после «Отменить» запрос не отправляется никогда', async () => {
    const { user } = await deleteFood();
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_DELETE_MS * 3);
    });
    expect(await expenseExists('e-food')).toBe(true);
    expect(screen.getByRole('link', { name: /Продукты/ })).toBeInTheDocument();
  });

  it('при уходе со страницы удаляет сразу и убирает тост «Отменить» (находка 1 AI-ревью)', async () => {
    const { unmount } = await deleteFood();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(await expenseExists('e-food')).toBe(false);
  });
});
