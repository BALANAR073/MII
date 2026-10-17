import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureMockApi, resetMockDb } from '../mocks/mockApi';
import { createSeed } from '../mocks/seed';
import { renderApp, resetApi } from '../test/renderApp';

describe('главная — сводка по всем группам (ДЗ6)', () => {
  beforeEach(() => {
    resetApi();
  });

  it('показывает итоги, людей с долгами, группы и последние операции', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Привет, Боря!' })).toBeInTheDocument();
    const people = await screen.findByRole('list', { name: 'С кем расчёты' });
    // В Казани Боря должен Ане 940,75 ₽ (AC-07.1).
    expect(within(people).getByText('Вы — Ане')).toBeInTheDocument();
    expect(within(people).getByText('−940,75 ₽')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Все группы' })).toHaveAttribute('href', '/groups');
    expect(screen.getByRole('list', { name: 'Последние операции' }).children.length).toBeGreaterThan(0);
  });

  it('пока грузится — скелетон, при ошибке — повтор', async () => {
    configureMockApi({ latencyMs: 150, failNext: 'network' });
    const { user } = renderApp('/');
    expect(await screen.findByText('Загружаем сводку…')).toBeInTheDocument();
    expect(await screen.findByText('Не удалось загрузить сводку')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('list', { name: 'С кем расчёты' })).toBeInTheDocument();
  });

  it('без групп — приветствие и пример группы в один клик', async () => {
    resetMockDb({ ...createSeed(), groups: [], expenses: [], transfers: [] });
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Попробовать на примере' }));
    expect(await screen.findByRole('heading', { name: /Пример: выходные в Питере/ })).toBeInTheDocument();
  });
});
