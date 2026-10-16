import type { MemberId } from '../../types/group';
import type { Kopecks } from '../../types/money';

export interface MemberShare {
  memberId: MemberId;
  amountKop: Kopecks;
}

/** Баланс участника: > 0 — ему должны, < 0 — он должен. */
export interface MemberBalance {
  memberId: MemberId;
  balanceKop: Kopecks;
}

export interface SuggestedTransfer {
  fromId: MemberId;
  toId: MemberId;
  amountKop: Kopecks;
}

export type BalanceStatus = 'owed' | 'owes' | 'settled';
