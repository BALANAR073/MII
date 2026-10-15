# CoT, шаг 3: реализация

- Дата запуска: 2026-10-15 23:44
- Claude Code: 2.1.301 (Claude Code)
- Рабочая папка: experiments\cot
- Файл правил CLAUDE.md в папке: ДА
- Время ответа: 244 с

## Промпт

```text
Шаг 3 из 4 — реализация. Реализуй функции из шага 2. Строго следуй решениям из шага 1 и правилам проекта.

Не создавай и не изменяй файлы — выведи код в ответе.
```

## Сырой ответ агента
# Шаг 3. Реализация модуля «Кто кому должен»

Сигнатуры из шага 2 не изменились: `declare` заменён реализацией. По правилу 20 к каждой функции приложен тест. Для тестов и будущего UI добавлены mock-данные. Типы (`src/types/money.ts`, `src/types/group.ts`, `src/features/balances/types.ts`) остались как в шаге 2, поэтому здесь не повторяются.

**Два уточнения:**
- **Пробел в `formatRub`.** Вместо обычного пробела используется неразрывный (`\u00a0`), чтобы сумма не разрывалась при переносе строки. На вид результат тот же — «1 500,00 ₽», но в тестах стоит `\u00a0`.
- **`calculateBalances` не проверяет суммы и веса.** Это делает `validateLedger`. UI получает данные только через `settleGroup`, а там валидация идёт первой.

## Mock-данные

```ts
// src/mocks/groupMocks.ts
import type { GroupLedger, Member } from '../types/group';

export const MOCK_MEMBERS: readonly Member[] = [
  { id: 'anna', name: 'Аня', leftAt: null },
  { id: 'boris', name: 'Борис', leftAt: null },
  { id: 'vika', name: 'Вика', leftAt: null },
  { id: 'dima', name: 'Дима', leftAt: '2026-09-20T12:00:00.000Z' },
];

export const MOCK_LEDGER: GroupLedger = {
  members: MOCK_MEMBERS,
  expenses: [
    {
      id: 'e1',
      title: 'Аренда дома',
      payerId: 'anna',
      amountKop: 900_000,
      split: { kind: 'equal', memberIds: ['anna', 'boris', 'vika'] },
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'e2',
      title: 'Продукты',
      payerId: 'boris',
      amountKop: 10_000,
      split: {
        kind: 'shares',
        shares: [
          { memberId: 'anna', weight: 2 },
          { memberId: 'boris', weight: 1 },
          { memberId: 'vika', weight: 1 },
        ],
      },
      createdAt: '2026-10-02T18:30:00.000Z',
    },
  ],
  transfers: [
    { id: 't1', fromId: 'vika', toId: 'anna', amountKop: 100_000, createdAt: '2026-10-03T09:00:00.000Z' },
  ],
};
```

## src/lib

```ts
// src/lib/money.ts
import type { Kopecks } from '../types/money';

const KOP_PER_RUB = 100;
// Неразрывный пробел: сумма не должна переноситься посреди числа или отрываться от «₽».
const NBSP = '\u00a0';

/**
 * Форматирует сумму в копейках для отображения: 150000 → «1 500,00 ₽».
 * Отрицательные суммы выводятся со знаком минус.
 * @param kop Целая сумма в копейках.
 * @returns Строка в формате ru-RU с символом рубля.
 * @throws {RangeError} Если `kop` не является безопасным целым числом.
 */
export function formatRub(kop: Kopecks): string {
  if (!Number.isSafeInteger(kop)) {
    throw new RangeError(`Сумма должна быть целым числом копеек, получено: ${kop}`);
  }
  const absKop = Math.abs(kop);
  const kopPart = absKop % KOP_PER_RUB;
  // Вычитаем остаток до деления, чтобы частное было точным целым даже на больших суммах.
  const rubPart = (absKop - kopPart) / KOP_PER_RUB;
  const sign = kop < 0 ? '-' : '';
  return `${sign}${groupThousands(rubPart)},${String(kopPart).padStart(2, '0')}${NBSP}₽`;
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}
```

```ts
// src/lib/money.test.ts
import { describe, expect, it } from 'vitest';
import { formatRub } from './money';

const NBSP = '\u00a0';

describe('formatRub', () => {
  it('форматирует рубли и копейки с разделителем тысяч', () => {
    expect(formatRub(150_000)).toBe(`1${NBSP}500,00${NBSP}₽`);
    expect(formatRub(123_456_789)).toBe(`1${NBSP}234${NBSP}567,89${NBSP}₽`);
  });

  it('форматирует ноль и суммы меньше рубля', () => {
    expect(formatRub(0)).toBe(`0,00${NBSP}₽`);
    expect(formatRub(5)).toBe(`0,05${NBSP}₽`);
  });

  it('форматирует отрицательную сумму', () => {
    expect(formatRub(-150)).toBe(`-1,50${NBSP}₽`);
  });

  it('бросает RangeError для дробной суммы', () => {
    expect(() => formatRub(1.5)).toThrow(RangeError);
  });
});
```

```ts
// src/lib/splitByWeights.ts
import type { Kopecks } from '../types/money';

/**
 * Делит сумму пропорционально целым весам методом наибольших остатков.
 * Лишние копейки получают позиции с наибольшим дробным остатком,
 * а при равных остатках — позиции с меньшим индексом.
 * Сумма результата всегда равна `amountKop`.
 * @param amountKop Целая неотрицательная сумма в копейках.
 * @param weights Целые положительные веса; порядок задаёт приоритет при ничьей.
 * @returns Массив долей той же длины и в том же порядке, что `weights`.
 * @throws {RangeError} Если сумма или вес не целые, вес ≤ 0, массив пуст
 *   или `amountKop * weight` выходит за пределы безопасного целого.
 * @example splitByWeights(10000, [1, 1, 1]) // [3334, 3333, 3333]
 * @example splitByWeights(100, [2, 1, 1])   // [50, 25, 25]
 */
export function splitByWeights(amountKop: Kopecks, weights: readonly number[]): Kopecks[] {
  if (!Number.isSafeInteger(amountKop) || amountKop < 0) {
    throw new RangeError(`Сумма должна быть неотрицательным целым числом копеек, получено: ${amountKop}`);
  }
  if (weights.length === 0) {
    throw new RangeError('Нужен хотя бы один вес для деления');
  }
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight <= 0)) {
    throw new RangeError('Веса должны быть целыми положительными числами');
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isSafeInteger(totalWeight)) {
    throw new RangeError('Сумма весов слишком велика');
  }

  const parts = weights.map((weight, index) => {
    const product = amountKop * weight;
    if (!Number.isSafeInteger(product)) {
      throw new RangeError('Произведение суммы и веса выходит за пределы безопасного целого');
    }
    const remainder = product % totalWeight;
    // Вычитаем остаток до деления, чтобы частное было точным целым без float-погрешности.
    return { index, baseKop: (product - remainder) / totalWeight, remainder };
  });

  const leftoverKop = amountKop - parts.reduce((sum, part) => sum + part.baseKop, 0);
  const bonusIndices = new Set(
    [...parts]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, leftoverKop)
      .map((part) => part.index),
  );

  return parts.map((part) => part.baseKop + (bonusIndices.has(part.index) ? 1 : 0));
}
```

```ts
// src/lib/splitByWeights.test.ts
import { describe, expect, it } from 'vitest';
import { splitByWeights } from './splitByWeights';

interface InvalidCase {
  label: string;
  amountKop: number;
  weights: number[];
}

const INVALID_CASES: InvalidCase[] = [
  { label: 'пустой список весов', amountKop: 100, weights: [] },
  { label: 'нулевой вес', amountKop: 100, weights: [1, 0] },
  { label: 'дробный вес', amountKop: 100, weights: [1.5] },
  { label: 'отрицательная сумма', amountKop: -1, weights: [1] },
  { label: 'дробная сумма', amountKop: 1.5, weights: [1] },
  { label: 'переполнение', amountKop: Number.MAX_SAFE_INTEGER, weights: [2] },
];

describe('splitByWeights', () => {
  it('делит поровну и отдаёт лишнюю копейку первому', () => {
    expect(splitByWeights(10_000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it('делит по долям 2:1:1 без остатка', () => {
    expect(splitByWeights(100, [2, 1, 1])).toEqual([50, 25, 25]);
  });

  it('отдаёт остаток по наибольшему дробному остатку, а не по индексу', () => {
    expect(splitByWeights(10, [1, 2])).toEqual([3, 7]);
  });

  it('делит сумму меньше числа участников', () => {
    expect(splitByWeights(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(splitByWeights(0, [1, 1])).toEqual([0, 0]);
  });

  it('сохраняет сумму при любом делении', () => {
    for (let amountKop = 0; amountKop <= 200; amountKop += 1) {
      const parts = splitByWeights(amountKop, [3, 1, 2, 7]);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(amountKop);
    }
  });

  it.each(INVALID_CASES)('бросает RangeError: $label', ({ amountKop, weights }) => {
    expect(() => splitByWeights(amountKop, weights)).toThrow(RangeError);
  });
});
```

## src/features/balances

```ts
// src/features/balances/getExpenseShares.ts
import { splitByWeights } from '../../lib/splitByWeights';
import type { Expense, ExpenseSplit, Member, MemberId, WeightedShare } from '../../types/group';
import type { MemberShare } from './types';

/**
 * Считает, сколько из суммы расхода приходится на каждого участника деления.
 * Участники упорядочиваются по позиции в `members` группы, поэтому
 * распределение остатка не зависит от порядка выбора в форме.
 * @param expense Валидный расход.
 * @param members Участники группы в значимом порядке.
 * @returns Доли участников деления в порядке группы; сумма равна `expense.amountKop`.
 * @throws {RangeError} Если расход ссылается на неизвестного участника, участник повторяется
 *   или сумма и веса нарушают ограничения `splitByWeights`.
 */
export function getExpenseShares(expense: Expense, members: readonly Member[]): MemberShare[] {
  const shares = toWeightedShares(expense.split);
  const weightByMember = new Map<MemberId, number>(shares.map((share) => [share.memberId, share.weight]));
  if (weightByMember.size !== shares.length) {
    throw new RangeError(`В расходе «${expense.id}» участник указан несколько раз`);
  }
  const groupMemberIds = new Set(members.map((member) => member.id));
  const unknownShare = shares.find((share) => !groupMemberIds.has(share.memberId));
  if (unknownShare !== undefined) {
    throw new RangeError(`Участник «${unknownShare.memberId}» не состоит в группе`);
  }

  const ordered = members.flatMap((member) => {
    const weight = weightByMember.get(member.id);
    return weight === undefined ? [] : [{ memberId: member.id, weight }];
  });
  const amounts = splitByWeights(
    expense.amountKop,
    ordered.map((share) => share.weight),
  );

  return ordered.map((share, index) => ({ memberId: share.memberId, amountKop: amounts[index] }));
}

/**
 * Приводит любой способ деления к списку весов: при делении поровну у каждого вес 1.
 * @param split Способ деления расхода.
 * @returns Доли в том порядке, в котором они указаны в расходе.
 */
export function toWeightedShares(split: ExpenseSplit): WeightedShare[] {
  if (split.kind === 'equal') {
    return split.memberIds.map((memberId) => ({ memberId, weight: 1 }));
  }
  return [...split.shares];
}
```

```ts
// src/features/balances/getExpenseShares.test.ts
import { describe, expect, it } from 'vitest';
import { MOCK_MEMBERS } from '../../mocks/groupMocks';
import type { Expense } from '../../types/group';
import { getExpenseShares, toWeightedShares } from './getExpenseShares';

const BASE_EXPENSE: Expense = {
  id: 'e',
  title: 'Такси',
  payerId: 'anna',
  amountKop: 3,
  split: { kind: 'equal', memberIds: ['vika', 'anna'] },
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('getExpenseShares', () => {
  it('упорядочивает по группе — лишняя копейка не зависит от порядка в форме', () => {
    expect(getExpenseShares(BASE_EXPENSE, MOCK_MEMBERS)).toEqual([
      { memberId: 'anna', amountKop: 2 },
      { memberId: 'vika', amountKop: 1 },
    ]);
  });

  it('делит по долям', () => {
    const expense: Expense = {
      ...BASE_EXPENSE,
      amountKop: 10_000,
      split: {
        kind: 'shares',
        shares: [
          { memberId: 'vika', weight: 1 },
          { memberId: 'anna', weight: 2 },
          { memberId: 'boris', weight: 1 },
        ],
      },
    };
    expect(getExpenseShares(expense, MOCK_MEMBERS)).toEqual([
      { memberId: 'anna', amountKop: 5000 },
      { memberId: 'boris', amountKop: 2500 },
      { memberId: 'vika', amountKop: 2500 },
    ]);
  });

  it('бросает RangeError для неизвестного участника', () => {
    const expense: Expense = { ...BASE_EXPENSE, split: { kind: 'equal', memberIds: ['ghost'] } };
    expect(() => getExpenseShares(expense, MOCK_MEMBERS)).toThrow(RangeError);
  });

  it('бросает RangeError для повторяющегося участника', () => {
    const expense: Expense = { ...BASE_EXPENSE, split: { kind: 'equal', memberIds: ['anna', 'anna'] } };
    expect(() => getExpenseShares(expense, MOCK_MEMBERS)).toThrow(RangeError);
  });
});

describe('toWeightedShares', () => {
  it('даёт вес 1 каждому при делении поровну', () => {
    expect(toWeightedShares({ kind: 'equal', memberIds: ['anna', 'boris'] })).toEqual([
      { memberId: 'anna', weight: 1 },
      { memberId: 'boris', weight: 1 },
    ]);
  });

  it('возвращает пустой список для пустого деления', () => {
    expect(toWeightedShares({ kind: 'equal', memberIds: [] })).toEqual([]);
  });
});
```

```ts
// src/features/balances/validateLedger.ts
import { formatRub } from '../../lib/money';
import type { Expense, GroupLedger, MemberId, Transfer } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { toWeightedShares } from './getExpenseShares';
import type { ValidationError, ValidationErrorCode } from './types';

/** Максимальная сумма одного расхода или перевода — 100 млн ₽. */
export const MAX_AMOUNT_KOP: Kopecks = 10_000_000_000;

/** Максимальный вес доли при делении по долям. */
export const MAX_SHARE_WEIGHT = 1000;

const MIN_AMOUNT_KOP: Kopecks = 1;
const MIN_SHARE_WEIGHT = 1;

/**
 * Проверяет данные группы перед расчётом и собирает все ошибки, не останавливаясь на первой.
 * Правила UI (запрет выхода с ненулевым балансом, выбор вышедших в новых записях) здесь не проверяются.
 * @param ledger Участники, расходы и выполненные переводы группы.
 * @returns Пустой массив, если данные корректны, иначе список ошибок.
 */
export function validateLedger(ledger: GroupLedger): ValidationError[] {
  const nameById = new Map<MemberId, string>(ledger.members.map((member) => [member.id, member.name]));
  return [
    ...findDuplicateIds(ledger.members, 'member'),
    ...findDuplicateIds(ledger.expenses, 'expense'),
    ...findDuplicateIds(ledger.transfers, 'transfer'),
    ...ledger.expenses.flatMap((expense) => validateExpense(expense, nameById)),
    ...ledger.transfers.flatMap((transfer) => validateTransfer(transfer, nameById)),
  ];
}

function validateExpense(expense: Expense, nameById: ReadonlyMap<MemberId, string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const report = (code: ValidationErrorCode, message: string): void => {
    errors.push({ code, entity: 'expense', entityId: expense.id, message });
  };

  if (!nameById.has(expense.payerId)) {
    report('UNKNOWN_MEMBER', `Плательщик «${expense.payerId}» не состоит в группе`);
  }
  if (!isValidAmount(expense.amountKop)) {
    report('INVALID_AMOUNT', amountRangeMessage());
  }

  const shares = toWeightedShares(expense.split);
  if (shares.length === 0) {
    report('EMPTY_SPLIT', 'Выберите хотя бы одного участника расхода');
  }
  const splitMemberIds = shares.map((share) => share.memberId);
  for (const memberId of findDuplicates(splitMemberIds)) {
    report('DUPLICATE_SPLIT_MEMBER', `Участник «${nameById.get(memberId) ?? memberId}» указан в расходе несколько раз`);
  }
  for (const memberId of new Set(splitMemberIds)) {
    if (!nameById.has(memberId)) {
      report('UNKNOWN_MEMBER', `Участник «${memberId}» не состоит в группе`);
    }
  }
  for (const share of shares) {
    if (!isValidWeight(share.weight)) {
      report(
        'INVALID_WEIGHT',
        `Доля участника «${nameById.get(share.memberId) ?? share.memberId}» должна быть целым числом от ${MIN_SHARE_WEIGHT} до ${MAX_SHARE_WEIGHT}`,
      );
    }
  }
  return errors;
}

function validateTransfer(transfer: Transfer, nameById: ReadonlyMap<MemberId, string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const report = (code: ValidationErrorCode, message: string): void => {
    errors.push({ code, entity: 'transfer', entityId: transfer.id, message });
  };

  if (!nameById.has(transfer.fromId)) {
    report('UNKNOWN_MEMBER', `Отправитель «${transfer.fromId}» не состоит в группе`);
  }
  if (!nameById.has(transfer.toId)) {
    report('UNKNOWN_MEMBER', `Получатель «${transfer.toId}» не состоит в группе`);
  }
  if (transfer.fromId === transfer.toId) {
    report('SELF_TRANSFER', 'Нельзя перевести деньги самому себе');
  }
  if (!isValidAmount(transfer.amountKop)) {
    report('INVALID_AMOUNT', amountRangeMessage());
  }
  return errors;
}

function findDuplicateIds(
  items: readonly { id: string }[],
  entity: ValidationError['entity'],
): ValidationError[] {
  return findDuplicates(items.map((item) => item.id)).map((id) => ({
    code: 'DUPLICATE_ID',
    entity,
    entityId: id,
    message: `Идентификатор «${id}» встречается несколько раз`,
  }));
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function isValidAmount(amountKop: Kopecks): boolean {
  return Number.isSafeInteger(amountKop) && amountKop >= MIN_AMOUNT_KOP && amountKop <= MAX_AMOUNT_KOP;
}

function isValidWeight(weight: number): boolean {
  return Number.isSafeInteger(weight) && weight >= MIN_SHARE_WEIGHT && weight <= MAX_SHARE_WEIGHT;
}

function amountRangeMessage(): string {
  return `Сумма должна быть от ${formatRub(MIN_AMOUNT_KOP)} до ${formatRub(MAX_AMOUNT_KOP)}`;
}
```

```ts
// src/features/balances/validateLedger.test.ts
import { describe, expect, it } from 'vitest';
import { MOCK_LEDGER, MOCK_MEMBERS } from '../../mocks/groupMocks';
import type { Expense, GroupLedger } from '../../types/group';
import { validateLedger } from './validateLedger';

const BASE_EXPENSE: Expense = {
  id: 'bad',
  title: 'Ошибочный расход',
  payerId: 'anna',
  amountKop: 100,
  split: { kind: 'equal', memberIds: ['anna'] },
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('validateLedger', () => {
  it('возвращает пустой список для корректных данных', () => {
    expect(validateLedger(MOCK_LEDGER)).toEqual([]);
  });

  it('собирает все ошибки расхода сразу', () => {
    const ledger: GroupLedger = {
      members: MOCK_MEMBERS,
      expenses: [
        {
          ...BASE_EXPENSE,
          payerId: 'ghost',
          amountKop: 0,
          split: {
            kind: 'shares',
            shares: [
              { memberId: 'anna', weight: 0 },
              { memberId: 'anna', weight: 1 },
            ],
          },
        },
      ],
      transfers: [],
    };
    const errors = validateLedger(ledger);
    expect(errors.map((error) => error.code)).toEqual([
      'UNKNOWN_MEMBER',
      'INVALID_AMOUNT',
      'DUPLICATE_SPLIT_MEMBER',
      'INVALID_WEIGHT',
    ]);
    expect(errors.map((error) => error.message).join(' ')).toContain('Аня');
  });

  it('находит пустое деление', () => {
    const ledger: GroupLedger = {
      members: MOCK_MEMBERS,
      expenses: [{ ...BASE_EXPENSE, split: { kind: 'equal', memberIds: [] } }],
      transfers: [],
    };
    expect(validateLedger(ledger).map((error) => error.code)).toEqual(['EMPTY_SPLIT']);
  });

  it('находит перевод самому себе с дробной суммой', () => {
    const ledger: GroupLedger = {
      members: MOCK_MEMBERS,
      expenses: [],
      transfers: [{ id: 't', fromId: 'anna', toId: 'anna', amountKop: 1.5, createdAt: '2026-10-01T00:00:00.000Z' }],
    };
    expect(validateLedger(ledger).map((error) => error.code)).toEqual(['SELF_TRANSFER', 'INVALID_AMOUNT']);
  });

  it('находит повторяющиеся идентификаторы', () => {
    const ledger: GroupLedger = { ...MOCK_LEDGER, expenses: [BASE_EXPENSE, BASE_EXPENSE] };
    const errors = validateLedger(ledger);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'DUPLICATE_ID', entity: 'expense', entityId: 'bad' });
  });
});
```

```ts
// src/features/balances/calculateBalances.ts
import type { GroupLedger, MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';
import { getExpenseShares } from './getExpenseShares';
import type { MemberBalance } from './types';

/**
 * Считает баланс каждого участника, включая вышедших:
 * оплачено − своя доля + отправлено переводами − получено переводами.
 * Сумма всех балансов равна 0; порядок расходов и переводов на результат не влияет.
 * @param ledger Валидные данные группы (см. `validateLedger`).
 * @returns Балансы всех участников в порядке `ledger.members`.
 * @throws {RangeError} Если id участников повторяются, запись ссылается на неизвестного
 *   участника или деление расхода невалидно.
 */
export function calculateBalances(ledger: GroupLedger): MemberBalance[] {
  const balanceByMember = new Map<MemberId, Kopecks>(ledger.members.map((member) => [member.id, 0]));
  if (balanceByMember.size !== ledger.members.length) {
    throw new RangeError('Идентификаторы участников должны быть уникальны');
  }

  for (const expense of ledger.expenses) {
    addToBalance(balanceByMember, expense.payerId, expense.amountKop);
    for (const share of getExpenseShares(expense, ledger.members)) {
      addToBalance(balanceByMember, share.memberId, -share.amountKop);
    }
  }
  for (const transfer of ledger.transfers) {
    // Отправитель гасит свой долг, поэтому его баланс растёт, а у получателя уменьшается.
    addToBalance(balanceByMember, transfer.fromId, transfer.amountKop);
    addToBalance(balanceByMember, transfer.toId, -transfer.amountKop);
  }

  return ledger.members.map((member) => ({
    memberId: member.id,
    balanceKop: balanceByMember.get(member.id) ?? 0,
  }));
}

function addToBalance(balances: Map<MemberId, Kopecks>, memberId: MemberId, deltaKop: Kopecks): void {
  const current = balances.get(memberId);
  if (current === undefined) {
    throw new RangeError(`Участник «${memberId}» не состоит в группе`);
  }
  balances.set(memberId, current + deltaKop);
}
```

```ts
// src/features/balances/calculateBalances.test.ts
import { describe, expect, it } from 'vitest';
import { MOCK_LEDGER, MOCK_MEMBERS } from '../../mocks/groupMocks';
import type { GroupLedger } from '../../types/group';
import { calculateBalances } from './calculateBalances';

const EXPECTED_MOCK_BALANCES = [
  { memberId: 'anna', balanceKop: 495_000 },
  { memberId: 'boris', balanceKop: -292_500 },
  { memberId: 'vika', balanceKop: -202_500 },
  { memberId: 'dima', balanceKop: 0 },
];

describe('calculateBalances', () => {
  it('считает балансы с учётом долей и выполненных переводов', () => {
    expect(calculateBalances(MOCK_LEDGER)).toEqual(EXPECTED_MOCK_BALANCES);
  });

  it('даёт нулевую сумму балансов группы', () => {
    const total = calculateBalances(MOCK_LEDGER).reduce((sum, balance) => sum + balance.balanceKop, 0);
    expect(total).toBe(0);
  });

  it('не зависит от порядка расходов и переводов', () => {
    const reversed: GroupLedger = {
      ...MOCK_LEDGER,
      expenses: [...MOCK_LEDGER.expenses].reverse(),
      transfers: [...MOCK_LEDGER.transfers].reverse(),
    };
    expect(calculateBalances(reversed)).toEqual(EXPECTED_MOCK_BALANCES);
  });

  it('учитывает вышедшего участника', () => {
    const ledger: GroupLedger = {
      members: MOCK_MEMBERS,
      expenses: [
        {
          id: 'old',
          title: 'Билеты',
          payerId: 'dima',
          amountKop: 300,
          split: { kind: 'equal', memberIds: ['anna', 'dima'] },
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      transfers: [],
    };
    expect(calculateBalances(ledger)).toEqual([
      { memberId: 'anna', balanceKop: -150 },
      { memberId: 'boris', balanceKop: 0 },
      { memberId: 'vika', balanceKop: 0 },
      { memberId: 'dima', balanceKop: 150 },
    ]);
  });

  it('пустая группа даёт пустой список', () => {
    expect(calculateBalances({ members: [], expenses: [], transfers: [] })).toEqual([]);
  });

  it('бросает RangeError для перевода неизвестному участнику', () => {
    const ledger: GroupLedger = {
      ...MOCK_LEDGER,
      transfers: [{ id: 't', fromId: 'anna', toId: 'ghost', amountKop: 100, createdAt: '2026-10-01T00:00:00.000Z' }],
    };
    expect(() => calculateBalances(ledger)).toThrow(RangeError);
  });
});
```

```ts
// src/features/balances/suggestTransfers.ts
import type { MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';
import type { MemberBalance, SuggestedTransfer } from './types';

interface Party {
  memberId: MemberId;
  restKop: Kopecks;
}

/**
 * Строит список переводов, после которых все балансы станут нулевыми.
 * Сначала закрываются пары с точно совпадающими суммами, затем жадно:
 * самый крупный должник платит самому крупному кредитору.
 * Переводов не больше n − 1, где n — число ненулевых балансов;
 * абсолютный минимум не гарантируется. Ничьи разрешаются по порядку во входном массиве.
 * @param balances Балансы участников в порядке группы.
 * @returns Рекомендуемые переводы; пустой массив, если все в расчёте.
 * @throws {RangeError} Если сумма балансов не равна 0 или баланс не целый.
 */
export function suggestTransfers(balances: readonly MemberBalance[]): SuggestedTransfer[] {
  assertSettleable(balances);

  // filter сохраняет порядок группы — на нём держится детерминизм при равных суммах.
  const debtors: Party[] = balances
    .filter((balance) => balance.balanceKop < 0)
    .map((balance) => ({ memberId: balance.memberId, restKop: -balance.balanceKop }));
  const creditors: Party[] = balances
    .filter((balance) => balance.balanceKop > 0)
    .map((balance) => ({ memberId: balance.memberId, restKop: balance.balanceKop }));
  const transfers: SuggestedTransfer[] = [];

  // Совпадающие суммы закрываются одним переводом, иначе жадный шаг может их раздробить.
  for (const debtor of debtors) {
    const creditor = creditors.find((candidate) => candidate.restKop === debtor.restKop);
    if (creditor !== undefined) {
      settle(debtor, creditor, debtor.restKop, transfers);
    }
  }

  let debtor = findLargest(debtors);
  let creditor = findLargest(creditors);
  while (debtor !== null && creditor !== null) {
    settle(debtor, creditor, Math.min(debtor.restKop, creditor.restKop), transfers);
    debtor = findLargest(debtors);
    creditor = findLargest(creditors);
  }

  return transfers;
}

function assertSettleable(balances: readonly MemberBalance[]): void {
  if (balances.some((balance) => !Number.isSafeInteger(balance.balanceKop))) {
    throw new RangeError('Балансы должны быть целыми числами копеек');
  }
  const total = balances.reduce((sum, balance) => sum + balance.balanceKop, 0);
  if (total !== 0) {
    throw new RangeError(`Сумма балансов должна быть равна 0, получено: ${total}`);
  }
}

function settle(debtor: Party, creditor: Party, amountKop: Kopecks, transfers: SuggestedTransfer[]): void {
  transfers.push({ fromId: debtor.memberId, toId: creditor.memberId, amountKop });
  debtor.restKop -= amountKop;
  creditor.restKop -= amountKop;
}

function findLargest(parties: readonly Party[]): Party | null {
  let largest: Party | null = null;
  for (const party of parties) {
    // Строгое «больше»: при равенстве остаётся участник, стоящий раньше в группе.
    if (party.restKop > 0 && (largest === null || party.restKop > largest.restKop)) {
      largest = party;
    }
  }
  return largest;
}
```

```ts
// src/features/balances/suggestTransfers.test.ts
import { describe, expect, it } from 'vitest';
import { MOCK_LEDGER } from '../../mocks/groupMocks';
import { calculateBalances } from './calculateBalances';
import { suggestTransfers } from './suggestTransfers';

describe('suggestTransfers', () => {
  it('рассчитывает группу из mock-данных', () => {
    expect(suggestTransfers(calculateBalances(MOCK_LEDGER))).toEqual([
      { fromId: 'boris', toId: 'anna', amountKop: 292_500 },
      { fromId: 'vika', toId: 'anna', amountKop: 202_500 },
    ]);
  });

  it('сначала закрывает пары с совпадающими суммами', () => {
    const transfers = suggestTransfers([
      { memberId: 'a', balanceKop: 500 },
      { memberId: 'b', balanceKop: 400 },
      { memberId: 'c', balanceKop: -400 },
      { memberId: 'd', balanceKop: -300 },
      { memberId: 'e', balanceKop: -200 },
    ]);
    expect(transfers).toEqual([
      { fromId: 'c', toId: 'b', amountKop: 400 },
      { fromId: 'd', toId: 'a', amountKop: 300 },
      { fromId: 'e', toId: 'a', amountKop: 200 },
    ]);
  });

  it('разрешает ничьи по порядку группы', () => {
    expect(
      suggestTransfers([
        { memberId: 'a', balanceKop: 100 },
        { memberId: 'b', balanceKop: 100 },
        { memberId: 'c', balanceKop: -100 },
        { memberId: 'd', balanceKop: -100 },
      ]),
    ).toEqual([
      { fromId: 'c', toId: 'a', amountKop: 100 },
      { fromId: 'd', toId: 'b', amountKop: 100 },
    ]);
  });

  it('обнуляет все балансы после выполнения переводов', () => {
    const balances = calculateBalances(MOCK_LEDGER);
    const restByMember = new Map(balances.map((balance) => [balance.memberId, balance.balanceKop]));
    for (const transfer of suggestTransfers(balances)) {
      restByMember.set(transfer.fromId, (restByMember.get(transfer.fromId) ?? 0) + transfer.amountKop);
      restByMember.set(transfer.toId, (restByMember.get(transfer.toId) ?? 0) - transfer.amountKop);
    }
    expect([...restByMember.values()].every((rest) => rest === 0)).toBe(true);
  });

  it('возвращает пустой список, если все в расчёте', () => {
    expect(suggestTransfers([])).toEqual([]);
    expect(suggestTransfers([{ memberId: 'a', balanceKop: 0 }])).toEqual([]);
  });

  it('бросает RangeError, если сумма балансов не равна нулю', () => {
    expect(() => suggestTransfers([{ memberId: 'a', balanceKop: 100 }])).toThrow(RangeError);
  });

  it('бросает RangeError для дробного баланса', () => {
    expect(() =>
      suggestTransfers([
        { memberId: 'a', balanceKop: 0.5 },
        { memberId: 'b', balanceKop: -0.5 },
      ]),
    ).toThrow(RangeError);
  });
});
```

```ts
// src/features/balances/getBalanceStatus.ts
import type { Kopecks } from '../../types/money';
import type { BalanceStatus } from './types';

/**
 * Определяет статус баланса для текстовой подписи, чтобы знак долга не передавался только цветом.
 * @param balanceKop Баланс участника в копейках.
 * @returns `'owed'` — ему должны, `'owes'` — он должен, `'settled'` — в расчёте.
 */
export function getBalanceStatus(balanceKop: Kopecks): BalanceStatus {
  if (balanceKop > 0) {
    return 'owed';
  }
  if (balanceKop < 0) {
    return 'owes';
  }
  return 'settled';
}
```

```ts
// src/features/balances/getBalanceStatus.test.ts
import { describe, expect, it } from 'vitest';
import { getBalanceStatus } from './getBalanceStatus';

describe('getBalanceStatus', () => {
  it('различает «вам должны» и «вы должны»', () => {
    expect(getBalanceStatus(1)).toBe('owed');
    expect(getBalanceStatus(-1)).toBe('owes');
  });

  it('считает нулевой баланс расчётом', () => {
    expect(getBalanceStatus(0)).toBe('settled');
  });
});
```

```ts
// src/features/balances/settleGroup.ts
import type { GroupLedger } from '../../types/group';
import { calculateBalances } from './calculateBalances';
import { suggestTransfers } from './suggestTransfers';
import type { SettlementResult } from './types';
import { validateLedger } from './validateLedger';

/**
 * Фасад для UI: валидирует данные группы, считает балансы и рекомендуемые переводы.
 * Не бросает исключений на пользовательских данных — ошибки возвращаются в результате.
 * @param ledger Участники, расходы и выполненные переводы группы.
 * @returns `{ ok: true, balances, transfers }` или `{ ok: false, errors }`.
 */
export function settleGroup(ledger: GroupLedger): SettlementResult {
  const errors = validateLedger(ledger);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const balances = calculateBalances(ledger);
  return { ok: true, balances, transfers: suggestTransfers(balances) };
}
```

```ts
// src/features/balances/settleGroup.test.ts
import { describe, expect, it } from 'vitest';
import { MOCK_LEDGER } from '../../mocks/groupMocks';
import type { GroupLedger } from '../../types/group';
import { calculateBalances } from './calculateBalances';
import { settleGroup } from './settleGroup';

describe('settleGroup', () => {
  it('возвращает балансы и переводы для корректной группы', () => {
    expect(settleGroup(MOCK_LEDGER)).toEqual({
      ok: true,
      balances: calculateBalances(MOCK_LEDGER),
      transfers: [
        { fromId: 'boris', toId: 'anna', amountKop: 292_500 },
        { fromId: 'vika', toId: 'anna', amountKop: 202_500 },
      ],
    });
  });

  it('возвращает ошибки вместо исключения', () => {
    const ledger: GroupLedger = {
      ...MOCK_LEDGER,
      transfers: [{ id: 't', fromId: 'anna', toId: 'anna', amountKop: 100, createdAt: '2026-10-01T00:00:00.000Z' }],
    };
    expect(settleGroup(ledger)).toMatchObject({ ok: false, errors: [{ code: 'SELF_TRANSFER' }] });
  });
});
```

## Проверка mock-примера вручную

| Участник | Оплатил | Доля в расходах | Переводы | Баланс |
|---|---|---|---|---|
| Аня | 9 000,00 | −3 000,00 − 50,00 | −1 000,00 (получила) | **+4 950,00** |
| Борис | 100,00 | −3 000,00 − 25,00 | — | **−2 925,00** |
| Вика | — | −3 000,00 − 25,00 | +1 000,00 (отправила) | **−2 025,00** |
| Дима (вышел) | — | — | — | **0,00** |

Сумма балансов равна 0. Предлагаемые переводы: Борис → Аня 2 925,00 ₽ и Вика → Аня 2 025,00 ₽.

## Файлы (ничего не создавалось, только вывод в ответе)

**Без изменений с шага 2:** `src/types/money.ts`, `src/types/group.ts`, `src/features/balances/types.ts`

**Новые:**
- `src/mocks/groupMocks.ts`
- `src/lib/money.ts` + `money.test.ts`
- `src/lib/splitByWeights.ts` + `splitByWeights.test.ts`
- `src/features/balances/getExpenseShares.ts` + `.test.ts`
- `src/features/balances/validateLedger.ts` + `.test.ts`
- `src/features/balances/calculateBalances.ts` + `.test.ts`
- `src/features/balances/suggestTransfers.ts` + `.test.ts`
- `src/features/balances/getBalanceStatus.ts` + `.test.ts`
- `src/features/balances/settleGroup.ts` + `.test.ts`

Тесты и проверку типов я не запускал: в репозитории нет `src/` и проекта Vite, поэтому ожидаемые значения в тестах посчитаны вручную. Когда файлы будут на диске, проверить так:

```
npx tsc --noEmit
npm test
```
