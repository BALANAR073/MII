import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '../mocks/mockApi';
import { createSeed } from '../mocks/seed';
import { renderApp, resetApi } from '../test/renderApp';

describe('вся активность (ДЗ6)', () => {
  beforeEach(() => {
    resetApi();
  });

  it('фильтр по группе оставляет только её операции', async () => {
    const { user } = renderApp('/activity');
    const feed = await screen.findByRole('list', { name: 'Последние операции' });
    const total = feed.children.length;
    await user.click(screen.getByRole('button', { name: /Поездка в Казань/ }));
    const filtered = screen.getByRole('list', { name: 'Последние операции' });
    expect(filtered.children.length).toBeLessThan(total);
    expect(
      within(filtered)
        .getAllByRole('link')
        .every((link) => link.getAttribute('href') === '/groups/kazan'),
    ).toBe(true);
  });

  it('без операций — пояснение', async () => {
    resetMockDb({ ...createSeed(), groups: [], expenses: [], transfers: [] });
    renderApp('/activity');
    expect(await screen.findByText('Операций пока нет')).toBeInTheDocument();
  });
});
