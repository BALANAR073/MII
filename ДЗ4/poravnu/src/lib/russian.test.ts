import { describe, expect, it } from 'vitest';
import { plural, splitCountText, toDative, toGenitive } from './russian';

describe('toDative', () => {
  it.each([
    ['Аня', 'Ане'],
    ['Боря', 'Боре'],
    ['Вика', 'Вике'],
    ['Гоша', 'Гоше'],
    ['Мария', 'Марии'],
    ['Андрей', 'Андрею'],
    ['Игорь', 'Игорю'],
    ['Иван', 'Ивану'],
  ])('%s → %s', (name, expected) => {
    expect(toDative(name)).toBe(expected);
  });

  it('оставляет как есть имя на гласную, кроме -а/-я', () => {
    expect(toDative('Лео')).toBe('Лео');
  });
});

describe('toGenitive', () => {
  it.each([
    ['Аня', 'Ани'],
    ['Боря', 'Бори'],
    ['Вика', 'Вики'],
    ['Гоша', 'Гоши'],
    ['Дима', 'Димы'],
    ['Мария', 'Марии'],
    ['Андрей', 'Андрея'],
    ['Иван', 'Ивана'],
  ])('%s → %s', (name, expected) => {
    expect(toGenitive(name)).toBe(expected);
  });
});

describe('plural', () => {
  const forms = ['участник', 'участника', 'участников'] as const;

  it.each([
    [1, 'участник'],
    [3, 'участника'],
    [5, 'участников'],
    [11, 'участников'],
    [21, 'участник'],
    [22, 'участника'],
    [0, 'участников'],
  ])('%i %s', (count, expected) => {
    expect(plural(count, forms)).toBe(expected);
  });
});

describe('splitCountText', () => {
  it.each([
    [1, 'на одного'],
    [3, 'на троих'],
    [4, 'на четверых'],
    [10, 'на десятерых'],
    [11, 'на 11 человек'],
    [21, 'на 21 человека'],
  ])('%i → %s', (count, expected) => {
    expect(splitCountText(count)).toBe(expected);
  });
});
