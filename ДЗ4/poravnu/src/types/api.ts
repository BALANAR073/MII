import type { ExpenseSplit, MemberId } from './group';
import type { Kopecks } from './money';

/**
 * Контракт API, общий для mock-реализации (ДЗ4) и Supabase (ДЗ5).
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
  | 'balance-not-zero';

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
