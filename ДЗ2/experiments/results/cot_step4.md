# CoT, шаг 4: тесты и самопроверка

- Дата запуска: 2026-10-15 23:47
- Claude Code: 2.1.301 (Claude Code)
- Рабочая папка: experiments\cot
- Файл правил CLAUDE.md в папке: ДА
- Время ответа: 192 с

## Промпт

```text
Шаг 4 из 4 — тесты и самопроверка.
1) Напиши тесты Vitest для функций из шага 3: минимум по одному тесту на каждый граничный случай из шага 1.
2) Проведи самопроверку: пройди по списку решений и граничных случаев из шага 1 и для каждого укажи, где и как он обработан в реализации.
3) Если нашёл расхождение или ошибку — объясни её и выведи исправленный код.

Не создавай и не изменяй файлы — выведи код в ответе.
```

## Сырой ответ агента
# Шаг 4. Тесты и самопроверка

## 1. Тесты граничных случаев

В шаге 3 тесты были разложены по функциям, и часть граничных случаев из шага 1 ими не покрывалась. Ниже — отдельный файл, где каждый `describe`/`it` помечен номером случая (1–24). Почти все проверки идут через фасад `settleGroup`, как будет в реальном UI, а инварианты деления проверяются напрямую через `splitByWeights`.

```ts
// src/features/balances/balances.edgeCases.test.ts
import { describe, expect, it } from 'vitest';
import { splitByWeights } from '../../lib/splitByWeights';
import { MOCK_LEDGER, MOCK_MEMBERS } from '../../mocks/groupMocks';
import type { Expense, ExpenseSplit, GroupLedger, Member, MemberId, Transfer } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { settleGroup } from './settleGroup';
import type { MemberBalance, SuggestedTransfer, ValidationErrorCode } from './types';
import { MAX_AMOUNT_KOP, MAX_SHARE_WEIGHT, validateLedger } from './validateLedger';

interface SettledGroup {
  balances: MemberBalance[];
  transfers: SuggestedTransfer[];
}

const CREATED_AT = '2026-10-01T00:00:00.000Z';
// Аня, Борис, Вика — без вышедшего Димы.
const TRIO: readonly Member[] = MOCK_MEMBERS.slice(0, 3);
const WEIGHT_SETS: readonly number[][] = [[1, 1, 1], [2, 1, 1], [7, 3], [MAX_SHARE_WEIGHT, 1, 1]];

describe('Группа и данные', () => {
  it('1. пустая группа даёт пустые балансы и переводы', () => {
    expect(settleGroup(makeLedger([], [], []))).toEqual({ ok: true, balances: [], transfers: [] });
  });

  it('2. группа без расходов — все в расчёте', () => {
    expect(settleGroup(makeLedger())).toEqual({
      ok: true,
      balances: [
        { memberId: 'anna', balanceKop: 0 },
        { memberId: 'boris', balanceKop: 0 },
        { memberId: 'vika', balanceKop: 0 },
      ],
      transfers: [],
    });
  });

  it('3. у единственного участника баланс всегда 0', () => {
    const ledger = makeLedger(
      [makeExpense({ amountKop: 500, split: { kind: 'equal', memberIds: ['anna'] } })],
      [],
      TRIO.slice(0, 1),
    );
    expect(settleGroup(ledger)).toEqual({ ok: true, balances: [{ memberId: 'anna', balanceKop: 0 }], transfers: [] });
  });

  it('4. после выполненных переводов все в расчёте', () => {
    const ledger = makeLedger(
      [makeExpense()],
      [makeTransfer({ id: 't1', fromId: 'boris' }), makeTransfer({ id: 't2', fromId: 'vika' })],
    );
    expect(balancesOf(ledger)).toEqual({ anna: 0, boris: 0, vika: 0 });
    expect(settleOk(ledger).transfers).toEqual([]);
  });
});

describe('Расход', () => {
  it.each([0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_AMOUNT_KOP + 1])(
    '5. отклоняет сумму расхода %s',
    (amountKop) => {
      expect(errorCodes(makeLedger([makeExpense({ amountKop })]))).toEqual(['INVALID_AMOUNT']);
    },
  );

  it('5. принимает границы диапазона суммы', () => {
    expect(errorCodes(makeLedger([makeExpense({ amountKop: 1 })]))).toEqual([]);
    expect(errorCodes(makeLedger([makeExpense({ amountKop: MAX_AMOUNT_KOP })]))).toEqual([]);
  });

  it('6. отклоняет пустое деление в обоих режимах', () => {
    expect(errorCodes(makeLedger([makeExpense({ split: { kind: 'equal', memberIds: [] } })]))).toEqual(['EMPTY_SPLIT']);
    expect(errorCodes(makeLedger([makeExpense({ split: { kind: 'shares', shares: [] } })]))).toEqual(['EMPTY_SPLIT']);
  });

  it('7. отклоняет повтор участника в делении', () => {
    const split: ExpenseSplit = {
      kind: 'shares',
      shares: [
        { memberId: 'anna', weight: 1 },
        { memberId: 'anna', weight: 2 },
      ],
    };
    expect(errorCodes(makeLedger([makeExpense({ split })]))).toEqual(['DUPLICATE_SPLIT_MEMBER']);
  });

  it('8. отклоняет неизвестного плательщика и участника деления без исключения', () => {
    const unknownPayer = makeLedger([makeExpense({ payerId: 'ghost' })]);
    const unknownInSplit = makeLedger([makeExpense({ split: { kind: 'equal', memberIds: ['anna', 'ghost'] } })]);
    expect(errorCodes(unknownPayer)).toEqual(['UNKNOWN_MEMBER']);
    expect(errorCodes(unknownInSplit)).toEqual(['UNKNOWN_MEMBER']);
    expect(settleGroup(unknownInSplit).ok).toBe(false);
  });

  it.each([0, -1, 1.5, MAX_SHARE_WEIGHT + 1])('9. отклоняет вес %s', (weight) => {
    const split: ExpenseSplit = {
      kind: 'shares',
      shares: [
        { memberId: 'anna', weight },
        { memberId: 'boris', weight: 1 },
      ],
    };
    expect(errorCodes(makeLedger([makeExpense({ split })]))).toEqual(['INVALID_WEIGHT']);
  });

  it('9. принимает максимальный вес', () => {
    const split: ExpenseSplit = { kind: 'shares', shares: [{ memberId: 'anna', weight: MAX_SHARE_WEIGHT }] };
    expect(errorCodes(makeLedger([makeExpense({ split })]))).toEqual([]);
  });

  it('10. плательщик может не входить в деление', () => {
    const ledger = makeLedger([
      makeExpense({ amountKop: 200, split: { kind: 'equal', memberIds: ['boris', 'vika'] } }),
    ]);
    expect(balancesOf(ledger)).toEqual({ anna: 200, boris: -100, vika: -100 });
  });

  it('11. личная трата плательщика не влияет на балансы', () => {
    const ledger = makeLedger([makeExpense({ amountKop: 500, split: { kind: 'equal', memberIds: ['anna'] } })]);
    expect(balancesOf(ledger)).toEqual({ anna: 0, boris: 0, vika: 0 });
    expect(settleOk(ledger).transfers).toEqual([]);
  });

  it('12. 1 копейка на троих достаётся первому по порядку группы', () => {
    const ledger = makeLedger([makeExpense({ payerId: 'boris', amountKop: 1 })]);
    expect(balancesOf(ledger)).toEqual({ anna: -1, boris: 1, vika: 0 });
    expect(settleOk(ledger).transfers).toEqual([{ fromId: 'anna', toId: 'boris', amountKop: 1 }]);
  });

  it('13. при делении без остатка никто не получает лишнюю копейку', () => {
    expect(balancesOf(makeLedger([makeExpense()]))).toEqual({ anna: 200, boris: -100, vika: -100 });
    expect(splitByWeights(400, [2, 1, 1])).toEqual([200, 100, 100]);
  });

  it('14. максимальная сумма с максимальным весом считается без потери точности', () => {
    const split: ExpenseSplit = {
      kind: 'shares',
      shares: [
        { memberId: 'anna', weight: MAX_SHARE_WEIGHT },
        { memberId: 'boris', weight: 1 },
        { memberId: 'vika', weight: 1 },
      ],
    };
    const { balances } = settleOk(makeLedger([makeExpense({ payerId: 'vika', amountKop: MAX_AMOUNT_KOP, split })]));
    expect(balances.every((balance) => Number.isSafeInteger(balance.balanceKop))).toBe(true);
    expect(sumOf(balances)).toBe(0);
  });
});

describe('Перевод', () => {
  it('15. отклоняет перевод самому себе', () => {
    expect(errorCodes(makeLedger([], [makeTransfer({ fromId: 'anna', toId: 'anna' })]))).toEqual(['SELF_TRANSFER']);
  });

  it.each([0, -5, 0.5])('16. отклоняет сумму перевода %s', (amountKop) => {
    expect(errorCodes(makeLedger([], [makeTransfer({ amountKop })]))).toEqual(['INVALID_AMOUNT']);
  });

  it('17. отклоняет неизвестного отправителя и получателя', () => {
    expect(errorCodes(makeLedger([], [makeTransfer({ fromId: 'ghost' })]))).toEqual(['UNKNOWN_MEMBER']);
    expect(errorCodes(makeLedger([], [makeTransfer({ toId: 'ghost' })]))).toEqual(['UNKNOWN_MEMBER']);
  });

  it('18. переплата меняет знак баланса и порождает обратный перевод', () => {
    const ledger = makeLedger([makeExpense()], [makeTransfer({ fromId: 'boris', amountKop: 250 })]);
    expect(balancesOf(ledger)).toEqual({ anna: -50, boris: 150, vika: -100 });
    expect(settleOk(ledger).transfers).toEqual([
      { fromId: 'vika', toId: 'boris', amountKop: 100 },
      { fromId: 'anna', toId: 'boris', amountKop: 50 },
    ]);
  });
});

describe('Вышедший участник', () => {
  const ledgerWithDima = makeLedger(
    [
      makeExpense({
        payerId: 'dima',
        split: { kind: 'equal', memberIds: ['anna', 'dima'] },
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    ],
    [],
    MOCK_MEMBERS,
  );

  it('19. старые расходы с вышедшим участником проходят валидацию', () => {
    expect(validateLedger(ledgerWithDima)).toEqual([]);
  });

  it('20. ненулевой баланс вышедшего попадает в переводы', () => {
    expect(balancesOf(ledgerWithDima)).toEqual({ anna: -150, boris: 0, vika: 0, dima: 150 });
    expect(settleOk(ledgerWithDima).transfers).toEqual([{ fromId: 'anna', toId: 'dima', amountKop: 150 }]);
  });
});

describe('Инварианты', () => {
  it('21. сумма долей всегда равна сумме расхода', () => {
    for (const weights of WEIGHT_SETS) {
      for (let amountKop = 0; amountKop <= 300; amountKop += 1) {
        const parts = splitByWeights(amountKop, weights);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(amountKop);
      }
    }
  });

  it('22–23. сумма балансов равна 0, переводы обнуляют все балансы, их не больше n − 1', () => {
    for (let amountKop = 1; amountKop <= 100; amountKop += 1) {
      const ledger = makeLedger(
        [
          makeExpense({ id: 'e1', amountKop }),
          makeExpense({
            id: 'e2',
            payerId: 'boris',
            amountKop: amountKop * 2 + 1,
            split: {
              kind: 'shares',
              shares: [
                { memberId: 'anna', weight: 3 },
                { memberId: 'vika', weight: 2 },
              ],
            },
          }),
        ],
        [makeTransfer({ fromId: 'vika', toId: 'boris', amountKop })],
      );
      const { balances, transfers } = settleOk(ledger);
      const nonZeroCount = balances.filter((balance) => balance.balanceKop !== 0).length;

      expect(sumOf(balances)).toBe(0);
      expect(applyTransfers(balances, transfers).every((rest) => rest === 0)).toBe(true);
      expect(transfers.length).toBeLessThanOrEqual(Math.max(nonZeroCount - 1, 0));
    }
  });

  it('24. порядок расходов, переводов и участников в форме не влияет на результат', () => {
    const permuted: GroupLedger = {
      ...MOCK_LEDGER,
      expenses: [...MOCK_LEDGER.expenses].reverse().map((expense) => ({ ...expense, split: reverseSplit(expense.split) })),
      transfers: [...MOCK_LEDGER.transfers].reverse(),
    };
    expect(settleGroup(permuted)).toEqual(settleGroup(MOCK_LEDGER));
  });
});

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    title: 'Расход',
    payerId: 'anna',
    amountKop: 300,
    split: { kind: 'equal', memberIds: ['anna', 'boris', 'vika'] },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return { id: 't', fromId: 'boris', toId: 'anna', amountKop: 100, createdAt: CREATED_AT, ...overrides };
}

function makeLedger(
  expenses: Expense[] = [],
  transfers: Transfer[] = [],
  members: readonly Member[] = TRIO,
): GroupLedger {
  return { members, expenses, transfers };
}

function settleOk(ledger: GroupLedger): SettledGroup {
  const result = settleGroup(ledger);
  if (!result.ok) {
    throw new Error(`Неожиданные ошибки валидации: ${result.errors.map((error) => error.code).join(', ')}`);
  }
  return result;
}

function balancesOf(ledger: GroupLedger): Record<MemberId, Kopecks> {
  return Object.fromEntries(
    settleOk(ledger).balances.map((balance): [MemberId, Kopecks] => [balance.memberId, balance.balanceKop]),
  );
}

function errorCodes(ledger: GroupLedger): ValidationErrorCode[] {
  return validateLedger(ledger).map((error) => error.code);
}

function sumOf(balances: readonly MemberBalance[]): Kopecks {
  return balances.reduce((sum, balance) => sum + balance.balanceKop, 0);
}

function applyTransfers(balances: readonly MemberBalance[], transfers: readonly SuggestedTransfer[]): Kopecks[] {
  const restByMember = new Map<MemberId, Kopecks>(balances.map((balance) => [balance.memberId, balance.balanceKop]));
  for (const transfer of transfers) {
    restByMember.set(transfer.fromId, (restByMember.get(transfer.fromId) ?? 0) + transfer.amountKop);
    restByMember.set(transfer.toId, (restByMember.get(transfer.toId) ?? 0) - transfer.amountKop);
  }
  return [...restByMember.values()];
}

function reverseSplit(split: ExpenseSplit): ExpenseSplit {
  return split.kind === 'equal'
    ? { kind: 'equal', memberIds: [...split.memberIds].reverse() }
    : { kind: 'shares', shares: [...split.shares].reverse() };
}
```

Как получены ожидаемые значения в нетривиальных случаях:
- **Случай 18.** Аня: +300 − 100 − 250 = −50. Борис: −100 + 250 = +150. Вика: −100. Сумм, совпадающих точно, нет, поэтому сначала платит самый крупный должник — Вика, затем Аня.
- **Случай 20.** Дима: +300 − 150 = +150. Аня: −150.

## 2. Самопроверка

### Решения из шага 1

| № | Решение | Где обработано | Статус |
|---|---|---|---|
| 1 | Только целые копейки, без float | `Kopecks` в `types/money.ts`. `formatRub` делит без float: `(abs − rem) / 100`. Проверки `Number.isSafeInteger` в `splitByWeights`, `validateLedger`, `suggestTransfers` | ✅ |
| 2 | Типы `Member`/`Expense`/`Transfer`, порядок `members` значим | `types/group.ts`. Порядок используется в `getExpenseShares` (через `flatMap` по `members`) и в `suggestTransfers` (через `filter` с сохранением порядка) | ✅ |
| 3 | Деление поровну = доли с весом 1 | `toWeightedShares` в `getExpenseShares.ts` | ✅ |
| 4 | Метод наибольших остатков, при равенстве — порядок группы | `splitByWeights`: сортировка `remainder desc, index asc`. Порядок группы обеспечивает `getExpenseShares`. Тесты: `getExpenseShares.test`, случаи 12 и 24 | ✅ |
| 5 | Плательщик один | `Expense.payerId: MemberId` | ✅ |
| 6 | Знак баланса и формула | `calculateBalances`, `addToBalance`. Случаи 10 и 18 | ✅ |
| 7 | Переплата допустима | Валидация её не запрещает. Случай 18 | ✅ |
| 8 | Жадный алгоритм, сначала точные пары, не больше n−1 переводов | `suggestTransfers`. Тест «сначала закрывает пары», случай 23 | ✅ |
| 9 | Вышедший участвует в расчёте; выход только при нулевом балансе | Участие в расчёте — случаи 19 и 20. **Проверки нулевого баланса для выхода нет нигде** | ❌ → исправление 1 |
| 10 | Лимиты сумм и весов | Константы и `isValidAmount`/`isValidWeight` в `validateLedger.ts`. Случаи 5 и 9 с границами | ✅ |
| 11 | Результат-объединение вместо исключений | `settleGroup` | ⚠️ см. ограничение ниже |
| 12 | Размещение файлов | По структуре CLAUDE.md | ✅ |
| 13 | Тексты «вам должны» / «вы должны» / «в расчёте» / «вышел из группы» | Есть основа — `getBalanceStatus`. Самих подписей нет: это UI, он не входил в четыре шага | ⏭ перенесено на этап компонентов |

### Граничные случаи из шага 1

| № | Случай | Обработка | Тест |
|---|---|---|---|
| 1 | Пустая группа | Пустые `map`/`filter` во всех функциях | edge 1 |
| 2 | Нет расходов | Начальные балансы 0 в `calculateBalances` | edge 2 |
| 3 | Один участник | Плательщик и единственная доля взаимно гасятся | edge 3 |
| 4 | Все в расчёте | `suggestTransfers` не находит ненулевых балансов | edge 4 |
| 5 | Плохая сумма расхода | `isValidAmount` | edge 5 |
| 6 | Пустое деление | `EMPTY_SPLIT` в `validateExpense` | edge 6 |
| 7 | Дубли в делении | `findDuplicates` → `DUPLICATE_SPLIT_MEMBER` | edge 7 |
| 8 | Неизвестный участник | `UNKNOWN_MEMBER` в валидации, `RangeError` во внутренних функциях | edge 8 |
| 9 | Плохой вес | `isValidWeight` | edge 9 |
| 10 | Плательщик вне деления | Начисления плательщику и долям независимы | edge 10 |
| 11 | Личная трата | То же, разница равна 0 | edge 11 |
| 12 | Сумма меньше числа участников | `splitByWeights`, лишняя копейка по порядку группы | edge 12 |
| 13 | Деление без остатка | `leftoverKop = 0`, `bonusIndices` пуст | edge 13 |
| 14 | Переполнение | Проверка `product` в `splitByWeights` плюс лимиты валидации | edge 14, `splitByWeights.test` |
| 15 | Перевод самому себе | `SELF_TRANSFER` | edge 15 |
| 16 | Плохая сумма перевода | `isValidAmount` | edge 16 |
| 17 | Неизвестный в переводе | `UNKNOWN_MEMBER` | edge 17 |
| 18 | Переплата | Знак баланса меняется, жадный алгоритм выдаёт обратный перевод | edge 18 |
| 19 | Вышедший в старых расходах | Валидация не смотрит на `leftAt` | edge 19 |
| 20 | Вышедший с ненулевым балансом | Входит в `suggestTransfers` | edge 20 |
| 21 | Сумма долей равна сумме расхода | `leftoverKop` раздаётся полностью | edge 21 |
| 22 | Сумма балансов равна 0 | Каждая запись даёт +X и −X | edge 22 |
| 23 | Переводы обнуляют балансы | Цикл работает до опустошения, сумма 0 гарантирована `assertSettleable` | edge 23 |
| 24 | Независимость от порядка | Сумма коммутативна, доли упорядочены по группе | edge 24 |

## 3. Найденные расхождения и исправления

### Исправление 1. Правило «выйти можно только при нулевом балансе» не реализовано

Решение 9 называет это правилом UI. Но по правилу 5 из CLAUDE.md бизнес-логика должна жить в чистых функциях, а не в компонентах. Без отдельной функции проверка оказалась бы прямо в обработчике кнопки. Добавляю её:

```ts
// src/features/balances/canLeaveGroup.ts
import type { MemberId } from '../../types/group';
import type { MemberBalance } from './types';

/**
 * Проверяет, может ли участник выйти из группы: выход разрешён только с нулевым балансом,
 * иначе долг остался бы без ответственного.
 * @param balances Балансы группы из `settleGroup`.
 * @param memberId Участник, который хочет выйти.
 * @returns `true`, если участник в расчёте.
 * @throws {RangeError} Если участника нет в списке балансов.
 */
export function canLeaveGroup(balances: readonly MemberBalance[], memberId: MemberId): boolean {
  const balance = balances.find((item) => item.memberId === memberId);
  if (balance === undefined) {
    throw new RangeError(`Участник «${memberId}» не найден в балансах группы`);
  }
  return balance.balanceKop === 0;
}
```

```ts
// src/features/balances/canLeaveGroup.test.ts
import { describe, expect, it } from 'vitest';
import { MOCK_LEDGER } from '../../mocks/groupMocks';
import { calculateBalances } from './calculateBalances';
import { canLeaveGroup } from './canLeaveGroup';

const BALANCES = calculateBalances(MOCK_LEDGER);

describe('canLeaveGroup', () => {
  it('разрешает выход участнику в расчёте', () => {
    expect(canLeaveGroup(BALANCES, 'dima')).toBe(true);
  });

  it('запрещает выход, пока есть долг или переплата', () => {
    expect(canLeaveGroup(BALANCES, 'boris')).toBe(false);
    expect(canLeaveGroup(BALANCES, 'anna')).toBe(false);
  });

  it('бросает RangeError для неизвестного участника', () => {
    expect(() => canLeaveGroup(BALANCES, 'ghost')).toThrow(RangeError);
  });
});
```

### Исправление 2. Хрупкий вывод типа в `suggestTransfers.test.ts`

В тесте «обнуляет все балансы» было `new Map(balances.map((b) => [b.memberId, b.balanceKop]))` без параметров типа. Литерал `[a, b]` внутри `map` TypeScript может вывести как массив `(string | number)[]`, а не как кортеж. Тогда `tsc` не примет такой аргумент для `Map`. Для кода с `strict` полагаться на это нельзя. Исправленный тест (остальные тесты файла не меняются):

```ts
// src/features/balances/suggestTransfers.test.ts (исправленный фрагмент)
import type { MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';

  it('обнуляет все балансы после выполнения переводов', () => {
    const balances = calculateBalances(MOCK_LEDGER);
    const restByMember = new Map<MemberId, Kopecks>(
      balances.map((balance) => [balance.memberId, balance.balanceKop]),
    );
    for (const transfer of suggestTransfers(balances)) {
      restByMember.set(transfer.fromId, (restByMember.get(transfer.fromId) ?? 0) + transfer.amountKop);
      restByMember.set(transfer.toId, (restByMember.get(transfer.toId) ?? 0) - transfer.amountKop);
    }
    expect([...restByMember.values()].every((rest) => rest === 0)).toBe(true);
  });
```

В новом файле `balances.edgeCases.test.ts` это учтено сразу: явные `Map<MemberId, Kopecks>` и кортеж `(): [MemberId, Kopecks]` в `Object.fromEntries`.

### Известное ограничение, сознательно не исправленное

`settleGroup` обещает не бросать исключений на пользовательских данных. Валидация ограничивает каждую запись по отдельности, но не общий оборот группы. Если накопленный баланс превысит `Number.MAX_SAFE_INTEGER` (≈ 9·10¹⁵ коп), `suggestTransfers` бросит `RangeError`. Для этого нужно примерно 900 000 расходов по 100 млн ₽ в одной группе, на практике это недостижимо. Закрыть дыру можно только новым кодом ошибки уровня группы, а для этого придётся расширять `ValidationError.entity`. Предлагаю вернуться к этому, когда подключим Supabase и появятся лимиты на сервере.

## Файлы (ничего не создавалось, только вывод в ответе)

**Новые:**
- `src/features/balances/balances.edgeCases.test.ts` — по тесту на каждый граничный случай 1–24
- `src/features/balances/canLeaveGroup.ts` + `canLeaveGroup.test.ts`

**Изменён:**
- `src/features/balances/suggestTransfers.test.ts` — явные типы `Map`

Тесты я не запускал: в репозитории нет `src/` и проекта Vite, ожидаемые значения посчитаны вручную. Когда файлы окажутся на диске, проверить так:

```
npx tsc --noEmit
npm test
```
