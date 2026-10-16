import { configureMockApi, resetMockDb } from './mockApi';
import { createSeed } from './seed';

/** Задержка в режиме `?mock=slow` — больше порога ERR-11 (10 с). */
const SLOW_LATENCY_MS = 12_000;
// Ошибка действует первые 1,5 с: все запросы при открытии падают, а «Повторить» уже срабатывает.
// Раньше падал только первый запрос, и его «съедал» невидимый запрос боковой панели (баг 7).
const FAIL_WINDOW_MS = 1500;

/**
 * Демо-режимы для проверки состояний без бэкенда (см. README):
 * `?mock=error` — запросы при открытии падают с сетевой ошибкой (ERR-3, «Повторить»);
 * `?mock=server` — запросы при открытии падают с ошибкой 500 (ERR-5);
 * `?mock=slow` — каждый ответ идёт 12 с (скелетоны, ERR-11);
 * `?mock=empty` — у пользователя нет групп (ERR-2);
 * `?mock=reset` — вернуть исходные демо-данные.
 * @param search Строка запроса из адреса.
 */
export function applyDemoMode(search: string): void {
  const mode = new URLSearchParams(search).get('mock');
  switch (mode) {
    case 'error':
      configureMockApi({ failUntilKind: 'network', failUntil: Date.now() + FAIL_WINDOW_MS });
      break;
    case 'server':
      configureMockApi({ failUntilKind: 'server', failUntil: Date.now() + FAIL_WINDOW_MS });
      break;
    case 'slow':
      configureMockApi({ latencyMs: SLOW_LATENCY_MS });
      break;
    case 'empty':
      resetMockDb({ ...createSeed(), groups: [], expenses: [], transfers: [] });
      break;
    case 'reset':
      resetMockDb();
      break;
    default:
      break;
  }
}
