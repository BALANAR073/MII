import { describe, expect, it } from 'vitest';
import { categoryOf, expenseCategory, guessCategory } from './categories';

describe('категории расходов', () => {
  it('подбирает категорию по началу слова в названии', () => {
    expect(guessCategory('Такси до вокзала')).toBe('transport');
    expect(guessCategory('Хостел')).toBe('housing');
    expect(guessCategory('Продукты в Пятёрочке')).toBe('groceries');
    expect(guessCategory('Кофе')).toBe('food');
    expect(guessCategory('Билеты на поезд')).toBe('travel');
    expect(guessCategory('Интернет за октябрь')).toBe('bills');
  });

  it('не срабатывает на середину слова и пустое название', () => {
    expect(guessCategory('Сувенир')).toBeNull();
    expect(guessCategory('Подставка')).toBeNull(); // «доставк» внутри слова не считается
    expect(guessCategory('')).toBeNull();
  });

  it('неизвестная и пустая категория — «Другое»', () => {
    expect(categoryOf('food').label).toBe('Еда');
    expect(categoryOf(null).id).toBe('other');
    expect(categoryOf('nope').id).toBe('other');
  });
});

describe('expenseCategory', () => {
  it('сохранённая категория важнее названия', () => {
    expect(expenseCategory({ category: 'fun', title: 'Такси' }).id).toBe('fun');
  });

  it('старый расход без категории — по названию, иначе «Другое»', () => {
    expect(expenseCategory({ category: null, title: 'Пиво' }).id).toBe('food');
    expect(expenseCategory({ title: 'Что-то странное' }).id).toBe('other');
  });
});
