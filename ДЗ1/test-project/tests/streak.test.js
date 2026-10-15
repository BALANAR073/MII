import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, longestStreak } from '../src/streak.js';

// --- currentStreak: позитивные сценарии ---

test('серия из трёх дней подряд', () => {
  assert.equal(currentStreak(['2026-10-13', '2026-10-14', '2026-10-15'], '2026-10-15'), 3);
});

test('серия через смену месяца', () => {
  assert.equal(currentStreak(['2026-09-30', '2026-10-01'], '2026-10-01'), 2);
});

test('серия через переход на зимнее время (США, 1 ноября)', () => {
  assert.equal(currentStreak(['2026-10-31', '2026-11-01', '2026-11-02'], '2026-11-02'), 3);
});

test('сегодня ещё не отмечено — серия до вчера сохраняется', () => {
  assert.equal(currentStreak(['2026-10-13', '2026-10-14'], '2026-10-15'), 2);
});

test('пропуск двух дней — серия 0', () => {
  assert.equal(currentStreak(['2026-10-12', '2026-10-13'], '2026-10-15'), 0);
});

test('дубликаты и неотсортированный ввод не ломают расчёт', () => {
  assert.equal(currentStreak(['2026-10-15', '2026-10-14', '2026-10-15', '2026-10-13'], '2026-10-15'), 3);
});

test('пустой список — серия 0', () => {
  assert.equal(currentStreak([], '2026-10-15'), 0);
});

// --- longestStreak ---

test('самая длинная серия среди нескольких', () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-10'];
  assert.equal(longestStreak(dates), 3);
});

test('longestStreak для пустого списка — 0', () => {
  assert.equal(longestStreak([]), 0);
});

// --- обработка ошибок ---

test('неверный формат даты — TypeError', () => {
  assert.throws(() => currentStreak(['15.10.2026'], '2026-10-15'), TypeError);
});

test('несуществующая дата — RangeError', () => {
  assert.throws(() => longestStreak(['2026-02-30']), RangeError);
});

test('dates не массив — TypeError', () => {
  assert.throws(() => currentStreak('2026-10-15', '2026-10-15'), TypeError);
});
