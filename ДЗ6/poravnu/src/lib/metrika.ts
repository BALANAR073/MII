/**
 * Яндекс.Метрика (ДЗ6): счётчик подключается только в выложенной версии и только если задан
 * VITE_YM_COUNTER_ID. Скрипт грузится с mc.yandex.ru (разрешён в CSP), без inline-кода.
 * Вебвизор выключен: на экранах суммы долгов и имена участников — их запись не нужна для аналитики.
 * В цели не передаются суммы, имена и id: только факт действия.
 */

/** Цели воронки: регистрация → группа → приглашение → расход → перевод. */
export type MetrikaGoal = 'sign_up' | 'login' | 'oauth_start' | 'group_created' | 'group_joined' | 'expense_added' | 'transfer_marked';

type YmFunction = ((counterId: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFunction;
  }
}

const TAG_URL = 'https://mc.yandex.ru/metrika/tag.js';
let counterId: number | null = null;

/**
 * Подключает счётчик.
 * @param id Номер счётчика (строка из переменной окружения).
 * @param target Окно браузера.
 * @returns `true`, если счётчик подключён.
 */
export function initMetrika(id: string | undefined, target: Window = window): boolean {
  const parsed = Number(id);
  if (id === undefined || !Number.isInteger(parsed) || parsed <= 0 || counterId !== null) {
    return false;
  }
  counterId = parsed;
  // Очередь вызовов до загрузки tag.js — так же, как в официальном коде счётчика.
  const queue: YmFunction = (...args: [number, string, ...unknown[]]) => {
    (queue.a ??= []).push(args);
  };
  queue.l = Date.now();
  target.ym = target.ym ?? queue;
  const script = target.document.createElement('script');
  script.async = true;
  script.src = TAG_URL;
  target.document.head.appendChild(script);
  target.ym(parsed, 'init', {
    defer: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
  return true;
}

/**
 * Просмотр страницы в одностраничном приложении: адрес меняется без перезагрузки.
 * @param url Новый адрес. Query отрезается, токен приглашения заменяется на `:token` —
 *   иначе ссылка-приглашение (по сути пароль от группы) оказалась бы в отчётах Метрики.
 * @param referrer Предыдущий адрес.
 */
export function trackPageView(url: string, referrer?: string): void {
  if (counterId !== null && window.ym !== undefined) {
    window.ym(counterId, 'hit', anonymizePath(url), { referer: referrer === undefined ? undefined : anonymizePath(referrer) });
  }
}

/**
 * Достижение цели.
 * @param goal Имя цели (такое же надо завести в интерфейсе Метрики: «Цели» → «JavaScript-событие»).
 */
export function trackGoal(goal: MetrikaGoal): void {
  if (counterId !== null && window.ym !== undefined) {
    window.ym(counterId, 'reachGoal', goal);
  }
}

/**
 * Адрес для аналитики без секретов.
 * @param url Путь с query.
 */
export function anonymizePath(url: string): string {
  return (url.split('?')[0] ?? '/').replace(/^\/join\/[^/]+/, '/join/:token');
}

/** Сбрасывает состояние (для тестов). */
export function resetMetrika(): void {
  counterId = null;
}
