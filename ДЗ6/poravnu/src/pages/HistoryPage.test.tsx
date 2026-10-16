import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureMockApi, resetMockDb } from '../mocks/mockApi';
import { createSeed } from '../mocks/seed';
import { renderApp, resetApi } from '../test/renderApp';

describe('Экран «История операций» (US-10, AC-T9.1)', () => {
  beforeEach(() => {
    resetApi();
  });

  it('показывает скелетон, затем расходы и переводы от новых к старым (AC-10.1)', async () => {
    renderApp('/groups/flat/history');
    expect(await screen.findByText('Загружаем историю…')).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Операции' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent);
    expect(titles).toEqual(['Лёша → Вика', 'Боря → Вика', 'Интернет', 'Аренда за октябрь']);
  });

  it('при ошибке показывает сообщение и «Повторить»', async () => {
    configureMockApi({ failNext: 'network' });
    const { user } = renderApp('/groups/flat/history');
    expect(await screen.findByText('Не удалось загрузить историю')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('list', { name: 'Операции' })).toBeInTheDocument();
  });

  it('для группы без операций показывает пустое состояние', async () => {
    resetMockDb({ ...createSeed(), expenses: [], transfers: [] });
    renderApp('/groups/birthday/history');
    expect(await screen.findByText('Операций пока нет')).toBeInTheDocument();
  });
});
