import type { Kopecks } from './money';

export type MemberId = string;

/** Участник группы. Порядок в `Group.members` — порядок вступления (Q1 в ТЗ). */
export interface Member {
  id: MemberId;
  name: string;
  joinedAt: string;
  /** Дата выхода из группы или `null`, если участник активен (FR-2.4). */
  leftAt: string | null;
  /**
   * Участник без аккаунта: добавлен по имени и ещё не занят человеком по ссылке (ДЗ6, миграция 6).
   * Отсутствие поля означает зарегистрированного участника.
   */
  isVirtual?: boolean;
}

export interface WeightedShare {
  memberId: MemberId;
  weight: number;
}

/** Способ деления расхода: поровну между выбранными или по целым долям (FR-3.4). */
export type ExpenseSplit = { kind: 'equal'; memberIds: MemberId[] } | { kind: 'shares'; shares: WeightedShare[] };

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  amountKop: Kopecks;
  payerId: MemberId;
  split: ExpenseSplit;
  /** Дата расхода без времени, `YYYY-MM-DD`. */
  date: string;
  /** Категория из `EXPENSE_CATEGORIES` или `null` — «Другое» (ДЗ6). */
  category?: string | null;
  createdBy: MemberId;
  createdAt: string;
}

export interface Transfer {
  id: string;
  groupId: string;
  fromId: MemberId;
  toId: MemberId;
  amountKop: Kopecks;
  createdBy: MemberId;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  ownerId: MemberId;
  inviteToken: string;
  members: Member[];
  createdAt: string;
}

/** Всё, что нужно для расчёта балансов группы. */
export interface GroupLedger {
  members: readonly Member[];
  expenses: readonly Expense[];
  transfers: readonly Transfer[];
}

/** Данные экрана «Группа». */
export interface GroupDetails extends GroupLedger {
  group: Group;
}

/** Строка списка «Мои группы» (FR-2.1). */
export interface GroupSummary {
  id: string;
  name: string;
  emoji: string;
  activeMembersCount: number;
  myBalanceKop: Kopecks;
  lastActivityAt: string;
}
