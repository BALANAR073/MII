/**
 * Модуль расчёта серий (streak) для трекера привычек.
 *
 * Даты передаются строками в формате YYYY-MM-DD (календарный день пользователя).
 * Вся арифметика дат ведётся в UTC, поэтому результат не зависит
 * от часового пояса сервера и переходов на летнее/зимнее время.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Превращает строку YYYY-MM-DD в номер дня от эпохи Unix.
 * @param {string} date
 * @returns {number}
 */
function toDayNumber(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    throw new TypeError(`Некорректная дата: ${date}. Ожидается формат YYYY-MM-DD`);
  }
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // Отсекаем несуществующие даты вроде 2026-02-30
  if (new Date(ms).getUTCDate() !== d) {
    throw new RangeError(`Несуществующая дата: ${date}`);
  }
  return Math.round(ms / DAY_MS);
}

/**
 * Уникальные номера дней, отсортированные по возрастанию.
 * @param {string[]} dates
 * @returns {number[]}
 */
function normalize(dates) {
  if (!Array.isArray(dates)) {
    throw new TypeError('dates должен быть массивом строк');
  }
  return [...new Set(dates.map(toDayNumber))].sort((a, b) => a - b);
}

/**
 * Текущая серия: сколько дней подряд привычка выполнялась, заканчивая сегодня.
 * Если сегодня ещё не отмечено, но вчера отмечено — серия не прерывается
 * (у пользователя есть время до конца дня).
 *
 * @param {string[]} dates - дни выполнения привычки (YYYY-MM-DD)
 * @param {string} today - текущий день пользователя (YYYY-MM-DD)
 * @returns {number}
 */
export function currentStreak(dates, today) {
  const days = new Set(normalize(dates));
  const todayNum = toDayNumber(today);

  let cursor = days.has(todayNum) ? todayNum : todayNum - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}

/**
 * Самая длинная серия за всю историю.
 * @param {string[]} dates
 * @returns {number}
 */
export function longestStreak(dates) {
  const days = normalize(dates);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] - days[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}
