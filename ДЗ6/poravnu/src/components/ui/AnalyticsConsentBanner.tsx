import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { getAnalyticsConsent, isMetrikaConfigured, setAnalyticsConsent, subscribeAnalyticsConsent } from '../../lib/metrika';
import { Button } from './Button';

const BANNER_TEXT =
  'Можно мы будем собирать обезличенную статистику посещений через Яндекс.Метрику? Суммы, имена и ссылки-приглашения в неё не попадают.';

/**
 * Запрос согласия на Яндекс.Метрику (ДЗ6, находка 14 AI-аудита: cookies без согласия, 152-ФЗ).
 * Показывается, только если счётчик задан и пользователь ещё не ответил. Без согласия счётчик не загружается.
 */
export function AnalyticsConsentBanner() {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => null);
  if (!isMetrikaConfigured() || consent !== null) {
    return null;
  }
  return (
    <section
      aria-label="Согласие на сбор статистики"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 py-3 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-xl sm:border"
    >
      <p className="text-sm text-slate-700">
        {BANNER_TEXT}{' '}
        <Link to="/privacy" className="font-semibold text-emerald-800 underline">
          Подробнее
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" className="flex-1" onClick={() => setAnalyticsConsent('granted')}>
          Разрешить
        </Button>
        <Button type="button" variant="secondary" className="flex-1" onClick={() => setAnalyticsConsent('denied')}>
          Отказаться
        </Button>
      </div>
    </section>
  );
}
