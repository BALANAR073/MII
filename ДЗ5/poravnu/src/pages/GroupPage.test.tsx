import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureMockApi } from '../mocks/mockApi';
import { renderApp, resetApi } from '../test/renderApp';

// Testing Library по умолчанию сводит неразрывные пробелы к обычным, поэтому в ожиданиях — обычный пробел.

describe('Экран «Группа»', () => {
  beforeEach(() => {
    resetApi();
  });

  it('показывает скелетон, затем свой долг и три перевода Ане (AC-07.1, FR-4.5)', async () => {
    renderApp('/groups/kazan');
    expect(screen.getByText('Загружаем группу…')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: /Поездка в Казань/ })).toBeInTheDocument();
    expect(screen.getAllByText('940,75 ₽').length).toBeGreaterThan(0);
    const transfers = screen.getByRole('list', { name: 'Кто кому должен' });
    expect(within(transfers).getAllByRole('listitem')).toHaveLength(3);
    expect(within(transfers).getByText('Гоша переводит Аня')).toBeInTheDocument();
  });

  it('кнопка «Отметить перевод» есть только у перевода с участием пользователя (AC-08.2)', async () => {
    renderApp('/groups/kazan');
    const transfers = await screen.findByRole('list', { name: 'Кто кому должен' });
    expect(within(transfers).getAllByRole('button', { name: 'Отметить перевод' })).toHaveLength(1);
  });

  it('при сетевой ошибке показывает сообщение и загружает снова по «Повторить» (ERR-3)', async () => {
    configureMockApi({ failNext: 'network' });
    const { user } = renderApp('/groups/kazan');

    expect(await screen.findByText('Не удалось загрузить группу')).toBeInTheDocument();
    expect(screen.getByText('Не удалось загрузить данные. Проверьте интернет')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('heading', { name: /Поездка в Казань/ })).toBeInTheDocument();
  });

  it('для чужой или удалённой группы предлагает вернуться к списку (ERR-7)', async () => {
    renderApp('/groups/unknown');
    expect(await screen.findByText('Группа недоступна')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К моим группам' })).toBeInTheDocument();
  });

  it('отмечает перевод через «Рассчитаться»: баланс Бори становится нулевым (AC-08.1, AC-T4.3)', async () => {
    const { user } = renderApp('/groups/kazan');
    await user.click(await screen.findByRole('button', { name: 'Рассчитаться' }));
    const dialog = screen.getByRole('dialog', { name: 'Отметить перевод' });
    await user.click(within(dialog).getByRole('button', { name: 'Подтвердить перевод' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('Вы в расчёте').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Рассчитаться' })).not.toBeInTheDocument();
  });

  it('при ошибке сети окно перевода не закрывается, а балансы не меняются (AC-08.3)', async () => {
    const { user } = renderApp('/groups/kazan');
    await user.click(await screen.findByRole('button', { name: 'Рассчитаться' }));
    configureMockApi({ failNext: 'network' });
    await user.click(screen.getByRole('button', { name: 'Подтвердить перевод' }));

    expect(await screen.findByText('Не удалось сохранить. Проверьте интернет')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Отметить перевод' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('новый расход появляется в ленте сразу, а при ошибке откатывается и форма открывается снова (NFR-6, AC-T6.1)', async () => {
    const { user } = renderApp('/groups/kazan/expenses/new');
    await user.type(await screen.findByLabelText('Название'), 'Музей');
    await user.type(screen.getByLabelText('Сумма, ₽'), '1000');
    // 300 мс: при 30 мс строка «Сохраняется…» иногда пропадала раньше проверки — тест был нестабильным.
    configureMockApi({ latencyMs: 300, failNext: 'network' });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Сохраняется…')).toBeInTheDocument();
    expect(await screen.findByText('Не удалось сохранить. Проверьте интернет')).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: 'Новый расход' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Музей');
    expect(screen.getByLabelText('Сумма, ₽')).toHaveValue('1000');
  });

  it('удаление своего расхода можно отменить в течение 5 секунд (AC-09.2, AC-T3.4)', async () => {
    const { user } = renderApp('/groups/kazan/expenses/e-food');
    const dialog = await screen.findByRole('dialog', { name: 'Продукты' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Расход «Продукты» удалён')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Продукты/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(await screen.findByRole('link', { name: /Продукты/ })).toBeInTheDocument();
  });

  it('чужой расход открывается только для просмотра (AC-09.3)', async () => {
    renderApp('/groups/kazan/expenses/e-coffee');
    const dialog = await screen.findByRole('dialog', { name: 'Кофе' });
    expect(within(dialog).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/может только автор — Гоша/)).toBeInTheDocument();
  });
});
