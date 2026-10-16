import { calculateBalances } from '../features/balances/calculateBalances';
import { getSplitMemberIds } from '../features/balances/getExpenseShares';
import { MAX_AMOUNT_KOP } from '../lib/money';
import { ApiError, type ApiErrorKind, type ExpenseInput, type InvitePreview, type TransferInput } from '../types/api';
import type { Expense, Group, GroupDetails, GroupSummary, MemberId, Transfer } from '../types/group';
import { mockUserId, mockUserName } from './mockAuth';
import { createSeed, type MockDb } from './seed';

/**
 * Mock-API: тот же контракт DataApi, что у Supabase. Используется в автотестах и в демо без бэкенда
 * (когда не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY). Повторяет поведение бэкенда:
 * задержку сети, коды ошибок и проверки прав из матрицы RLS (ТЗ, раздел 3.1).
 */

interface MockControl {
  /** Задержка ответа, мс. */
  latencyMs: number;
  /** Ошибка, которой завершится следующий запрос (затем сбрасывается). */
  failNext: ApiErrorKind | null;
  /** Ошибка для всех запросов до момента `failUntil` (демо-режимы `?mock=error`, `?mock=server`). */
  failUntilKind: ApiErrorKind | null;
  failUntil: number;
}

const STORAGE_KEY = 'poravnu:db:v1';
const DEFAULT_LATENCY_MS = 450;
const MAX_MEMBERS = 50;

const control: MockControl = { latencyMs: DEFAULT_LATENCY_MS, failNext: null, failUntilKind: null, failUntil: 0 };
let db: MockDb = loadDb();
let idCounter = 0;

/**
 * Меняет поведение mock-API: задержку и принудительную ошибку следующего запроса.
 * Используется в тестах и в демо-режимах `?mock=…` (см. README).
 * @param patch Поля, которые нужно изменить.
 */
export function configureMockApi(patch: Partial<MockControl>): void {
  Object.assign(control, patch);
}

/**
 * Возвращает базу к исходным демо-данным (или к переданным) и очищает сохранённую копию.
 * @param next Данные, которыми заменить базу.
 */
export function resetMockDb(next: MockDb = createSeed()): void {
  db = structuredClone(next);
  saveDb();
}

/** Список групп текущего пользователя, недавние сверху (FR-2.1). */
export async function listGroups(): Promise<GroupSummary[]> {
  await respond();
  return db.groups
    .filter((group) => isActiveMember(group, mockUserId()))
    .map((group) => {
      const details = collectDetails(group);
      const myBalance = calculateBalances(details).find((balance) => balance.memberId === mockUserId());
      return {
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        activeMembersCount: group.members.filter((member) => member.leftAt === null).length,
        myBalanceKop: myBalance?.balanceKop ?? 0,
        lastActivityAt: lastActivity(details),
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/** Группа со всеми расходами и переводами; 404 — нет группы, 403 — пользователь не участник. */
export async function getGroup(groupId: string): Promise<GroupDetails> {
  await respond();
  return structuredClone(collectDetails(requireMemberGroup(groupId)));
}

/** Создаёт группу; создатель становится участником и владельцем (FR-2.2). */
export async function createGroup(input: { name: string; emoji: string }): Promise<Group> {
  await respond();
  const name = input.name.trim();
  if (name.length < 1 || name.length > 50) {
    throw new ApiError('validation', 'Название — от 1 до 50 символов');
  }
  const now = new Date().toISOString();
  const group: Group = {
    id: nextId('g'),
    name,
    emoji: input.emoji,
    ownerId: mockUserId(),
    inviteToken: nextId('inv'),
    createdAt: now,
    members: [{ id: mockUserId(), name: mockUserName(), joinedAt: now, leftAt: null }],
  };
  db.groups.push(group);
  saveDb();
  return structuredClone(group);
}

/** Добавляет расход (FR-3.2); проверки повторяют CHECK-ограничения таблицы `expenses`. */
export async function addExpense(groupId: string, input: ExpenseInput): Promise<Expense> {
  await respond();
  const group = requireMemberGroup(groupId);
  assertExpenseInput(group, input);
  const expense: Expense = {
    id: nextId('e'),
    groupId,
    ...structuredClone(input),
    title: input.title.trim(),
    createdBy: mockUserId(),
    createdAt: new Date().toISOString(),
  };
  db.expenses.push(expense);
  saveDb();
  return structuredClone(expense);
}

/** Изменяет свой расход (FR-3.5); чужой — 403, удалённый — конфликт (ERR-10). */
export async function updateExpense(groupId: string, expenseId: string, input: ExpenseInput): Promise<Expense> {
  await respond();
  const group = requireMemberGroup(groupId);
  const expense = requireEditableExpense(group, expenseId);
  assertExpenseInput(group, input);
  Object.assign(expense, structuredClone(input), { title: input.title.trim() });
  saveDb();
  return structuredClone(expense);
}

/** Удаляет свой расход (FR-3.5). */
export async function deleteExpense(groupId: string, expenseId: string): Promise<void> {
  await respond();
  const group = requireMemberGroup(groupId);
  requireEditableExpense(group, expenseId);
  db.expenses = db.expenses.filter((expense) => expense.id !== expenseId);
  saveDb();
}

/** Отмечает перевод; доступно только отправителю и получателю (FR-5.1). */
export async function addTransfer(groupId: string, input: TransferInput): Promise<Transfer> {
  await respond();
  const group = requireMemberGroup(groupId);
  if (input.fromId !== mockUserId() && input.toId !== mockUserId()) {
    throw new ApiError('forbidden', 'Отметить перевод могут только его участники');
  }
  if (input.fromId === input.toId || !isActiveMember(group, input.fromId) || !isActiveMember(group, input.toId)) {
    throw new ApiError('validation', 'Неверные участники перевода');
  }
  if (!Number.isSafeInteger(input.amountKop) || input.amountKop <= 0) {
    throw new ApiError('validation', 'Сумма перевода должна быть больше нуля');
  }
  const transfer: Transfer = {
    id: nextId('t'),
    groupId,
    ...input,
    createdBy: mockUserId(),
    createdAt: new Date().toISOString(),
  };
  db.transfers.push(transfer);
  saveDb();
  return structuredClone(transfer);
}

/** Удаляет ошибочно отмеченный перевод; только автор (Q2). */
export async function deleteTransfer(groupId: string, transferId: string): Promise<void> {
  await respond();
  requireMemberGroup(groupId);
  const transfer = db.transfers.find((item) => item.id === transferId && item.groupId === groupId);
  if (transfer === undefined) {
    throw new ApiError('conflict', 'Перевод уже удалён');
  }
  if (transfer.createdBy !== mockUserId()) {
    throw new ApiError('forbidden', 'Удалить перевод может только его автор');
  }
  db.transfers = db.transfers.filter((item) => item.id !== transferId);
  saveDb();
}

/** Выход из группы только при нулевом балансе (FR-2.4, AC-11.2). */
export async function leaveGroup(groupId: string): Promise<void> {
  await respond();
  const group = requireMemberGroup(groupId);
  const balance = calculateBalances(collectDetails(group)).find((item) => item.memberId === mockUserId());
  const balanceKop = balance?.balanceKop ?? 0;
  if (balanceKop !== 0) {
    throw new ApiError('balance-not-zero', 'Сначала рассчитайтесь', balanceKop);
  }
  const me = group.members.find((member) => member.id === mockUserId());
  if (me !== undefined) {
    me.leftAt = new Date().toISOString();
  }
  // Владелец передаёт группу участнику, вступившему раньше всех (Q4).
  if (group.ownerId === mockUserId()) {
    const heir = group.members.find((member) => member.leftAt === null);
    if (heir !== undefined) {
      group.ownerId = heir.id;
    }
  }
  saveDb();
}

/** Ссылка-приглашение в группу (FR-2.3). */
export async function getInviteLink(groupId: string): Promise<string> {
  await respond();
  const group = requireMemberGroup(groupId);
  return `${window.location.origin}/join/${group.inviteToken}`;
}

/** Превью приглашения (FR-2.3). */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  await respond();
  const group = db.groups.find((item) => item.inviteToken === token);
  if (group === undefined) {
    throw new ApiError('invalid-invite', 'Приглашение недействительно. Попросите новую ссылку');
  }
  return { groupName: group.name, emoji: group.emoji, membersCount: group.members.filter((member) => member.leftAt === null).length };
}

/** Вступление по ссылке; вышедший участник возвращается (Q5), лимит — 50 (Q9). */
export async function joinGroup(token: string): Promise<string> {
  await respond();
  const group = db.groups.find((item) => item.inviteToken === token);
  if (group === undefined) {
    throw new ApiError('invalid-invite', 'Приглашение недействительно. Попросите новую ссылку');
  }
  const me = group.members.find((member) => member.id === mockUserId());
  if (me !== undefined && me.leftAt === null) {
    return group.id;
  }
  if (group.members.filter((member) => member.leftAt === null).length >= MAX_MEMBERS) {
    throw new ApiError('group-full', 'В группе уже 50 участников');
  }
  if (me === undefined) {
    group.members.push({ id: mockUserId(), name: mockUserName(), joinedAt: new Date().toISOString(), leftAt: null });
  } else {
    me.leftAt = null;
  }
  saveDb();
  return group.id;
}

async function respond(): Promise<void> {
  if (control.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, control.latencyMs));
  }
  const failure = control.failNext ?? (Date.now() < control.failUntil ? control.failUntilKind : null);
  if (failure !== null) {
    control.failNext = null;
    throw new ApiError(failure, failure === 'network' ? 'Network request failed' : `Mock failure: ${failure}`);
  }
}

function collectDetails(group: Group): GroupDetails {
  return {
    group,
    members: group.members,
    expenses: db.expenses.filter((expense) => expense.groupId === group.id),
    transfers: db.transfers.filter((transfer) => transfer.groupId === group.id),
  };
}

function requireMemberGroup(groupId: string): Group {
  const group = db.groups.find((item) => item.id === groupId);
  if (group === undefined) {
    throw new ApiError('not-found', 'Группа не найдена');
  }
  if (!isActiveMember(group, mockUserId())) {
    throw new ApiError('forbidden', 'Нет доступа к группе');
  }
  return group;
}

function requireEditableExpense(group: Group, expenseId: string): Expense {
  const expense = db.expenses.find((item) => item.id === expenseId && item.groupId === group.id);
  if (expense === undefined) {
    throw new ApiError('conflict', 'Этот расход уже удалён');
  }
  if (expense.createdBy !== mockUserId()) {
    throw new ApiError('forbidden', 'Изменять можно только свои расходы');
  }
  const hasLeftMember = getSplitMemberIds(expense.split).some((id) => !isActiveMember(group, id));
  if (hasLeftMember) {
    throw new ApiError('forbidden', 'В расходе есть вышедший участник — изменить его нельзя');
  }
  return expense;
}

function assertExpenseInput(group: Group, input: ExpenseInput): void {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 60) {
    throw new ApiError('validation', 'Название — от 1 до 60 символов');
  }
  if (!Number.isSafeInteger(input.amountKop) || input.amountKop < 1 || input.amountKop > MAX_AMOUNT_KOP) {
    throw new ApiError('validation', 'Сумма вне допустимого диапазона');
  }
  const memberIds = getSplitMemberIds(input.split);
  if (memberIds.length === 0 || new Set(memberIds).size !== memberIds.length) {
    throw new ApiError('validation', 'Неверный список участников деления');
  }
  if (![input.payerId, ...memberIds].every((id) => isActiveMember(group, id))) {
    throw new ApiError('validation', 'Участник не состоит в группе');
  }
}

function isActiveMember(group: Group, memberId: MemberId): boolean {
  return group.members.some((member) => member.id === memberId && member.leftAt === null);
}

function lastActivity(details: GroupDetails): string {
  const dates = [
    details.group.createdAt,
    ...details.expenses.map((expense) => expense.createdAt),
    ...details.transfers.map((transfer) => transfer.createdAt),
  ];
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function loadDb(): MockDb {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved);
      if (isMockDb(parsed)) {
        return parsed;
      }
    }
  } catch {
    // localStorage недоступен (приватный режим) или данные повреждены — работаем на демо-данных.
  }
  return createSeed();
}

function saveDb(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Сохранение — только удобство демо; без него приложение работает в памяти.
  }
}

function isMockDb(value: unknown): value is MockDb {
  return (
    typeof value === 'object' &&
    value !== null &&
    'groups' in value &&
    'expenses' in value &&
    'transfers' in value &&
    Array.isArray(value.groups) &&
    Array.isArray(value.expenses) &&
    Array.isArray(value.transfers)
  );
}
