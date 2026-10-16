/**
 * Ставит имя в дательный падеж для фразы «Ане должны …» (FR-4.2).
 * Простое правило для русских имён: -а/-я → -е (Аня → Ане, Гоша → Гоше),
 * -ия → -ии (Мария → Марии), -й → -ю (Андрей → Андрею), -ь → -ю (Игорь → Игорю),
 * согласная → +у (Иван → Ивану). Имя на другую букву возвращается как есть.
 * @param name Имя в именительном падеже.
 * @returns Имя в дательном падеже.
 */
export function toDative(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('ия')) {
    return `${name.slice(0, -1)}и`;
  }
  if (lower.endsWith('а') || lower.endsWith('я')) {
    return `${name.slice(0, -1)}е`;
  }
  if (lower.endsWith('й') || lower.endsWith('ь')) {
    return `${name.slice(0, -1)}ю`;
  }
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(lower)) {
    return `${name}у`;
  }
  return name;
}

/**
 * Ставит имя в родительный падеж для фразы «у Вики долг …» (FR-4.2).
 * Фраза с родительным падежом не зависит от пола участника, которого в данных нет.
 * Правило: -а → -ы, но после г, к, х, ж, ш, щ, ч → -и (Вика → Вики, Гоша → Гоши, Дима → Димы);
 * -ия → -ии, -я → -и (Аня → Ани), -й/-ь → -я (Андрей → Андрея), согласная → +а (Иван → Ивана).
 * @param name Имя в именительном падеже.
 * @returns Имя в родительном падеже.
 */
export function toGenitive(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('я')) {
    return `${name.slice(0, -1)}и`;
  }
  if (lower.endsWith('а')) {
    return /[гкхжшщч]а$/.test(lower) ? `${name.slice(0, -1)}и` : `${name.slice(0, -1)}ы`;
  }
  if (lower.endsWith('й') || lower.endsWith('ь')) {
    return `${name.slice(0, -1)}я`;
  }
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(lower)) {
    return `${name}а`;
  }
  return name;
}

/**
 * Выбирает форму слова для числа: 1 участник, 2 участника, 5 участников.
 * @param count Целое число.
 * @param forms Формы для 1, 2–4 и 5+.
 * @returns Нужная форма без числа.
 */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }
  return forms[2];
}

const COLLECTIVE = ['одного', 'двоих', 'троих', 'четверых', 'пятерых', 'шестерых', 'семерых', 'восьмерых', 'девятерых', 'десятерых'] as const;

/**
 * Подпись деления расхода: «на троих», «на четверых», «на 12 человек».
 * @param count Число участников деления (≥ 1).
 * @returns Подпись с предлогом «на».
 */
export function splitCountText(count: number): string {
  const word = COLLECTIVE[count - 1];
  return word === undefined ? `на ${count} ${plural(count, ['человека', 'человек', 'человек'])}` : `на ${word}`;
}
