# ДЗ2. Тестирование системы правил (Шаг 5)

**Выполнил:** Творогов Д.Н., гр. 4481
**Агент:** Claude Code 2.1.301 (модель Opus 5.5), неинтерактивный режим `claude -p`

## Методика

Одна и та же задача отправлена агенту дважды, без изменений в тексте промпта:

```text
Напиши React-компонент карточки расхода для веб-приложения «ПоРовну» (делёж общих расходов в компании). Карточка показывает название расхода, сумму, кто заплатил, на сколько человек делится расход и долю текущего пользователя.

Не создавай и не изменяй файлы — выведи весь код прямо в ответе.
```

| | ДО применения правил | ПОСЛЕ применения правил |
|---|---|---|
| Рабочая папка | `experiments/no_rules/` (пустая) | `experiments/with_rules/` (только `CLAUDE.md` из `rules.md`) |
| Запуск | 15.10.2026 23:36, ответ за 40 с | 15.10.2026 23:38, ответ за 100 с |
| Сырой ответ | `experiments/results/test_before_rules.md` | `experiments/results/test_after_rules.md` |

Запуск был автоматическим: скрипт `experiments/run_experiments.ps1` на моём компьютере. Ответы сохранены как есть, без правок. Так как агент код не запускал (нет проекта), код из ответа «ПОСЛЕ» я дополнительно проверил. Проверка типов TypeScript в режиме `strict` прошла без ошибок, 12 из 12 тестов функций прошли, 5 из 5 сценариев рендеринга карточки совпали с ожиданиями. Лог: `experiments/verification/verification_log.txt`.

---

## 1. Сырой ответ агента ДО применения правил

Ниже компонент на React и TypeScript, к нему файл стилей и пример использования. Суммы хранятся в копейках (целые числа), чтобы при делении не накапливались ошибки округления, как у дробных рублей.

##### `ExpenseCard.tsx`

```tsx
import React from "react";
import "./ExpenseCard.css";

export interface Person {
  id: string;
  name: string;
}

export interface ExpenseCardProps {
  /** Название расхода, например «Пицца» */
  title: string;
  /** Сумма расхода в минимальных единицах валюты (копейках) */
  amountMinor: number;
  /** Код валюты ISO 4217 */
  currency?: string;
  /** Кто заплатил */
  payer: Person;
  /** На сколько человек делится расход */
  participantsCount: number;
  /** Текущий пользователь */
  currentUserId: string;
  /** Участвует ли текущий пользователь в расходе */
  isCurrentUserParticipant: boolean;
  /**
   * Доля текущего пользователя в копейках. Если не передана,
   * считается равная доля (остаток копеек округляется вверх).
   */
  currentUserShareMinor?: number;
  /** Дата расхода */
  date?: Date | string;
  onClick?: () => void;
}

const formatMoney = (minor: number, currency: string): string =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);

const formatDate = (date: Date | string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(typeof date === "string" ? new Date(date) : date);

/** «на 1 человека», «на 3 человека», «на 5 человек» */
const peopleLabel = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} человека`;
  }
  return `${n} человек`;
};

const equalShare = (amountMinor: number, count: number): number =>
  Math.ceil(amountMinor / count);

type Balance =
  | { kind: "owed"; amount: number } // пользователю должны
  | { kind: "owes"; amount: number } // пользователь должен
  | { kind: "settled" } // пользователь платил только за себя
  | { kind: "none" }; // пользователь не участвует

export const ExpenseCard: React.FC<ExpenseCardProps> = ({
  title,
  amountMinor,
  currency = "RUB",
  payer,
  participantsCount,
  currentUserId,
  isCurrentUserParticipant,
  currentUserShareMinor,
  date,
  onClick,
}) => {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("amountMinor должен быть неотрицательным целым числом");
  }
  if (!Number.isInteger(participantsCount) || participantsCount < 1) {
    throw new Error("participantsCount должен быть целым числом ≥ 1");
  }

  const isPayer = payer.id === currentUserId;
  const share = isCurrentUserParticipant
    ? currentUserShareMinor ?? equalShare(amountMinor, participantsCount)
    : 0;

  let balance: Balance;
  if (isPayer) {
    const owed = amountMinor - share;
    balance = owed > 0 ? { kind: "owed", amount: owed } : { kind: "settled" };
  } else if (isCurrentUserParticipant) {
    balance = { kind: "owes", amount: share };
  } else {
    balance = { kind: "none" };
  }

  const money = (m: number) => formatMoney(m, currency);

  return (
    <article
      className={`expense-card expense-card--${balance.kind}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={`Расход «${title}» на сумму ${money(amountMinor)}`}
    >
      <header className="expense-card__header">
        <h3 className="expense-card__title">{title}</h3>
        <span className="expense-card__amount">{money(amountMinor)}</span>
      </header>

      <dl className="expense-card__details">
        <div className="expense-card__row">
          <dt>Заплатил(а)</dt>
          <dd>{isPayer ? "Вы" : payer.name}</dd>
        </div>
        <div className="expense-card__row">
          <dt>Делится</dt>
          <dd>на {peopleLabel(participantsCount)}</dd>
        </div>
        {isCurrentUserParticipant && (
          <div className="expense-card__row">
            <dt>Ваша доля</dt>
            <dd>{money(share)}</dd>
          </div>
        )}
        {date && (
          <div className="expense-card__row">
            <dt>Дата</dt>
            <dd>{formatDate(date)}</dd>
          </div>
        )}
      </dl>

      <footer className="expense-card__balance">
        {balance.kind === "owed" && <>Вам должны {money(balance.amount)}</>}
        {balance.kind === "owes" && (
          <>
            Вы должны {payer.name} {money(balance.amount)}
          </>
        )}
        {balance.kind === "settled" && <>Вы никому не должны</>}
        {balance.kind === "none" && <>Вы не участвуете в этом расходе</>}
      </footer>
    </article>
  );
};

export default ExpenseCard;
```

##### `ExpenseCard.css`

```css
.expense-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
  padding: 16px;
  border: 1px solid #e3e5e8;
  border-left: 4px solid #9aa0a6;
  border-radius: 12px;
  background: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2328;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.expense-card[role="button"] {
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}
.expense-card[role="button"]:hover,
.expense-card[role="button"]:focus-visible {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  outline: none;
}

.expense-card--owed  { border-left-color: #2e9e5b; }
.expense-card--owes  { border-left-color: #d9534f; }

.expense-card__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.expense-card__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.expense-card__amount {
  font-size: 1.25rem;
  font-weight: 700;
  white-space: nowrap;
}

.expense-card__details {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}

.expense-card__row {
  display: flex;
  justify-content: space-between;
}
.expense-card__row dt { color: #656d76; }
.expense-card__row dd { margin: 0; font-weight: 500; }

.expense-card__balance {
  padding-top: 10px;
  border-top: 1px dashed #e3e5e8;
  font-size: 0.95rem;
  font-weight: 600;
  color: #656d76;
}
.expense-card--owed .expense-card__balance { color: #2e9e5b; }
.expense-card--owes .expense-card__balance { color: #d9534f; }
```

##### Пример использования

```tsx
import ExpenseCard from "./ExpenseCard";

export function Demo() {
  const me = "u1";
  return (
    <div style={{ display: "grid", gap: 16, padding: 24 }}>
      {/* Я заплатил 3000 ₽ за пиццу на четверых → мне должны 2250 ₽ */}
      <ExpenseCard
        title="Пицца"
        amountMinor={300000}
        payer={{ id: "u1", name: "Аня" }}
        participantsCount={4}
        currentUserId={me}
        isCurrentUserParticipant
        date="2026-10-12"
      />

      {/* Платил Олег, делим на троих → я должен 333,34 ₽ */}
      <ExpenseCard
        title="Такси до вокзала"
        amountMinor={100000}
        payer={{ id: "u2", name: "Олег" }}
        participantsCount={3}
        currentUserId={me}
        isCurrentUserParticipant
        onClick={() => alert("Открыть детали")}
      />

      {/* Я не участвую */}
      <ExpenseCard
        title="Билеты в кино"
        amountMinor={120000}
        payer={{ id: "u3", name: "Маша" }}
        participantsCount={2}
        currentUserId={me}
        isCurrentUserParticipant={false}
      />
    </div>
  );
}
```

##### Как это работает

- **Доля пользователя.** Если в `currentUserShareMinor` передать долю, посчитанную модулем расчёта долгов, карточка возьмёт её. Так поддерживаются и неравные доли. Если доля не передана, карточка делит сумму поровну и округляет копейки вверх. В этом случае сумма всех долей может превысить общую сумму на несколько копеек, поэтому точную долю лучше передавать из модуля расчёта долгов.
- **Итог для пользователя.** Внизу карточки одна из четырёх надписей: «Вам должны …» (если платил пользователь), «Вы должны {имя} …», «Вы никому не должны» или «Вы не участвуете в этом расходе». Цвет левой полосы зависит от ситуации: зелёный, когда пользователю должны, и красный, когда должен он.
- **Форматирование.** Суммы и даты выводятся в русском формате через `Intl` (`3 000 ₽`, `333,34 ₽`, `12 октября`). Слово «человек» склоняется по числу: «на 3 человека», «на 5 человек».
- **Доступность.** Если передан `onClick`, карточку можно открыть с клавиатуры клавишами Enter и Пробел.

---

## 2. Сырой ответ агента ПОСЛЕ применения правил

Каталога `src/` в репозитории пока нет. Поэтому в ответе есть и всё, на что опирается карточка: типы, `formatRub` и чистая функция деления расхода.

**Допущения:**
- Расход делится между участниками поровну. Если сумма не делится нацело, лишние копейки по одной получают первые участники по порядку `id`. Так результат всегда одинаковый, а доли в сумме дают ровно `amountKop`.
- Карточка получает готовые данные через props и сама ничего не загружает. Поэтому состояний loading / error / empty в ней нет, их будет обрабатывать список расходов.
- Строка под долей показывает итог для текущего пользователя по этому расходу. Если он заплатил, это «вам должны» (сумма минус его доля). Если он участник, это «вы должны» (его доля). Если он не участвует, так и написано.
- Входные данные проверены заранее. Если сумма отрицательная или дробная, `splitEvenly` выбрасывает `RangeError`.
- Тесты не используют `@testing-library/jest-dom`, только обычные `expect` из Vitest, и рассчитаны на окружение `jsdom`.

```ts
// src/types/expense.ts
/** Денежная сумма в копейках (целое число). */
export type Kopecks = number;

/** Участник группы. */
export interface Member {
  id: string;
  name: string;
}

/** Общий расход группы. */
export interface Expense {
  id: string;
  title: string;
  amountKop: Kopecks;
  payerId: string;
  participantIds: readonly string[];
}
```

```ts
// src/lib/money.ts
import type { Kopecks } from '../types/expense';

/**
 * Форматирует сумму в копейках как рубли: 150000 → «1 500,00 ₽».
 * @throws {RangeError} если сумма не целое безопасное число.
 */
export function formatRub(kop: Kopecks): string {
  if (!Number.isSafeInteger(kop)) {
    throw new RangeError(`Сумма должна быть целым числом копеек, получено: ${kop}`);
  }
  const sign = kop < 0 ? '-' : '';
  const abs = Math.abs(kop);
  const kopPart = abs % 100;
  // Вычитаем остаток до деления, чтобы результат был точным целым без округлений float
  const rubles = (abs - kopPart) / 100;
  return `${sign}${groupThousands(rubles)},${String(kopPart).padStart(2, '0')} ₽`;
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
```

```ts
// src/lib/money.test.ts
import { describe, expect, it } from 'vitest';
import { formatRub } from './money';

describe('formatRub', () => {
  it('форматирует рубли с разделителем тысяч и копейками', () => {
    expect(formatRub(150000)).toBe('1 500,00 ₽');
    expect(formatRub(123456789)).toBe('1 234 567,89 ₽');
  });

  it('корректно обрабатывает ноль, копейки и отрицательные суммы', () => {
    expect(formatRub(0)).toBe('0,00 ₽');
    expect(formatRub(5)).toBe('0,05 ₽');
    expect(formatRub(-150000)).toBe('-1 500,00 ₽');
  });

  it('бросает RangeError для дробного значения', () => {
    expect(() => formatRub(1.5)).toThrow(RangeError);
  });
});
```

```ts
// src/lib/split.ts
import type { Kopecks } from '../types/expense';

/**
 * Делит сумму поровну между участниками.
 * Остаток раздаётся по одной копейке первым участникам в порядке сортировки id,
 * поэтому результат детерминирован, а сумма долей всегда равна amountKop.
 * @throws {RangeError} при пустом списке, дубликатах id или некорректной сумме.
 */
export function splitEvenly(
  amountKop: Kopecks,
  participantIds: readonly string[],
): Record<string, Kopecks> {
  if (!Number.isSafeInteger(amountKop) || amountKop < 0) {
    throw new RangeError(`Сумма должна быть неотрицательным целым числом копеек: ${amountKop}`);
  }
  if (participantIds.length === 0) {
    throw new RangeError('Нельзя разделить расход без участников');
  }
  if (new Set(participantIds).size !== participantIds.length) {
    throw new RangeError('Список участников содержит повторяющиеся id');
  }

  const count = participantIds.length;
  const remainder = amountKop % count;
  const baseKop = (amountKop - remainder) / count;
  // Сортировка не зависит от порядка, в котором участники пришли с сервера
  const sortedIds = [...participantIds].sort();

  const shares: Record<string, Kopecks> = {};
  sortedIds.forEach((id, index) => {
    shares[id] = baseKop + (index < remainder ? 1 : 0);
  });
  return shares;
}
```

```ts
// src/lib/split.test.ts
import { describe, expect, it } from 'vitest';
import { splitEvenly } from './split';

describe('splitEvenly', () => {
  it('делит сумму поровну без остатка', () => {
    expect(splitEvenly(90000, ['a', 'b', 'c'])).toEqual({ a: 30000, b: 30000, c: 30000 });
  });

  it('раздаёт остаток по копейке детерминированно, сумма сохраняется', () => {
    const shares = splitEvenly(100, ['c', 'a', 'b']);
    expect(shares).toEqual({ a: 34, b: 33, c: 33 });
    expect(Object.values(shares).reduce((sum, kop) => sum + kop, 0)).toBe(100);
  });

  it('корректно делит сумму меньше числа участников', () => {
    expect(splitEvenly(2, ['a', 'b', 'c'])).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('бросает RangeError для некорректных входных данных', () => {
    expect(() => splitEvenly(100, [])).toThrow(RangeError);
    expect(() => splitEvenly(-1, ['a'])).toThrow(RangeError);
    expect(() => splitEvenly(10.5, ['a'])).toThrow(RangeError);
    expect(() => splitEvenly(100, ['a', 'a'])).toThrow(RangeError);
  });
});
```

```ts
// src/features/expenses/userShare.ts
import { splitEvenly } from '../../lib/split';
import type { Expense, Kopecks } from '../../types/expense';

/** Роль пользователя в расходе. */
export type UserShareRole = 'payer' | 'participant' | 'outsider';

/** Доля пользователя в расходе и его итог по нему. */
export interface UserShare {
  role: UserShareRole;
  /** Сколько приходится на пользователя. */
  shareKop: Kopecks;
  /** > 0 — пользователю должны, < 0 — пользователь должен. */
  balanceKop: Kopecks;
}

/**
 * Считает долю пользователя в расходе и его баланс по этому расходу.
 * @throws {RangeError} если расход нельзя разделить (см. splitEvenly).
 */
export function getUserShare(expense: Expense, userId: string): UserShare {
  const shares = splitEvenly(expense.amountKop, expense.participantIds);
  const shareKop = shares[userId] ?? 0;
  const isPayer = expense.payerId === userId;
  const paidKop = isPayer ? expense.amountKop : 0;

  return {
    role: getRole(isPayer, expense.participantIds.includes(userId)),
    shareKop,
    balanceKop: paidKop - shareKop,
  };
}

function getRole(isPayer: boolean, isParticipant: boolean): UserShareRole {
  if (isPayer) return 'payer';
  return isParticipant ? 'participant' : 'outsider';
}
```

```ts
// src/features/expenses/userShare.test.ts
import { describe, expect, it } from 'vitest';
import type { Expense } from '../../types/expense';
import { getUserShare } from './userShare';

const EXPENSE: Expense = {
  id: 'e1',
  title: 'Ужин в кафе',
  amountKop: 100000,
  payerId: 'a',
  participantIds: ['a', 'b', 'c'],
};

describe('getUserShare', () => {
  it('участник должен свою долю', () => {
    expect(getUserShare(EXPENSE, 'b')).toEqual({
      role: 'participant',
      shareKop: 33333,
      balanceKop: -33333,
    });
  });

  it('плательщику должны сумму минус его доля', () => {
    expect(getUserShare(EXPENSE, 'a')).toEqual({
      role: 'payer',
      shareKop: 33334,
      balanceKop: 66666,
    });
  });

  it('плательщик, не входящий в участников, получает назад всю сумму', () => {
    const expense: Expense = { ...EXPENSE, participantIds: ['b', 'c'] };
    expect(getUserShare(expense, 'a')).toEqual({ role: 'payer', shareKop: 0, balanceKop: 100000 });
  });

  it('посторонний пользователь имеет нулевую долю', () => {
    expect(getUserShare(EXPENSE, 'z')).toEqual({ role: 'outsider', shareKop: 0, balanceKop: 0 });
  });

  it('бросает RangeError для расхода без участников', () => {
    expect(() => getUserShare({ ...EXPENSE, participantIds: [] }, 'a')).toThrow(RangeError);
  });
});
```

```tsx
// src/features/expenses/ExpenseCard.tsx
import { useId } from 'react';
import { formatRub } from '../../lib/money';
import type { Expense, Member } from '../../types/expense';
import { getUserShare, type UserShare } from './userShare';

interface StatusView {
  text: string;
  className: string;
}

interface ExpenseCardProps {
  expense: Expense;
  members: readonly Member[];
  currentUserId: string;
}

/**
 * Карточка расхода: название, сумма, плательщик, число участников
 * и доля текущего пользователя с текстовым статусом долга.
 */
export function ExpenseCard({ expense, members, currentUserId }: ExpenseCardProps) {
  const titleId = useId();
  const participantsCount = expense.participantIds.length;
  // Без участников делить не на кого — показываем предупреждение вместо падения splitEvenly
  const share = participantsCount > 0 ? getUserShare(expense, currentUserId) : null;
  const payerLabel =
    expense.payerId === currentUserId ? 'Вы' : findMemberName(members, expense.payerId);
  const status = getStatusView(share);

  return (
    <article
      aria-labelledby={titleId}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {expense.title}
        </h2>
        <p className="whitespace-nowrap text-lg font-semibold text-slate-900">
          {formatRub(expense.amountKop)}
        </p>
      </header>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">Заплатил</dt>
        <dd className="text-slate-900">{payerLabel}</dd>

        <dt className="text-slate-500">Делится на</dt>
        <dd className="text-slate-900">{formatPeopleCount(participantsCount)}</dd>

        <dt className="text-slate-500">Ваша доля</dt>
        <dd className="whitespace-nowrap text-slate-900">{formatRub(share?.shareKop ?? 0)}</dd>
      </dl>

      <p className={`mt-3 text-sm font-medium ${status.className}`}>{status.text}</p>
    </article>
  );
}

function findMemberName(members: readonly Member[], memberId: string): string {
  return members.find((member) => member.id === memberId)?.name ?? 'Неизвестный участник';
}

function getStatusView(share: UserShare | null): StatusView {
  if (share === null) {
    return { text: 'Участники расхода не указаны', className: 'text-rose-600' };
  }
  if (share.role === 'outsider') {
    return { text: 'Вы не участвуете в этом расходе', className: 'text-slate-500' };
  }
  if (share.balanceKop > 0) {
    return { text: `Вам должны ${formatRub(share.balanceKop)}`, className: 'text-emerald-600' };
  }
  if (share.balanceKop < 0) {
    return { text: `Вы должны ${formatRub(-share.balanceKop)}`, className: 'text-rose-600' };
  }
  return { text: 'Вы никому не должны', className: 'text-slate-500' };
}

// «на 1 человека», «на 3 человека», «на 5 человек», «на 11 человек», «на 21 человека»
function formatPeopleCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const isGenitiveSingular = mod10 >= 1 && mod10 <= 4 && (mod100 < 11 || mod100 > 14);
  return `${count} ${isGenitiveSingular ? 'человека' : 'человек'}`;
}
```

```tsx
// src/features/expenses/ExpenseCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Expense, Member } from '../../types/expense';
import { ExpenseCard } from './ExpenseCard';

const MEMBERS: Member[] = [
  { id: 'a', name: 'Аня' },
  { id: 'b', name: 'Боря' },
  { id: 'c', name: 'Вика' },
];

const EXPENSE: Expense = {
  id: 'e1',
  title: 'Ужин в кафе',
  amountKop: 100000,
  payerId: 'a',
  participantIds: ['a', 'b', 'c'],
};

describe('ExpenseCard', () => {
  it('показывает данные расхода и долг участника', () => {
    render(<ExpenseCard expense={EXPENSE} members={MEMBERS} currentUserId="b" />);

    expect(screen.getByRole('article', { name: 'Ужин в кафе' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Ужин в кафе' })).toBeTruthy();
    expect(screen.getByText('1 000,00 ₽')).toBeTruthy();
    expect(screen.getByText('Аня')).toBeTruthy();
    expect(screen.getByText('3 человека')).toBeTruthy();
    expect(screen.getByText('333,33 ₽')).toBeTruthy();
    expect(screen.getByText('Вы должны 333,33 ₽').className).toContain('text-rose-600');
  });

  it('для плательщика показывает «Вы» и сколько ему должны', () => {
    render(<ExpenseCard expense={EXPENSE} members={MEMBERS} currentUserId="a" />);

    expect(screen.getByText('Вы')).toBeTruthy();
    expect(screen.getByText('333,34 ₽')).toBeTruthy();
    expect(screen.getByText('Вам должны 666,66 ₽').className).toContain('text-emerald-600');
  });

  it('сообщает, если пользователь не участвует в расходе', () => {
    render(<ExpenseCard expense={EXPENSE} members={MEMBERS} currentUserId="z" />);

    expect(screen.getByText('Вы не участвуете в этом расходе')).toBeTruthy();
    expect(screen.getByText('0,00 ₽')).toBeTruthy();
  });

  it('не падает на расходе без участников и показывает предупреждение', () => {
    const expense: Expense = { ...EXPENSE, participantIds: [] };
    render(<ExpenseCard expense={expense} members={MEMBERS} currentUserId="b" />);

    expect(screen.getByText('Участники расхода не указаны')).toBeTruthy();
    expect(screen.getByText('0 человек')).toBeTruthy();
  });

  it('показывает заглушку, если плательщика нет в списке участников группы', () => {
    const expense: Expense = { ...EXPENSE, payerId: 'ghost' };
    render(<ExpenseCard expense={expense} members={MEMBERS} currentUserId="b" />);

    expect(screen.getByText('Неизвестный участник')).toBeTruthy();
  });
});
```

**Файлы (по вашей просьбе я их не создавал):**
- `src/types/expense.ts`
- `src/lib/money.ts`, `src/lib/money.test.ts`
- `src/lib/split.ts`, `src/lib/split.test.ts`
- `src/features/expenses/userShare.ts`, `src/features/expenses/userShare.test.ts`
- `src/features/expenses/ExpenseCard.tsx`, `src/features/expenses/ExpenseCard.test.tsx`

Код и тесты я не запускал. После того как вы добавите файлы в проект, проверить их можно командой `npm test`.

---

## 3. Сравнение по правилам проекта

| Правило из `CLAUDE.md` | ДО | ПОСЛЕ |
|---|---|---|
| 1. Перечислить допущения | ❌ нет | ✅ 5 явных допущений перед кодом |
| 5. Логика в чистых функциях, не в компоненте | ❌ расчёт доли и баланса внутри компонента | ✅ `splitEvenly`, `getUserShare` вынесены и протестированы отдельно |
| 6. Деньги в копейках, остаток раздаётся детерминированно, сумма сходится | ⚠️ копейки есть, но доля округляется вверх (`Math.ceil`). При 1 000 ₽ на троих должники вместе платят 666,68 ₽, а плательщику должны 666,66 ₽: расхождение 2 коп. | ✅ остаток по копейке первым по порядку id, сумма долей ровно равна сумме расхода (тест) |
| 6. Отображение через `formatRub` | ❌ `Intl.NumberFormat` с делением `minor / 100` | ✅ `formatRub` в `src/lib/money.ts`, без float |
| 8. Только именованный экспорт | ❌ и `export const`, и `export default` | ✅ только именованный |
| 9. `interface <Компонент>Props` | ✅ | ✅ |
| 10. Только Tailwind, цвета emerald / rose / slate | ❌ отдельный CSS-файл с HEX-цветами | ✅ Tailwind, `text-emerald-600` / `text-rose-600`, `rounded-xl` |
| 12. Долг не только цветом | ✅ текст есть | ✅ текст есть |
| 15. Без `React.FC` | ❌ `React.FC<ExpenseCardProps>` | ✅ обычная функция |
| 17. Без inline-стилей | ❌ `style={…}` в примере, `alert()` | ✅ нет |
| 18. Путь файла в каждом блоке кода | ❌ только заголовки | ✅ `// src/features/expenses/ExpenseCard.tsx` и т.д. |
| 20. Тесты к каждому компоненту и функции | ❌ тестов нет | ✅ 4 файла тестов, 17 тестов |
| 22. Список файлов и команда проверки | ❌ | ✅ |
| Корректность склонения | ❌ «на 1 человек», «на 21 человек» | ✅ «1 человека», «21 человека» |
| Поведение при ошибочных данных | ❌ `throw` прямо в рендере: падает весь экран | ✅ предупреждение «Участники расхода не указаны» |
| **Итог по 13 проверяемым правилам** | **2 из 13** (ещё 1 частично) | **13 из 13** |

Цифры ошибок ответа «ДО» проверены запуском кода: `Math.ceil(100000 / 3) = 33334`, два должника вместе платят 66 668 коп., плательщику причитается 66 666 коп.

## 4. Вывод

Файл правил заметно изменил результат. Без правил агент написал рабочий, но «самодельный» компонент: отдельный CSS-файл, устаревший `React.FC`, `export default`, без тестов. Главное, в нём осталась **денежная ошибка округления**: доля считается через `Math.ceil`, и при делении 1 000 ₽ на троих долги не сходятся на 2 копейки. Без правил агент сам догадался хранить суммы в копейках, но правила распределения остатка не знал.

С правилами ответ соответствует проекту по всем 13 проверяемым пунктам. Логика вынесена в чистые функции (`splitEvenly`, `getUserShare`), остаток копеек раздаётся детерминированно, и сумма долей всегда равна сумме расхода. Стили на Tailwind в цветах проекта, у каждого файла указан путь, к каждой функции и компоненту есть тесты (17 штук), перед кодом перечислены допущения. Цена — время ответа выросла с 40 до 100 секунд, а объём кода примерно в 1,6 раза, за счёт тестов и вспомогательных модулей. Для реального проекта это выгодный обмен: ответ можно сразу разложить по папкам, а правило 6 из `CLAUDE.md` предотвратило ровно ту ошибку, которая была найдена в ДЗ1.
