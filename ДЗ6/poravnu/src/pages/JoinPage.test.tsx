import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMockAuth } from '../mocks/mockAuth';
import { renderApp, resetApi } from '../test/renderApp';

describe('вступление по ссылке с выбором места (ДЗ6, миграция 6)', () => {
  beforeEach(() => {
    resetApi();
    resetMockAuth('gosha');
  });

  it('предлагает занять место участника без аккаунта и переносит его расходы', async () => {
    const { user } = renderApp('/join/flat-lenina');
    expect(await screen.findByRole('heading', { name: /Квартира на Ленина/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Это я — Лёша' }));
    await user.click(screen.getByRole('button', { name: 'Вступить' }));

    const balances = await screen.findByRole('list', { name: 'Балансы участников' });
    expect(balances).toHaveTextContent('Гоша');
    expect(balances).not.toHaveTextContent('Лёша');
  });

  it('без выбора не вступает; «Меня нет в списке» — вступление новым участником', async () => {
    const { user } = renderApp('/join/flat-lenina');
    await screen.findByRole('heading', { name: /Квартира на Ленина/ });
    await user.click(screen.getByRole('button', { name: 'Вступить' }));
    expect(await screen.findByText('Выберите себя в списке или «Меня нет в списке»')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Меня нет в списке' }));
    await user.click(screen.getByRole('button', { name: 'Вступить' }));
    const balances = await screen.findByRole('list', { name: 'Балансы участников' });
    expect(balances).toHaveTextContent('Гоша');
    expect(balances).toHaveTextContent('Лёша');
  });
});
