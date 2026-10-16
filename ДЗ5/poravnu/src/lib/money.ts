import type { Kopecks } from '../types/money';

/** Максимальная сумма расхода — 1 000 000 ₽ (FR-3.3). */
export const MAX_AMOUNT_KOP: Kopecks = 100_000_000;

const KOP_PER_RUB = 100;
// Неразрывный пробел: сумма не должна переноситься посреди числа или отрываться от «₽» (NFR-3).
const NBSP = '\u00a0';
// Типографский минус U+2212: обычный дефис в «-940,75» читается хуже и может перенестись отдельно.
const MINUS = '\u2212';

// Два допустимых вида записи: «12 000,50» с группами по три цифры или «12000.5» без пробелов.
const GROUPED_AMOUNT = /^\d{1,3}( \d{3})+([.,]\d{1,2})?$/;
const PLAIN_AMOUNT = /^\d+([.,]\d{1,2})?$/;

export type ParseAmountResult =
  | { ok: true; amountKop: Kopecks }
  | { ok: false; error: 'invalid' | 'too-large' };

/**
 * Форматирует сумму в копейках: 150000 → «1 500,00 ₽», −94075 → «−940,75 ₽».
 * Разделитель разрядов и пробел перед «₽» — неразрывные (NFR-3).
 * @param kop Целая сумма в копейках.
 * @returns Строка для интерфейса.
 * @throws {RangeError} Если `kop` не безопасное целое число.
 */
export function formatRub(kop: Kopecks): string {
  if (!Number.isSafeInteger(kop)) {
    throw new RangeError(`Сумма должна быть целым числом копеек, получено: ${kop}`);
  }
  const absKop = Math.abs(kop);
  const kopPart = absKop % KOP_PER_RUB;
  // Вычитаем остаток до деления, чтобы частное было точным целым (NFR-5).
  const rubPart = (absKop - kopPart) / KOP_PER_RUB;
  const sign = kop < 0 ? MINUS : '';
  return `${sign}${groupThousands(rubPart)},${String(kopPart).padStart(2, '0')}${NBSP}₽`;
}

/**
 * Как `formatRub`, но с явным «+» у положительной суммы — для полосок балансов (NFR-3).
 * @param kop Целая сумма в копейках.
 * @returns «+8 135,80 ₽», «−940,75 ₽» или «0,00 ₽».
 */
export function formatSignedRub(kop: Kopecks): string {
  return kop > 0 ? `+${formatRub(kop)}` : formatRub(kop);
}

/**
 * Разбирает введённую пользователем сумму в рублях без float-арифметики (FR-3.3).
 * Принимает «12000», «12 000», «12000,5», «12000.50», «007»; пробелы по краям обрезаются.
 * @param input Строка из поля ввода.
 * @returns Сумма в копейках или код ошибки: `invalid` — неверный формат или ноль,
 *   `too-large` — больше 1 000 000 ₽.
 * @example parseRubToKop('12 000,5') // { ok: true, amountKop: 1200050 }
 */
export function parseRubToKop(input: string): ParseAmountResult {
  // Обычный и неразрывный пробел считаем одним и тем же: второй появляется при копировании сумм.
  const value = input.trim().replace(/\u00a0/g, ' ');
  if (!GROUPED_AMOUNT.test(value) && !PLAIN_AMOUNT.test(value)) {
    return { ok: false, error: 'invalid' };
  }
  const [rubText = '', kopText = ''] = value.replace(/ /g, '').split(/[.,]/);
  // Длинная строка цифр может не поместиться в безопасное целое — это заведомо «слишком много».
  if (rubText.replace(/^0+/, '').length > 9) {
    return { ok: false, error: 'too-large' };
  }
  // parseInt по уже проверенной строке цифр — целочисленный разбор, без float (NFR-5).
  const amountKop = Number.parseInt(rubText, 10) * KOP_PER_RUB + Number.parseInt(kopText.padEnd(2, '0'), 10);
  if (amountKop === 0) {
    return { ok: false, error: 'invalid' };
  }
  if (amountKop > MAX_AMOUNT_KOP) {
    return { ok: false, error: 'too-large' };
  }
  return { ok: true, amountKop };
}

/**
 * Переводит копейки в строку для поля ввода: 1200050 → «12000,50», 120000 → «1200».
 * @param kop Целая положительная сумма.
 * @returns Строка без разделителей разрядов и без «₽».
 */
export function kopToInput(kop: Kopecks): string {
  const kopPart = kop % KOP_PER_RUB;
  const rubPart = (kop - kopPart) / KOP_PER_RUB;
  return kopPart === 0 ? String(rubPart) : `${rubPart},${String(kopPart).padStart(2, '0')}`;
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}
