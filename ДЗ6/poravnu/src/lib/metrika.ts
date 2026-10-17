/**
 * Яндекс.Метрика (ДЗ6). Счётчик подключается только в выложенной версии, если задан VITE_YM_COUNTER_ID,
 * и только после согласия пользователя (152-ФЗ: cookies и обработка данных — находка 14 AI-аудита на ПК).
 * Скрипт грузится с mc.yandex.ru (разрешён в CSP), без inline-кода. Вебвизор выключен.
 *
 * Главное правило — Метрика получает только адреса, которые мы передали сами (находка 1 AI-аудита на ПК):
 * - автосбор, который читает `location.href` (карта кликов, внешние ссылки, точный отказ), выключен;
 * - на страницах с секретом в адресе (`/join/<токен>` — по сути пароль от группы, `/auth/callback?code=…`,
 *   любой query вроде `?next=/join/…`) счётчик не запускается, а цели откладываются до первой безопасной страницы:
 *   `reachGoal` отправляет текущий адрес страницы, и токен ушёл бы в Яндекс;
 * - просмотры отправляются вручную с обезличенным адресом, включая первую страницу визита.
 * В цели не передаются суммы, имена и id: только факт действия.
 */

/** Цели воронки: регистрация → группа → приглашение → расход → перевод. */
export type MetrikaGoal = 'sign_up' | 'login' | 'oauth_start' | 'group_created' | 'group_joined' | 'expense_added' | 'transfer_marked';

/** Решение пользователя о счётчике: `null` — ещё не спрашивали. */
export type AnalyticsConsent = 'granted' | 'denied' | null;

type YmFunction = ((counterId: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFunction;
  }
}

const TAG_URL = 'https://mc.yandex.ru/metrika/tag.js';
/** Ключ браузерного хранилища с решением о согласии. */
export const CONSENT_STORAGE_KEY = 'poravnu.analytics-consent';
/** Сколько целей держать, пока пользователь на странице с секретом в адресе. */
const MAX_PENDING_GOALS = 10;

let configuredId: number | null = null;
/** Решение на эту сессию — на случай, если localStorage недоступен. */
let sessionConsent: AnalyticsConsent = null;
let counterId: number | null = null;
const pendingGoals: MetrikaGoal[] = [];
const consentListeners = new Set<() => void>();

/**
 * Запоминает номер счётчика и запускает его, если пользователь уже согласился и адрес безопасен.
 * @param id Номер счётчика (строка из переменной окружения).
 * @param target Окно браузера.
 * @returns `true`, если номер корректный.
 */
export function configureMetrika(id: string | undefined, target: Window = window): boolean {
  const parsed = Number(id);
  if (id === undefined || id === '' || !Number.isInteger(parsed) || parsed <= 0) {
    return false;
  }
  configuredId = parsed;
  startIfAllowed(target);
  return true;
}

/** Задан ли счётчик (нужен ли баннер согласия). */
export function isMetrikaConfigured(): boolean {
  return configuredId !== null;
}

/** Решение пользователя: из этой сессии или сохранённое в браузере. */
export function getAnalyticsConsent(): AnalyticsConsent {
  if (sessionConsent !== null) {
    return sessionConsent;
  }
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Сохраняет решение пользователя; при согласии сразу запускает счётчик.
 * @param consent Решение.
 * @param target Окно браузера.
 */
export function setAnalyticsConsent(consent: 'granted' | 'denied', target: Window = window): void {
  try {
    target.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  } catch {
    // Хранилище недоступно (приватный режим) — решение действует до перезагрузки страницы.
  }
  sessionConsent = consent;
  if (consent === 'granted') {
    startIfAllowed(target);
  } else {
    pendingGoals.length = 0;
  }
  consentListeners.forEach((listener) => listener());
}

/**
 * Подписка на изменение решения (для баннера).
 * @param listener Колбэк.
 * @returns Функция отписки.
 */
export function subscribeAnalyticsConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => consentListeners.delete(listener);
}

/**
 * Просмотр страницы в одностраничном приложении: адрес меняется без перезагрузки.
 * @param url Новый адрес (путь и query).
 * @param referrer Предыдущий адрес.
 */
export function trackPageView(url: string, referrer?: string): void {
  if (counterId === null) {
    startIfAllowed(window);
    return;
  }
  sendHit(url, referrer);
  if (isSafeUrl(url)) {
    flushGoals();
  }
}

/**
 * Достижение цели. На странице с секретом в адресе цель ждёт первой безопасной страницы.
 * @param goal Имя цели (такое же заведено в Метрике: «Цели» → «Целевое событие · ex JS-событие»).
 */
export function trackGoal(goal: MetrikaGoal): void {
  // До согласия цели не копятся: иначе после «Разрешить» ушли бы действия, совершённые до него.
  if (configuredId === null || getAnalyticsConsent() !== 'granted') {
    return;
  }
  if (counterId !== null && isSafeUrl(currentUrl(window))) {
    window.ym?.(counterId, 'reachGoal', goal);
    return;
  }
  if (pendingGoals.length < MAX_PENDING_GOALS) {
    pendingGoals.push(goal);
  }
}

/**
 * Можно ли показывать адрес Метрике как есть: без токена приглашения, кода OAuth и query.
 * @param url Путь с query.
 */
export function isSafeUrl(url: string): boolean {
  const [path = '/', query] = url.split('?');
  return query === undefined && !path.startsWith('/join/') && !path.startsWith('/auth/callback');
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
  configuredId = null;
  counterId = null;
  sessionConsent = null;
  pendingGoals.length = 0;
  consentListeners.clear();
}

function currentUrl(target: Window): string {
  return target.location.pathname + target.location.search;
}

/** Запуск счётчика: есть номер, есть согласие, а текущий адрес не содержит секретов. */
function startIfAllowed(target: Window): void {
  if (configuredId === null || counterId !== null || getAnalyticsConsent() !== 'granted') {
    return;
  }
  const url = currentUrl(target);
  if (!isSafeUrl(url)) {
    return;
  }
  counterId = configuredId;
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
  target.ym(counterId, 'init', {
    defer: true,
    clickmap: false,
    trackLinks: false,
    accurateTrackBounce: false,
    webvisor: false,
  });
  // Первая страница визита: при defer Метрика сама её не считает.
  sendHit(url, undefined, target);
  flushGoals(target);
}

function sendHit(url: string, referrer: string | undefined, target: Window = window): void {
  if (counterId === null) {
    return;
  }
  target.ym?.(counterId, 'hit', anonymizePath(url), { referer: referrer === undefined ? undefined : anonymizePath(referrer) });
}

function flushGoals(target: Window = window): void {
  if (counterId === null) {
    return;
  }
  for (const goal of pendingGoals.splice(0)) {
    target.ym?.(counterId, 'reachGoal', goal);
  }
}
