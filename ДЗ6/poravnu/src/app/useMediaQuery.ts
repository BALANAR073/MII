import { useEffect, useState } from 'react';

/**
 * Отслеживает CSS media query, например `(min-width: 1024px)`.
 * Нужен там, где скрыть элемент классом `hidden` мало: скрытый компонент всё равно
 * монтируется и делает сетевые запросы (баг 7 в отчёте ДЗ4).
 * @param query Строка media query.
 * @returns `true`, если условие сейчас выполняется.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}
