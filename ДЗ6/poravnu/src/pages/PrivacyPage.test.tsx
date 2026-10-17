import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { resetMockAuth } from '../mocks/mockAuth';
import { renderApp, resetApi } from '../test/renderApp';

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

describe('политика конфиденциальности (ДЗ6, Google OAuth)', () => {
  beforeEach(() => {
    resetApi();
    resetMockAuth(null);
  });

  it('открывается без входа: на неё ссылается экран согласия Google', async () => {
    const { container } = renderApp('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Политика конфиденциальности' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Вход через Google' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Вход' })).not.toBeInTheDocument();
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  it('с формы входа можно перейти к политике', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('link', { name: 'политикой конфиденциальности' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Политика конфиденциальности' })).toBeInTheDocument();
  });
});
