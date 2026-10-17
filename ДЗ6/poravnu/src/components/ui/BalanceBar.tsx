import { cx } from '../../lib/cx';
import type { Kopecks } from '../../types/money';

interface BalanceBarProps {
  balanceKop: Kopecks;
  /** Наибольший по модулю баланс в группе — он займёт всю половину полосы. */
  maxAbsKop: Kopecks;
}

// Классы ширины перечислены целиком: Tailwind находит только классы, явно записанные в коде,
// а inline-стили запрещены правилом 17. Шаг — 10 % половины полосы.
const WIDTH_CLASSES = [
  'w-0',
  'w-[10%]',
  'w-[20%]',
  'w-[30%]',
  'w-[40%]',
  'w-1/2',
  'w-[60%]',
  'w-[70%]',
  'w-[80%]',
  'w-[90%]',
  'w-full',
] as const;

/**
 * Полоска баланса из концепции 3: вправо зелёная — участнику должны, влево красная — он должен.
 * Чисто декоративная: сумма и смысл переданы текстом рядом (NFR-2).
 */
export function BalanceBar({ balanceKop, maxAbsKop }: BalanceBarProps) {
  const step = maxAbsKop === 0 ? 0 : Math.max(balanceKop === 0 ? 0 : 1, Math.round((Math.abs(balanceKop) * 10) / maxAbsKop));
  const widthClass = WIDTH_CLASSES[step] ?? 'w-full';
  return (
    <div aria-hidden="true" className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="flex w-1/2 justify-end">
        {balanceKop < 0 && <div className={cx('h-full rounded-l-full bg-rose-500', widthClass)} />}
      </div>
      <div className="flex w-1/2 justify-start">
        {balanceKop > 0 && <div className={cx('h-full rounded-r-full bg-emerald-600', widthClass)} />}
      </div>
    </div>
  );
}
