import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  configureMetrika,
  getAnalyticsConsent,
  isSafeUrl,
  resetMetrika,
  setAnalyticsConsent,
  trackGoal,
  trackPageView,
} from './metrika';

function calls(): unknown[][] {
  return window.ym?.a ?? [];
}

function goTo(url: string): void {
  window.history.replaceState(null, '', url);
}

describe('Яндекс.Метрика (ДЗ6)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    goTo('/');
  });

  afterEach(() => {
    resetMetrika();
    delete window.ym;
    document.head.querySelectorAll('script[src*="mc.yandex.ru"]').forEach((node) => node.remove());
  });

  it('без номера счётчика ничего не подключает и не ломает вызовы', () => {
    expect(configureMetrika(undefined)).toBe(false);
    expect(configureMetrika('abc')).toBe(false);
    setAnalyticsConsent('granted');
    trackGoal('sign_up');
    expect(window.ym).toBeUndefined();
    expect(document.querySelector('script[src*="mc.yandex.ru"]')).toBeNull();
  });

  it('до согласия счётчик не загружается, а цели не копятся (152-ФЗ)', () => {
    expect(configureMetrika('104000000')).toBe(true);
    trackGoal('login');
    trackPageView('/groups/1', '/');
    expect(document.querySelector('script[src*="mc.yandex.ru"]')).toBeNull();
    setAnalyticsConsent('granted');
    expect(calls().filter((call) => call[1] === 'reachGoal')).toEqual([]);
  });

  it('после согласия: tag.js, init без автосбора по адресу, просмотр первой страницы', () => {
    goTo('/groups/kazan');
    configureMetrika('104000000');
    setAnalyticsConsent('granted');
    expect(getAnalyticsConsent()).toBe('granted');
    expect(document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js"]')).not.toBeNull();
    expect(calls()[0]).toEqual([
      104000000,
      'init',
      expect.objectContaining({ webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: false }),
    ]);
    expect(calls()[1]).toEqual([104000000, 'hit', '/groups/kazan', { referer: undefined }]);
  });

  it('на странице приглашения счётчик не запускается, цель ждёт безопасной страницы (находка 1 AI-аудита)', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    goTo('/join/secret-token');
    configureMetrika('104000000');
    trackGoal('group_joined');
    expect(window.ym).toBeUndefined();

    goTo('/groups/flat');
    trackPageView('/groups/flat', '/join/secret-token');
    expect(JSON.stringify(calls())).not.toContain('secret-token');
    expect(calls().map((call) => call[1])).toEqual(['init', 'hit', 'reachGoal']);
    expect(calls()[2]).toEqual([104000000, 'reachGoal', 'group_joined']);
  });

  it('при отказе ничего не отправляется', () => {
    configureMetrika('104000000');
    setAnalyticsConsent('denied');
    trackGoal('expense_added');
    trackPageView('/groups/1', '/');
    expect(window.ym).toBeUndefined();
  });

  it('безопасные адреса — без токена, кода OAuth и query', () => {
    expect(isSafeUrl('/groups/1/history')).toBe(true);
    expect(isSafeUrl('/join/abc')).toBe(false);
    expect(isSafeUrl('/auth/callback')).toBe(false);
    expect(isSafeUrl('/login?next=%2Fjoin%2Fabc')).toBe(false);
  });
});
