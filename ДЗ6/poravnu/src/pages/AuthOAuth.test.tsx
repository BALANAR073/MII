import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enabledProviders } from '../api/supabaseApi';
import { lastMockOAuthProvider, resetMockAuth, setMockOAuthProviders } from '../mocks/mockAuth';
import { renderApp, resetApi } from '../test/renderApp';

describe('вход через Google — OAuth 2.0 (ДЗ6)', () => {
  beforeEach(() => {
    resetApi();
    resetMockAuth(null);
  });
  afterEach(() => {
    setMockOAuthProviders([]);
  });

  it('кнопка видна, только если провайдер включён в Supabase', async () => {
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Войти через Google' })).not.toBeInTheDocument();
  });

  it('нажатие уводит на провайдера', async () => {
    setMockOAuthProviders(['google']);
    const { user } = renderApp('/login?next=%2Fgroups%2Fkazan');
    await user.click(await screen.findByRole('button', { name: 'Войти через Google' }));
    expect(lastMockOAuthProvider()).toBe('google');
  });

  it('возврат от провайдера с сессией ведёт на next', async () => {
    resetMockAuth('borya');
    renderApp('/auth/callback?next=%2Fgroups%2Fkazan');
    expect(await screen.findByRole('heading', { name: /Поездка в Казань/ })).toBeInTheDocument();
  });

  it('отказ на стороне провайдера — понятная ошибка и путь назад; внешний next игнорируется', async () => {
    renderApp('/auth/callback?error=access_denied&next=https%3A%2F%2Fevil.example');
    expect(await screen.findByRole('alert')).toHaveTextContent('Вход отменён');
    expect(screen.getByRole('link', { name: 'Вернуться ко входу' })).toHaveAttribute('href', '/login');
  });
});

describe('enabledProviders', () => {
  it('берёт включённые провайдеры из /auth/v1/settings', () => {
    expect(enabledProviders({ external: { google: true, github: true, email: true } })).toEqual(['google']);
    expect(enabledProviders({ external: { google: false } })).toEqual([]);
    expect(enabledProviders(null)).toEqual([]);
    expect(enabledProviders({ external: 'нет' })).toEqual([]);
  });
});
