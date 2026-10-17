import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
