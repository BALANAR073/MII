/**
 * Общие наборы классов Tailwind. Вынесены при рефакторинге (шаг 7 ДЗ4):
 * одинаковая строка фокуса повторялась в 10 файлах и легко расходилась при правках.
 */

/** Видимое кольцо фокуса для клавиатуры (NFR-2). */
export const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';

/** Кольцо фокуса внутри строки списка — без выноса за границы строки. */
export const FOCUS_RING_INSET = 'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700';

/** Ссылка, оформленная как основная кнопка («+ Расход», «Добавить расход»). */
export const PRIMARY_LINK =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800';
