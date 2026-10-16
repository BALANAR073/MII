import { cx } from '../../lib/cx';

interface AvatarProps {
  name: string;
  /** Позиция участника в группе — от неё зависит цвет, чтобы он не менялся между экранами. */
  index: number;
  size?: 'sm' | 'md';
  /** Подсветка текущего пользователя. */
  highlighted?: boolean;
  /** Аватар в стопке: белое кольцо отделяет его от соседа. */
  stacked?: boolean;
}

// Пары фона и текста с контрастом не ниже 4,5:1 (NFR-2).
const PALETTE = [
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
] as const;

/** Кружок с первой буквой имени. Имя целиком дублируется для скринридера через aria-hidden + текст рядом. */
export function Avatar({ name, index, size = 'md', highlighted = false, stacked = false }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm',
        PALETTE[index % PALETTE.length],
        // Без ring-offset: белый отступ кольца перекрывал соседний аватар в стопке (баг 2).
        highlighted ? 'relative z-10 ring-2 ring-emerald-700' : stacked && 'ring-2 ring-white',
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
