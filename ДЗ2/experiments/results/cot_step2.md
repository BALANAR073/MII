# CoT, шаг 2: типы и сигнатуры

- Дата запуска: 2026-10-15 23:40
- Claude Code: 2.1.301 (Claude Code)
- Рабочая папка: experiments\cot
- Файл правил CLAUDE.md в папке: ДА
- Время ответа: 65 с

## Промпт

```text
Шаг 2 из 4 — контракт. На основе решений из шага 1 опиши типы TypeScript (участник, расход, доли, выполненный перевод, баланс, рекомендуемый перевод) и сигнатуры экспортируемых функций с JSDoc. Реализацию функций пока не пиши.

Не создавай и не изменяй файлы — выведи код в ответе.
```

## Сырой ответ агента
# Шаг 2. Контракт модуля «Кто кому должен»

Папки `src/` в проекте пока нет, поэтому весь контракт описан с нуля. На три вопроса из шага 1 ответов не было, и контракт опирается на варианты по умолчанию: жадный алгоритм, запрет выхода при ненулевом балансе на уровне UI, лимиты из решения 10.

**Как оформлены сигнатуры.** Функции записаны как `export declare function` без тела. Это корректный TypeScript, и он проходит проверку типов даже при `noUnusedParameters`. На шаге 3 `declare` заменится реализацией, а сигнатура останется прежней.

**Одно уточнение к решению 11.** Результат с ошибками возвращает только фасад `settleGroup`, предназначенный для UI. Внутренние функции считают, что входные данные уже проверены. Если это не так, они бросают `RangeError`: такая ситуация — ошибка программиста, а не пользователя.

## Доменные типы

```ts
// src/types/money.ts

/**
 * Денежная сумма в копейках. Всегда целое число: дробные рубли и float-арифметика запрещены.
 */
export type Kopecks = number;
```

```ts
// src/types/group.ts
import type { Kopecks } from './money';

/** Идентификатор участника группы. */
export type MemberId = string;

/** Участник группы. Вышедший участник не удаляется, а получает `leftAt`. */
export interface Member {
  id: MemberId;
  name: string;
  /** Дата выхода в ISO 8601; `null` — участник в группе. */
  leftAt: string | null;
}

/** Деление поровну между перечисленными участниками. */
export interface EqualSplit {
  kind: 'equal';
  memberIds: readonly MemberId[];
}

/** Доля участника при делении по весам (например, 2:1:1). */
export interface WeightedShare {
  memberId: MemberId;
  /** Целый вес от 1 до MAX_SHARE_WEIGHT. */
  weight: number;
}

/** Деление по долям. */
export interface SharesSplit {
  kind: 'shares';
  shares: readonly WeightedShare[];
}

/** Способ деления расхода. */
export type ExpenseSplit = EqualSplit | SharesSplit;

/** Расход: один плательщик оплатил сумму, которая делится между участниками. */
export interface Expense {
  id: string;
  title: string;
  payerId: MemberId;
  amountKop: Kopecks;
  split: ExpenseSplit;
  /** Дата в ISO 8601; нужна только для сортировки в UI, на расчёт не влияет. */
  createdAt: string;
}

/** Уже выполненный перевод: `fromId` отдал деньги `toId`. */
export interface Transfer {
  id: string;
  fromId: MemberId;
  toId: MemberId;
  amountKop: Kopecks;
  createdAt: string;
}

/** Все данные группы, нужные для расчёта. Порядок `members` значим: он разрешает ничьи. */
export interface GroupLedger {
  members: readonly Member[];
  expenses: readonly Expense[];
  transfers: readonly Transfer[];
}
```

## Типы модуля balances

```ts
// src/features/balances/types.ts
import type { MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';

/** Часть суммы расхода, приходящаяся на участника. */
export interface MemberShare {
  memberId: MemberId;
  amountKop: Kopecks;
}

/** Баланс участника: > 0 — ему должны, < 0 — он должен, 0 — в расчёте. */
export interface MemberBalance {
  memberId: MemberId;
  balanceKop: Kopecks;
}

/** Статус баланса для подписи в UI («вам должны» / «вы должны» / «в расчёте»). */
export type BalanceStatus = 'owed' | 'owes' | 'settled';

/** Рекомендуемый перевод, который нужно выполнить для взаиморасчёта. */
export interface SuggestedTransfer {
  fromId: MemberId;
  toId: MemberId;
  amountKop: Kopecks;
}

/** Код ошибки валидации данных группы. */
export type ValidationErrorCode =
  | 'DUPLICATE_ID'
  | 'UNKNOWN_MEMBER'
  | 'INVALID_AMOUNT'
  | 'EMPTY_SPLIT'
  | 'DUPLICATE_SPLIT_MEMBER'
  | 'INVALID_WEIGHT'
  | 'SELF_TRANSFER';

/** Ошибка валидации с привязкой к конкретной записи. */
export interface ValidationError {
  code: ValidationErrorCode;
  entity: 'member' | 'expense' | 'transfer';
  entityId: string;
  /** Текст для пользователя на русском. */
  message: string;
}

/** Результат расчёта по группе: либо балансы и переводы, либо список ошибок. */
export type SettlementResult =
  | {
      ok: true;
      balances: MemberBalance[];
      transfers: SuggestedTransfer[];
    }
  | {
      ok: false;
      errors: ValidationError[];
    };
```

## Сигнатуры функций

```ts
// src/lib/money.ts
import type { Kopecks } from '../types/money';

/**
 * Форматирует сумму в копейках для отображения: 150000 → «1 500,00 ₽».
 * Отрицательные суммы выводятся со знаком минус.
 * @param kop Целая сумма в копейках.
 * @returns Строка в формате ru-RU с символом рубля.
 * @throws {RangeError} Если `kop` не является безопасным целым числом.
 */
export declare function formatRub(kop: Kopecks): string;
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
export declare function splitByWeights(amountKop: Kopecks, weights: readonly number[]): Kopecks[];
```

```ts
// src/features/balances/validateLedger.ts
import type { GroupLedger } from '../../types/group';
import type { Kopecks } from '../../types/money';
import type { ValidationError } from './types';

/** Максимальная сумма одного расхода или перевода — 100 млн ₽. */
export const MAX_AMOUNT_KOP: Kopecks = 10_000_000_000;

/** Максимальный вес доли при делении по долям. */
export const MAX_SHARE_WEIGHT = 1000;

/**
 * Проверяет данные группы перед расчётом и собирает все ошибки, не останавливаясь на первой.
 * Правила UI (запрет выхода с ненулевым балансом, выбор вышедших в новых записях) здесь не проверяются.
 * @param ledger Участники, расходы и выполненные переводы группы.
 * @returns Пустой массив, если данные корректны, иначе список ошибок.
 */
export declare function validateLedger(ledger: GroupLedger): ValidationError[];
```

```ts
// src/features/balances/getExpenseShares.ts
import type { Expense, Member } from '../../types/group';
import type { MemberShare } from './types';

/**
 * Считает, сколько из суммы расхода приходится на каждого участника деления.
 * Участники упорядочиваются по позиции в `members` группы, поэтому
 * распределение остатка не зависит от порядка выбора в форме.
 * @param expense Валидный расход.
 * @param members Участники группы в значимом порядке.
 * @returns Доли участников деления в порядке группы; сумма равна `expense.amountKop`.
 * @throws {RangeError} Если расход ссылается на неизвестного участника или нарушает ограничения.
 */
export declare function getExpenseShares(expense: Expense, members: readonly Member[]): MemberShare[];
```

```ts
// src/features/balances/calculateBalances.ts
import type { GroupLedger } from '../../types/group';
import type { MemberBalance } from './types';

/**
 * Считает баланс каждого участника, включая вышедших:
 * оплачено − своя доля + отправлено переводами − получено переводами.
 * Сумма всех балансов равна 0; порядок расходов и переводов на результат не влияет.
 * @param ledger Валидные данные группы (см. `validateLedger`).
 * @returns Балансы всех участников в порядке `ledger.members`.
 * @throws {RangeError} Если данные невалидны.
 */
export declare function calculateBalances(ledger: GroupLedger): MemberBalance[];
```

```ts
// src/features/balances/suggestTransfers.ts
import type { MemberBalance, SuggestedTransfer } from './types';

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
export declare function suggestTransfers(balances: readonly MemberBalance[]): SuggestedTransfer[];
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
export declare function getBalanceStatus(balanceKop: Kopecks): BalanceStatus;
```

```ts
// src/features/balances/settleGroup.ts
import type { GroupLedger } from '../../types/group';
import type { SettlementResult } from './types';

/**
 * Фасад для UI: валидирует данные группы, считает балансы и рекомендуемые переводы.
 * Не бросает исключений на пользовательских данных — ошибки возвращаются в результате.
 * @param ledger Участники, расходы и выполненные переводы группы.
 * @returns `{ ok: true, balances, transfers }` или `{ ok: false, errors }`.
 */
export declare function settleGroup(ledger: GroupLedger): SettlementResult;
```

## Цепочка вызовов

`settleGroup` → `validateLedger` → `calculateBalances` (внутри `getExpenseShares` → `splitByWeights`) → `suggestTransfers`.

Хук `useGroupBalances` будет вызывать только `settleGroup`, а компоненты — `getBalanceStatus` и `formatRub`.

## Изменения к решениям шага 1

- **К решению 4:** `splitByWeights` в `src/lib` не знает об участниках. Ничьи в нём разрешаются по индексу, а порядок группы ему передаёт `getExpenseShares`.
- **К решению 11:** результат с ошибками возвращает только `settleGroup`, внутренние функции бросают `RangeError`.
- **Добавлено:** поле `Expense.title` для UI, код ошибки `DUPLICATE_ID`, функция `getBalanceStatus`.

## Файлы

Файлы не создавались. Ниже — план на шаг 3:
- `src/types/money.ts`, `src/types/group.ts`
- `src/lib/money.ts`, `src/lib/splitByWeights.ts`
- `src/features/balances/types.ts`, `validateLedger.ts`, `getExpenseShares.ts`, `calculateBalances.ts`, `suggestTransfers.ts`, `getBalanceStatus.ts`, `settleGroup.ts`
- тест `*.test.ts` рядом с каждой функцией

Проверка после шага 3: `npm test`.
