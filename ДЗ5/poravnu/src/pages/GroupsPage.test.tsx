import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '../mocks/mockApi';
import { createSeed } from '../mocks/seed';
import { renderApp, resetApi } from '../test/renderApp';

// Testing Library по умолчанию сводит неразрывные пробелы к обычным, поэтому в ожиданиях — обычный пробел.

describe('Экран «Мои группы»', () => {
  beforeEach(() => {
    resetApi();
  });

  it('показывает группы со своим балансом (AC-T2.1)', async () => {
    renderApp('/');
    expect(await screen.findAllByText('Вы должны 940,75 ₽')).not.toHaveLength(0);
    expect(screen.getAllByText('Вы в расчёте').length).toBeGreaterThan(0);
    expect(screen.getByText('Квартира на Ленина')).toBeInTheDocument();
  });

  it('без групп показывает пояснение и кнопку создания (ERR-2)', async () => {
    resetMockDb({ ...createSeed(), groups: [], expenses: [], transfers: [] });
    renderApp('/');
    expect(await screen.findByText('У вас пока нет групп')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Создать группу' })).toHaveLength(2);
  });

  it('не создаёт группу с пустым названием и создаёт с корректным (AC-02.1, AC-02.2)', async () => {
    const { user } = renderApp('/');
    await user.click((await screen.findAllByRole('button', { name: 'Создать группу' }))[0] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(screen.getByText('Введите название')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Название'), 'Поход');
    await user.click(screen.getByRole('radio', { name: 'Эмодзи 🏕' }));
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(await screen.findByRole('heading', { name: /Поход/ })).toBeInTheDocument();
    expect(screen.getAllByText('Вы в расчёте').length).toBeGreaterThan(0);
  });
});
