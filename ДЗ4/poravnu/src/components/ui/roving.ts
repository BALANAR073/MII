import type { KeyboardEvent } from 'react';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Клавиатура для групп `role="tab"` и `role="radio"` по паттерну ARIA:
 * стрелки переключают вариант и переносят на него фокус, Home и End — к первому и последнему.
 * Вариантам ставится roving tabIndex: в порядке Tab только выбранный (находка 10 AI-ревью).
 * @param event Нажатие клавиши на одном из вариантов.
 * @param options Варианты в порядке на экране.
 * @param current Выбранный вариант.
 * @param select Выбор нового варианта.
 */
export function handleRovingKeyDown<T>(event: KeyboardEvent<HTMLElement>, options: readonly T[], current: T, select: (value: T) => void): void {
  const index = options.indexOf(current);
  let nextIndex: number;
  if (NEXT_KEYS.has(event.key)) {
    nextIndex = (index + 1) % options.length;
  } else if (PREV_KEYS.has(event.key)) {
    nextIndex = (index - 1 + options.length) % options.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = options.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  const next = options[nextIndex];
  if (next === undefined) {
    return;
  }
  select(next);
  const siblings = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"], [role="radio"]');
  siblings?.[nextIndex]?.focus();
}
