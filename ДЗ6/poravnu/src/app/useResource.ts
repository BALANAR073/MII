import { useCallback, useEffect, useRef, useState } from 'react';

export type ResourceState<T> = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: T };

interface ResourceResult<T> {
  state: ResourceState<T>;
  /** Фоновое обновление не удалось, а на экране остались прежние данные. */
  refreshFailed: boolean;
  /** Повторная загрузка: со скелетоном после ошибки, «тихая» — если данные уже есть. */
  reload: () => void;
}

/**
 * Загружает данные и хранит состояние loading / error / success (NFR-9).
 * Обновляет данные при возврате фокуса на вкладку — вместо realtime (решение Q8 в ТЗ).
 * Ответ устаревшего запроса отбрасывается, если ключ успел смениться.
 * Ошибка «тихого» обновления не заменяет данные экраном ошибки — только поднимает флаг
 * `refreshFailed` (находка 2 AI-ревью кода: иначе сбой сети при возврате на вкладку
 * размонтировал экран вместе с оптимистичными строками).
 * @param key Ключ ресурса; при его смене данные загружаются заново.
 * @param loader Функция загрузки.
 * @returns Текущее состояние и функция перезагрузки.
 */
export function useResource<T>(key: string, loader: () => Promise<T>): ResourceResult<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const requestRef = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback((silent: boolean) => {
    requestRef.current += 1;
    const requestId = requestRef.current;
    if (!silent) {
      setState({ status: 'loading' });
    }
    loaderRef
      .current()
      .then((data) => {
        if (requestId === requestRef.current) {
          hasDataRef.current = true;
          setRefreshFailed(false);
          setState({ status: 'success', data });
        }
      })
      .catch((error: unknown) => {
        if (requestId !== requestRef.current) {
          return;
        }
        if (silent) {
          setRefreshFailed(true);
          return;
        }
        hasDataRef.current = false;
        setState({ status: 'error', error });
      });
  }, []);

  useEffect(() => {
    hasDataRef.current = false;
    load(false);
  }, [key, load]);

  useEffect(() => {
    const handleFocus = () => {
      if (hasDataRef.current) {
        load(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [load]);

  const reload = useCallback(() => load(hasDataRef.current), [load]);
  return { state, refreshFailed, reload };
}
