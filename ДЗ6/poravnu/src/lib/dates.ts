const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] as const;

/**
 * Форматирует дату расхода: «2026-10-12» → «12 окт».
 * Разбирает строку сама, без `new Date`, чтобы часовой пояс не сдвигал день.
 * @param isoDate Дата `YYYY-MM-DD` или метка времени ISO.
 * @returns Короткая дата на русском или исходная строка, если формат неизвестен.
 */
export function formatShortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match === null) {
    return isoDate;
  }
  const month = MONTHS_SHORT[Number.parseInt(match[2] ?? '', 10) - 1];
  const day = Number.parseInt(match[3] ?? '', 10);
  return month === undefined ? isoDate : `${day} ${month}`;
}

/**
 * Сегодняшняя дата в формате поля `<input type="date">` по местному времени.
 * @param now Текущий момент (для тестов).
 * @returns Строка `YYYY-MM-DD`.
 */
export function todayIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
