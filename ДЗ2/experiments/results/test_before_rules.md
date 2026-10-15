# Тест: ответ БЕЗ файла правил

- Дата запуска: 2026-10-15 23:36
- Claude Code: 2.1.301 (Claude Code)
- Рабочая папка: experiments\no_rules
- Файл правил CLAUDE.md в папке: НЕТ
- Время ответа: 40 с

## Промпт

```text
Напиши React-компонент карточки расхода для веб-приложения «ПоРовну» (делёж общих расходов в компании). Карточка показывает название расхода, сумму, кто заплатил, на сколько человек делится расход и долю текущего пользователя.

Не создавай и не изменяй файлы — выведи весь код прямо в ответе.
```

## Сырой ответ агента
Ниже компонент на React и TypeScript, к нему файл стилей и пример использования. Суммы хранятся в копейках (целые числа), чтобы при делении не накапливались ошибки округления, как у дробных рублей.

### `ExpenseCard.tsx`

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

### `ExpenseCard.css`

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

### Пример использования

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

### Как это работает

- **Доля пользователя.** Если в `currentUserShareMinor` передать долю, посчитанную модулем расчёта долгов, карточка возьмёт её. Так поддерживаются и неравные доли. Если доля не передана, карточка делит сумму поровну и округляет копейки вверх. В этом случае сумма всех долей может превысить общую сумму на несколько копеек, поэтому точную долю лучше передавать из модуля расчёта долгов.
- **Итог для пользователя.** Внизу карточки одна из четырёх надписей: «Вам должны …» (если платил пользователь), «Вы должны {имя} …», «Вы никому не должны» или «Вы не участвуете в этом расходе». Цвет левой полосы зависит от ситуации: зелёный, когда пользователю должны, и красный, когда должен он.
- **Форматирование.** Суммы и даты выводятся в русском формате через `Intl` (`3 000 ₽`, `333,34 ₽`, `12 октября`). Слово «человек» склоняется по числу: «на 3 человека», «на 5 человек».
- **Доступность.** Если передан `onClick`, карточку можно открыть с клавиатуры клавишами Enter и Пробел.
