import type { Expense, ExpenseSplit, Group, GroupDetails, GroupSummary, MemberId, Transfer } from './group';
import type { Kopecks } from './money';

/**
 * Контракт API, общий для mock-реализации (ДЗ4, тесты и демо) и Supabase (ДЗ5).
 * Вынесен из src/mocks по итогам AI-ревью кода (находка 20): UI зависит от контракта, а не от mock-а.
 */

export type ApiErrorKind =
  | 'network'
  | 'server'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'balance-not-zero'
  | 'invalid-invite'
  | 'group-full'
  | 'auth-invalid-credentials'
  | 'auth-email-taken';

/** Ошибка API с типом — по нему UI выбирает сообщение из раздела 6 ТЗ. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly amountKop: Kopecks | null;

  constructor(kind: ApiErrorKind, message: string, amountKop: Kopecks | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.amountKop = amountKop;
  }
}

export interface ExpenseInput {
  title: string;
  amountKop: Kopecks;
  payerId: MemberId;
  split: ExpenseSplit;
  date: string;
}

export interface TransferInput {
  fromId: MemberId;
  toId: MemberId;
  amountKop: Kopecks;
}

export interface InvitePreview {
  groupName: string;
  emoji: string;
  membersCount: number;
}

/** Операции с данными. Реализации: src/mocks/mockApi.ts и src/api/supabaseApi.ts. */
export interface DataApi {
  listGroups: () => Promise<GroupSummary[]>;
  getGroup: (groupId: string) => Promise<GroupDetails>;
  createGroup: (input: { name: string; emoji: string }) => Promise<Group>;
  addExpense: (groupId: string, input: ExpenseInput) => Promise<Expense>;
  updateExpense: (groupId: string, expenseId: string, input: ExpenseInput) => Promise<Expense>;
  deleteExpense: (groupId: string, expenseId: string) => Promise<void>;
  addTransfer: (groupId: string, input: TransferInput) => Promise<Transfer>;
  deleteTransfer: (groupId: string, transferId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  getInviteLink: (groupId: string) => Promise<string>;
  getInvitePreview: (token: string) => Promise<InvitePreview>;
  joinGroup: (token: string) => Promise<string>;
}

export interface AuthUser {
  id: MemberId;
  email: string;
  name: string;
}

/** Вход и регистрация (FR-1.1). */
export interface AuthApi {
  getUser: () => Promise<AuthUser | null>;
  /** Подписка на вход и выход; возвращает функцию отписки. */
  onChange: (listener: (user: AuthUser | null) => void) => () => void;
  signUp: (input: { email: string; password: string; name: string }) => Promise<AuthUser>;
  signIn: (input: { email: string; password: string }) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}
