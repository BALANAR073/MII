import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONSENT_STORAGE_KEY, configureMetrika, getAnalyticsConsent, resetMetrika } from '../../lib/metrika';
import { renderWithProviders } from '../../test/renderApp';
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner';

describe('баннер согласия на Метрику (ДЗ6, 152-ФЗ)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  });

  afterEach(() => {
    resetMetrika();
    delete window.ym;
    document.head.querySelectorAll('script[src*="mc.yandex.ru"]').forEach((node) => node.remove());
  });

  it('без счётчика не показывается', () => {
    renderWithProviders(<AnalyticsConsentBanner />);
    expect(screen.queryByRole('region', { name: 'Согласие на сбор статистики' })).not.toBeInTheDocument();
  });

  it('спрашивает один раз: «Разрешить» запускает счётчик и прячет баннер', async () => {
    configureMetrika('104000000');
    const { user } = renderWithProviders(<AnalyticsConsentBanner />);
    expect(screen.getByRole('region', { name: 'Согласие на сбор статистики' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подробнее' })).toHaveAttribute('href', '/privacy');

    await user.click(screen.getByRole('button', { name: 'Разрешить' }));
    expect(getAnalyticsConsent()).toBe('granted');
    expect(document.querySelector('script[src*="mc.yandex.ru"]')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Согласие на сбор статистики' })).not.toBeInTheDocument();
  });

  it('«Отказаться» прячет баннер без загрузки счётчика', async () => {
    configureMetrika('104000000');
    const { user } = renderWithProviders(<AnalyticsConsentBanner />);
    await user.click(screen.getByRole('button', { name: 'Отказаться' }));
    expect(getAnalyticsConsent()).toBe('denied');
    expect(document.querySelector('script[src*="mc.yandex.ru"]')).toBeNull();
  });
});
