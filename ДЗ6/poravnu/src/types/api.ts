import type { Expense, ExpenseSplit, Group, GroupDetails, GroupSummary, Member, MemberId, Transfer } from './group';
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
  | 'auth-email-taken'
  | 'already-member'
  | 'place-taken';

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
  category?: string | null;
}

export interface TransferInput {
  fromId: MemberId;
  toId: MemberId;
  amountKop: Kopecks;
}

/** Свободное место в группе: участник без аккаунта, которого можно занять по ссылке (ДЗ6). */
export interface InvitePlace {
  memberId: MemberId;
  name: string;
}

export interface InvitePreview {
  groupName: string;
  emoji: string;
  membersCount: number;
  /** Участники без аккаунта — гость может выбрать «Это я». */
  places: InvitePlace[];
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
  /** Вступить, заняв место участника без аккаунта; возвращает id группы (ДЗ6). */
  claimMember: (token: string, memberId: MemberId) => Promise<string>;
  /** Добавить участника по имени — без аккаунта (ДЗ6). */
  addMember: (groupId: string, name: string) => Promise<Member>;
  renameMember: (groupId: string, memberId: MemberId, name: string) => Promise<void>;
  /** Убрать участника без аккаунта; только при нулевом балансе. */
  removeMember: (groupId: string, memberId: MemberId) => Promise<void>;
  /** Название и эмодзи — только владелец. */
  updateGroup: (groupId: string, input: { name: string; emoji: string }) => Promise<void>;
  /** Новая ссылка-приглашение, старая перестаёт работать — только владелец; возвращает ссылку. */
  rotateInvite: (groupId: string) => Promise<string>;
}

export interface AuthUser {
  id: MemberId;
  email: string;
  name: string;
}

/** Вход и регистрация (FR-1.1). */
/** Внешние провайдеры входа (OAuth 2.0 через Supabase Auth, ДЗ6). */
export type OAuthProvider = 'google';

export interface AuthApi {
  getUser: () => Promise<AuthUser | null>;
  /** Подписка на вход и выход; возвращает функцию отписки. */
  onChange: (listener: (user: AuthUser | null) => void) => () => void;
  signUp: (input: { email: string; password: string; name: string }) => Promise<AuthUser>;
  signIn: (input: { email: string; password: string }) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  /** Какие внешние провайдеры включены в проекте (показываем только их кнопки). */
  oauthProviders: () => Promise<OAuthProvider[]>;
  /**
   * Уводит браузер на страницу провайдера; после входа он вернётся на `/auth/callback?next=…`.
   * @param provider Провайдер.
   * @param next Внутренний адрес, куда вернуть пользователя после входа.
   */
  signInWithOAuth: (provider: OAuthProvider, next: string) => Promise<void>;
  /** Новое имя: видно в группах и в шапке (ДЗ6, профиль). */
  updateName: (name: string) => Promise<AuthUser>;
  /**
   * Удаляет аккаунт (ДЗ6, миграция 7): группы, где больше никого нет, удаляются, в остальных место
   * становится участником без аккаунта. После этого сессия завершается.
   */
  deleteAccount: () => Promise<void>;
}
