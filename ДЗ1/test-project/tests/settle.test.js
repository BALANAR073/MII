import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBalances, settleDebts, formatRub } from '../src/settle.js';

// Все суммы — в копейках: 1000 ₽ = 100000

/** Применяет переводы к балансам — после этого все должны быть по нулям */
function applyTransfers(balances, transfers) {
  const left = { ...balances };
  for (const t of transfers) { left[t.from] += t.amount; left[t.to] -= t.amount; }
  return left;
}

// --- calculateBalances ---

test('один заплатил за двоих — второй должен половину', () => {
  const b = calculateBalances([{ payer: 'Аня', amount: 100000, participants: ['Аня', 'Боря'] }]);
  assert.deepEqual(b, { 'Аня': 50000, 'Боря': -50000 });
});

test('заплатили поровну друг за друга — балансы нулевые', () => {
  const b = calculateBalances([
    { payer: 'Аня', amount: 60000, participants: ['Аня', 'Боря'] },
    { payer: 'Боря', amount: 60000, participants: ['Аня', 'Боря'] },
  ]);
  assert.deepEqual(b, { 'Аня': 0, 'Боря': 0 });
});

test('100 ₽ на троих: лишняя копейка достаётся первому, сумма балансов = 0', () => {
  const b = calculateBalances([{ payer: 'Аня', amount: 10000, participants: ['Аня', 'Боря', 'Вика'] }]);
  assert.deepEqual(b, { 'Аня': 6666, 'Боря': -3333, 'Вика': -3333 });
  assert.equal(Object.values(b).reduce((s, x) => s + x, 0), 0);
});

test('копейки: 10 коп. + 20 коп. на двоих — ровно 15 коп. долга', () => {
  const b = calculateBalances([
    { payer: 'Аня', amount: 10, participants: ['Аня', 'Боря'] },
    { payer: 'Аня', amount: 20, participants: ['Аня', 'Боря'] },
  ]);
  assert.deepEqual(b, { 'Аня': 15, 'Боря': -15 });
});

test('плательщик может не участвовать в расходе (купил подарок другим)', () => {
  const b = calculateBalances([{ payer: 'Аня', amount: 3000, participants: ['Боря', 'Вика'] }]);
  assert.deepEqual(b, { 'Аня': 3000, 'Боря': -1500, 'Вика': -1500 });
});

// --- settleDebts ---

test('переводы: двое должны одному', () => {
  const t = settleDebts({ 'Аня': 60000, 'Боря': -30000, 'Вика': -30000 });
  assert.deepEqual(t, [
    { from: 'Боря', to: 'Аня', amount: 30000 },
    { from: 'Вика', to: 'Аня', amount: 30000 },
  ]);
});

test('после выполнения всех переводов балансы обнуляются', () => {
  const b = calculateBalances([
    { payer: 'Аня', amount: 90000, participants: ['Аня', 'Боря', 'Вика'] },
    { payer: 'Боря', amount: 10000, participants: ['Аня', 'Боря', 'Вика'] },
  ]);
  const left = applyTransfers(b, settleDebts(b));
  assert.ok(Object.values(left).every((v) => v === 0), JSON.stringify(left));
});

test('поездка на 5 человек: не больше N−1 переводов и все в расчёте', () => {
  const people = ['Аня', 'Боря', 'Вика', 'Гоша', 'Дима'];
  const b = calculateBalances([
    { payer: 'Аня', amount: 1234567, participants: people },             // жильё
    { payer: 'Боря', amount: 345611, participants: people },              // продукты
    { payer: 'Вика', amount: 99999, participants: ['Вика', 'Гоша', 'Дима'] }, // такси
    { payer: 'Гоша', amount: 12001, participants: ['Аня', 'Гоша'] },      // кофе
  ]);
  const t = settleDebts(b);
  assert.ok(t.length <= people.length - 1, `переводов: ${t.length}`);
  assert.ok(Object.values(applyTransfers(b, t)).every((v) => v === 0));
});

test('никто никому не должен — переводов нет', () => {
  assert.deepEqual(settleDebts({ 'Аня': 0, 'Боря': 0 }), []);
});

// --- formatRub ---

test('formatRub: копейки и разряды', () => {
  assert.equal(formatRub(150000), '1 500,00 ₽');
  assert.equal(formatRub(5), '0,05 ₽');
  assert.equal(formatRub(-123456789), '-1 234 567,89 ₽');
});

// --- ошибки ---

test('сумма в рублях с копейками (float) — TypeError', () => {
  assert.throws(() => calculateBalances([{ payer: 'Аня', amount: 10.5, participants: ['Аня'] }]), TypeError);
});

test('нулевая или отрицательная сумма — RangeError', () => {
  assert.throws(() => calculateBalances([{ payer: 'Аня', amount: 0, participants: ['Аня'] }]), RangeError);
});

test('пустой список участников — RangeError', () => {
  assert.throws(() => calculateBalances([{ payer: 'Аня', amount: 100, participants: [] }]), RangeError);
});

test('балансы не сходятся в ноль — RangeError', () => {
  assert.throws(() => settleDebts({ 'Аня': 100, 'Боря': -50 }), RangeError);
});
