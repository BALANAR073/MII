import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/ui/Toast';

/** Через сколько ответа считаем, что сервер «отвечает дольше обычного» (ERR-11). */
export const SLOW_RESPONSE_MS = 10_000;

interface MutationResult {
  pending: boolean;
  /**
   * Выполняет запрос. Пока он идёт, повторный вызов игнорируется — защита от двойного нажатия.
   * @returns Результат запроса или `undefined`, если запрос уже выполнялся.
   */
  run: <T>(request: () => Promise<T>) => Promise<T | undefined>;
}

/**
 * Обёртка для запросов на сохранение: флаг ожидания, блокировка повторного нажатия
 * и уведомление о медленном ответе через 10 секунд (ERR-11).
 * @returns Флаг ожидания и функция запуска.
 */
export function useMutation(): MutationResult {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const { showToast } = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(request: () => Promise<T>): Promise<T | undefined> => {
      if (pendingRef.current) {
        return undefined;
      }
      pendingRef.current = true;
      setPending(true);
      const slowTimer = window.setTimeout(() => {
        showToast({ message: 'Сервер отвечает дольше обычного. Подождите или попробуйте позже', durationMs: 6000 });
      }, SLOW_RESPONSE_MS);
      try {
        return await request();
      } finally {
        window.clearTimeout(slowTimer);
        pendingRef.current = false;
        if (mountedRef.current) {
          setPending(false);
        }
      }
    },
    [showToast],
  );

  return { pending, run };
}
