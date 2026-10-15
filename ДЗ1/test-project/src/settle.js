/**
 * Модуль расчёта общих расходов для приложения «ПоРовну».
 *
 * Все суммы — целые числа в КОПЕЙКАХ. Дробные рубли в float дают ошибки
 * округления (0.1 + 0.2 !== 0.3), из-за которых после всех переводов
 * кто-то остаётся должен «пылинку». В копейках арифметика точная.
 */

/**
 * @typedef {Object} Expense
 * @property {string} payer          - кто заплатил
 * @property {number} amount         - сумма в копейках (целое > 0)
 * @property {string[]} participants - на кого делится расход (поровну)
 */

/**
 * @typedef {Object} Transfer
 * @property {string} from   - кто переводит
 * @property {string} to     - кому
 * @property {number} amount - сумма в копейках
 */

/**
 * Балансы участников: > 0 — участнику должны, < 0 — участник должен.
 * Остаток от деления (например, 100 ₽ на троих) раздаётся по копейке
 * первым участникам в порядке списка, поэтому сумма балансов всегда равна 0.
 *
 * @param {Expense[]} expenses
 * @returns {Record<string, number>}
 */
export function calculateBalances(expenses) {
  if (!Array.isArray(expenses)) {
    throw new TypeError('expenses должен быть массивом');
  }
  const balances = {};
  const add = (name, delta) => { balances[name] = (balances[name] ?? 0) + delta; };

  expenses.forEach((e, idx) => {
    validateExpense(e, idx);
    const n = e.participants.length;
    const base = Math.floor(e.amount / n);
    const remainder = e.amount % n;

    add(e.payer, e.amount);
    e.participants.forEach((p, k) => add(p, -(base + (k < remainder ? 1 : 0))));
  });
  return balances;
}

/**
 * Список переводов, после которых все балансы равны нулю.
 * Жадный алгоритм: самый крупный должник платит самому крупному кредитору.
 * Даёт не больше (N − 1) переводов для N участников с ненулевым балансом.
 *
 * @param {Record<string, number>} balances - балансы в копейках
 * @returns {Transfer[]}
 */
export function settleDebts(balances) {
  const entries = Object.entries(balances);
  for (const [name, b] of entries) {
    if (!Number.isInteger(b)) throw new TypeError(`Баланс ${name} должен быть целым числом копеек`);
  }
  const total = entries.reduce((s, [, b]) => s + b, 0);
  if (total !== 0) throw new RangeError(`Сумма балансов должна быть 0, получено ${total}`);

  // Сортировка по убыванию суммы + по имени — результат детерминирован
  const byAmount = (a, b) => b.amount - a.amount || a.name.localeCompare(b.name);
  const debtors = entries.filter(([, b]) => b < 0).map(([name, b]) => ({ name, amount: -b })).sort(byAmount);
  const creditors = entries.filter(([, b]) => b > 0).map(([name, b]) => ({ name, amount: b })).sort(byAmount);

  const transfers = [];
  while (debtors.length && creditors.length) {
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.amount, c.amount);
    transfers.push({ from: d.name, to: c.name, amount });
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0) debtors.shift();
    if (c.amount === 0) creditors.shift();
    debtors.sort(byAmount);
    creditors.sort(byAmount);
  }
  return transfers;
}

/**
 * Форматирует сумму в копейках для интерфейса: 150000 → «1 500,00 ₽».
 * @param {number} kop
 * @returns {string}
 */
export function formatRub(kop) {
  if (!Number.isInteger(kop)) throw new TypeError('Сумма должна быть целым числом копеек');
  const sign = kop < 0 ? '-' : '';
  const abs = Math.abs(kop);
  const rub = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${rub},${cents} ₽`;
}

function validateExpense(e, idx) {
  if (!e || typeof e.payer !== 'string' || e.payer === '') {
    throw new TypeError(`Расход #${idx + 1}: не указан плательщик`);
  }
  if (!Number.isInteger(e.amount)) {
    throw new TypeError(`Расход #${idx + 1}: сумма должна быть целым числом копеек`);
  }
  if (e.amount <= 0) {
    throw new RangeError(`Расход #${idx + 1}: сумма должна быть больше нуля`);
  }
  if (!Array.isArray(e.participants) || e.participants.length === 0) {
    throw new RangeError(`Расход #${idx + 1}: нужен хотя бы один участник`);
  }
  if (new Set(e.participants).size !== e.participants.length) {
    throw new RangeError(`Расход #${idx + 1}: участники повторяются`);
  }
}
