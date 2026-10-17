/** Категория расхода (ДЗ6): id хранится в колонке `expenses.category` (до 30 символов). */
export interface ExpenseCategory {
  id: string;
  label: string;
  emoji: string;
  /** Класс фона полоски в статистике. */
  barClass: string;
}

/** Категория по умолчанию — для расходов без категории (в том числе созданных до ДЗ6). */
export const OTHER_CATEGORY: ExpenseCategory = { id: 'other', label: 'Другое', emoji: '💸', barClass: 'bg-slate-400' };

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  { id: 'food', label: 'Еда', emoji: '🍔', barClass: 'bg-amber-500' },
  { id: 'groceries', label: 'Продукты', emoji: '🛒', barClass: 'bg-lime-600' },
  { id: 'transport', label: 'Транспорт', emoji: '🚕', barClass: 'bg-sky-600' },
  { id: 'housing', label: 'Жильё', emoji: '🏠', barClass: 'bg-violet-600' },
  { id: 'fun', label: 'Развлечения', emoji: '🎉', barClass: 'bg-pink-600' },
  { id: 'travel', label: 'Билеты', emoji: '✈️', barClass: 'bg-cyan-700' },
  { id: 'shopping', label: 'Покупки', emoji: '🛍', barClass: 'bg-orange-600' },
  { id: 'bills', label: 'Счета', emoji: '🧾', barClass: 'bg-teal-700' },
  OTHER_CATEGORY,
];

/** Ключевые слова для автоподбора: первая совпавшая категория побеждает. Сравнение — по началу слова. */
const KEYWORDS: readonly (readonly [string, readonly string[]])[] = [
  ['groceries', ['продукт', 'магазин', 'пятёрочк', 'пятерочк', 'перекрёст', 'перекрест', 'ашан', 'вкусвилл', 'магнит', 'лента']],
  [
    'food',
    [
      'кафе',
      'ресторан',
      'обед',
      'ужин',
      'завтрак',
      'пицц',
      'кофе',
      'бар',
      'еда',
      'пиво',
      'вино',
      'напит',
      'чай',
      'шаурм',
      'суши',
      'бургер',
      'доставк',
    ],
  ],
  ['transport', ['такси', 'бензин', 'топлив', 'метро', 'автобус', 'электричк', 'каршеринг', 'парковк', 'яндекс go', 'uber']],
  ['housing', ['хостел', 'отель', 'гостиниц', 'аренд', 'квартир', 'жиль', 'airbnb', 'суточн', 'дом']],
  ['travel', ['билет', 'самолёт', 'самолет', 'поезд', 'авиа', 'ржд']],
  ['fun', ['кино', 'концерт', 'музей', 'экскурс', 'боулинг', 'квест', 'караоке', 'театр', 'клуб', 'подар']],
  ['bills', ['интернет', 'коммунал', 'свет', 'электричеств', 'вода', 'газ', 'связь', 'подписк', 'жкх']],
  ['shopping', ['покупк', 'одежд', 'техник', 'посуд', 'хозтовар']],
];

/**
 * Категория по id; неизвестная или пустая — «Другое».
 * @param id Значение `expense.category`.
 */
export function categoryOf(id: string | null | undefined): ExpenseCategory {
  return EXPENSE_CATEGORIES.find((category) => category.id === id) ?? OTHER_CATEGORY;
}

/**
 * Подбирает категорию по названию расхода: «Такси до вокзала» → транспорт.
 * @param title Название расхода.
 * @returns id категории или `null`, если ничего не подошло.
 */
export function guessCategory(title: string): string | null {
  const words = title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/);
  const text = ` ${words.join(' ')}`;
  for (const [id, keywords] of KEYWORDS) {
    if (keywords.some((keyword) => text.includes(` ${keyword.replace(/ё/g, 'е')}`))) {
      return id;
    }
  }
  return null;
}

/**
 * Категория для показа: сохранённая, а у расходов без неё (созданных до ДЗ6) — подобранная по названию.
 * @param expense Расход (нужны категория и название).
 */
export function expenseCategory(expense: { category?: string | null; title: string }): ExpenseCategory {
  return categoryOf(expense.category ?? guessCategory(expense.title));
}
