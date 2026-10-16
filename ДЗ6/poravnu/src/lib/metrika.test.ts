import { afterEach, describe, expect, it } from 'vitest';
import { initMetrika, resetMetrika, trackGoal, trackPageView } from './metrika';

function calls(): unknown[][] {
  return window.ym?.a ?? [];
}

describe('Яндекс.Метрика (ДЗ6)', () => {
  afterEach(() => {
    resetMetrika();
    delete window.ym;
    document.head.querySelectorAll('script[src*="mc.yandex.ru"]').forEach((node) => node.remove());
  });

  it('без номера счётчика ничего не подключает и не ломает вызовы', () => {
    expect(initMetrika(undefined)).toBe(false);
    expect(initMetrika('abc')).toBe(false);
    trackGoal('sign_up');
    expect(window.ym).toBeUndefined();
    expect(document.querySelector('script[src*="mc.yandex.ru"]')).toBeNull();
  });

  it('подключает tag.js, инициализирует без вебвизора и ставит вызовы в очередь', () => {
    expect(initMetrika('104000000')).toBe(true);
    expect(document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js"]')).not.toBeNull();
    trackPageView('/join/secret-token?x=1', '/login?next=%2F');
    trackGoal('expense_added');
    expect(calls()[0]).toEqual([104000000, 'init', expect.objectContaining({ webvisor: false, clickmap: true })]);
    // Токен приглашения и query в Метрику не попадают.
    expect(calls()[1]).toEqual([104000000, 'hit', '/join/:token', { referer: '/login' }]);
    expect(calls()[2]).toEqual([104000000, 'reachGoal', 'expense_added']);
  });

  it('повторная инициализация не добавляет второй счётчик', () => {
    initMetrika('104000000');
    expect(initMetrika('104000000')).toBe(false);
    expect(document.querySelectorAll('script[src*="mc.yandex.ru"]')).toHaveLength(1);
  });
});
