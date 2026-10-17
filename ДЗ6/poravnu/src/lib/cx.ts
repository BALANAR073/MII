/**
 * Склеивает классы Tailwind, пропуская пустые значения (замена библиотеке classnames, правило 14).
 * @param classes Строки классов или false/null/undefined.
 * @returns Классы через пробел.
 * @example cx('px-2', isActive && 'bg-emerald-50') // 'px-2 bg-emerald-50'
 */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
