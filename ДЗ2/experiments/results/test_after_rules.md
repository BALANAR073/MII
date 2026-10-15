# Тест: ответ С файлом правил

- Дата запуска: 2026-10-15 23:38
- Claude Code: 2.1.301 (Claude Code)
- Рабочая папка: experiments\with_rules
- Файл правил CLAUDE.md в папке: ДА
- Время ответа: 100 с

## Промпт

```text
Напиши React-компонент карточки расхода для веб-приложения «ПоРовну» (делёж общих расходов в компании). Карточка показывает название расхода, сумму, кто заплатил, на сколько человек делится расход и долю текущего пользователя.

Не создавай и не изменяй файлы — выведи весь код прямо в ответе.
```

## Сырой ответ агента
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
