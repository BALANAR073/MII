import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, resetApi } from './renderApp';

// jsdom не считает реальные цвета, поэтому контраст проверяется отдельно — Lighthouse и скриншотами (NFR-2).
const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

describe('доступность экранов по axe-core (NFR-2, находка 29 AI-ревью)', () => {
  beforeEach(() => {
    resetApi();
  });

  it('экран «Группа» без нарушений', async () => {
    const { container } = renderApp('/groups/kazan');
    await screen.findByRole('heading', { name: /Поездка в Казань/ });
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  it('форма расхода без нарушений', async () => {
    renderApp('/groups/kazan/expenses/new');
    await screen.findByRole('dialog', { name: 'Новый расход' });
    const results = await axe(document.body, AXE_OPTIONS);
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  it('главная без нарушений (ДЗ6)', async () => {
    const { container } = renderApp('/');
    await screen.findByRole('list', { name: 'С кем расчёты' });
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  it('экран «Мои группы» без нарушений', async () => {
    const { container } = renderApp('/groups');
    await screen.findByRole('list', { name: 'Мои группы' });
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
