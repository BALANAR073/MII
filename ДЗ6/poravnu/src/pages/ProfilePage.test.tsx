import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockAuth } from '../mocks/mockAuth';
import { renderApp, resetApi } from '../test/renderApp';

describe('профиль (ДЗ6)', () => {
  beforeEach(() => {
    resetApi();
  });

  it('меняет имя — новое имя сразу в заголовке и в шапке', async () => {
    const { user } = renderApp('/profile');
    const input = await screen.findByLabelText('Как вас видят в группах');
    await user.clear(input);
    await user.type(input, 'Борис');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('heading', { name: 'Борис' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Профиль: Борис' })).toBeInTheDocument();
  });

  it('пустое имя не сохраняется', async () => {
    const { user } = renderApp('/profile');
    const input = await screen.findByLabelText('Как вас видят в группах');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Введите имя');
  });

  it('демо-аккаунт удалить нельзя', async () => {
    renderApp('/profile');
    expect(await screen.findByText(/общий демо-аккаунт/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить аккаунт' })).not.toBeInTheDocument();
  });

  it('удаление аккаунта — только после ввода слова, затем экран входа', async () => {
    await mockAuth.signUp({ email: 'lesha@mail.ru', password: 'long-password', name: 'Лёша' });
    const { user } = renderApp('/profile');
    await user.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    const submit = screen.getByRole('button', { name: 'Удалить навсегда' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Чтобы подтвердить/), 'удалить');
    await user.click(submit);
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    await expect(mockAuth.signIn({ email: 'lesha@mail.ru', password: 'long-password' })).rejects.toThrow();
  });
});
