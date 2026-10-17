import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { log } from '../lib/logger';
import { ApiError, type AuthApi, type AuthUser, type DataApi, type ExpenseInput, type OAuthProvider } from '../types/api';
import type { Expense, ExpenseSplit, Group, Member, Transfer } from '../types/group';
import type { Database, Json } from './database.types';
import { fromAuthError, fromPostgrestError, type RawSupabaseError } from './supabaseErrors';

/**
 * Реализация API на Supabase: таблицы — через автоматический REST (PostgREST),
 * операции над несколькими таблицами — через RPC из supabase/migrations/…_rpc.sql.
 * Права проверяет база (RLS), клиент только переводит ответы в типы приложения и ApiError.
 */

type Client = SupabaseClient<Database>;
type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type TransferRow = Database['public']['Tables']['transfers']['Row'];
type GroupRow = Database['public']['Tables']['groups']['Row'];

interface QueryResult<T> {
  data: T;
  error: RawSupabaseError | null;
  status: number;
}

/**
 * Создаёт клиент Supabase и обе реализации контракта.
 * @param url Project URL.
 * @param anonKey Публичный ключ (anon / publishable).
 * @returns Данные и авторизация.
 */
export function createSupabaseApis(url: string, anonKey: string): { data: DataApi; auth: AuthApi } {
  const client: Client = createClient<Database>(url, anonKey, {
    // PKCE: провайдер возвращает одноразовый code, а не токен в адресе — токен не попадёт в историю браузера и логи (ДЗ6).
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return { data: createDataApi(client), auth: createAuthApi(client, url, anonKey) };
}

function createDataApi(client: Client): DataApi {
  return {
    listGroups: async () => {
      const rows = await run('my_groups', client.rpc('my_groups'));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        activeMembersCount: row.active_members_count,
        myBalanceKop: Number(row.my_balance_kop),
        lastActivityAt: row.last_activity_at,
      }));
    },

    getGroup: async (groupId) => {
      const [group, members, expenses, transfers] = await Promise.all([
        runMaybe('group.get', client.from('groups').select('*').eq('id', groupId).maybeSingle()),
        run('members.list', client.from('members').select('*').eq('group_id', groupId).order('joined_at').order('user_id')),
        run(
          'expenses.list',
          client
            .from('expenses')
            .select('*')
            .eq('group_id', groupId)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false }),
        ),
        run('transfers.list', client.from('transfers').select('*').eq('group_id', groupId).order('created_at', { ascending: false })),
      ]);
      if (group === null) {
        // RLS скрывает чужую группу так же, как несуществующую: 0 строк, без ошибки.
        throw logged('group.get', new ApiError('not-found', 'Группа не найдена или недоступна'), 404);
      }
      const profiles = await run(
        'profiles.list',
        client
          .from('profiles')
          .select('id, name')
          .in(
            'id',
            members.map((member) => member.user_id),
          ),
      );
      const nameById = new Map(profiles.map((profile) => [profile.id, profile.name]));
      const memberList: Member[] = members.map((member) => ({
        id: member.user_id,
        // У участника без аккаунта имя хранится в самой строке участия (миграция 6).
        name: member.is_virtual ? (member.display_name ?? 'Участник') : (nameById.get(member.user_id) ?? 'Участник'),
        joinedAt: member.joined_at,
        leftAt: member.left_at,
        ...(member.is_virtual ? { isVirtual: true } : {}),
      }));
      return {
        group: toGroup(group, memberList),
        members: memberList,
        expenses: expenses.map(toExpense),
        transfers: transfers.map(toTransfer),
      };
    },

    createGroup: async ({ name, emoji }) => {
      const row = await run('create_group', client.rpc('create_group', { p_name: name, p_emoji: emoji }));
      return toGroup(row, []);
    },

    addExpense: async (groupId, input) =>
      toExpense(
        await run(
          'expenses.insert',
          client
            .from('expenses')
            .insert({ group_id: groupId, ...toExpenseColumns(input) })
            .select()
            .single(),
        ),
      ),

    updateExpense: async (groupId, expenseId, input) => {
      const rows = await run(
        'expenses.update',
        client.from('expenses').update(toExpenseColumns(input)).eq('id', expenseId).eq('group_id', groupId).select(),
      );
      const [row] = rows;
      if (row === undefined) {
        throw await explainEmptyWrite(client, 'expenses', expenseId, 'Этот расход уже удалён', 'Изменять можно только свои расходы');
      }
      return toExpense(row);
    },

    deleteExpense: async (groupId, expenseId) => {
      const rows = await run('expenses.delete', client.from('expenses').delete().eq('id', expenseId).eq('group_id', groupId).select('id'));
      if (rows.length === 0) {
        throw await explainEmptyWrite(client, 'expenses', expenseId, 'Этот расход уже удалён', 'Удалять можно только свои расходы');
      }
    },

    addTransfer: async (groupId, input) =>
      toTransfer(
        await run(
          'transfers.insert',
          client
            .from('transfers')
            .insert({ group_id: groupId, from_id: input.fromId, to_id: input.toId, amount_kop: input.amountKop })
            .select()
            .single(),
        ),
      ),

    deleteTransfer: async (groupId, transferId) => {
      const rows = await run(
        'transfers.delete',
        client.from('transfers').delete().eq('id', transferId).eq('group_id', groupId).select('id'),
      );
      if (rows.length === 0) {
        throw await explainEmptyWrite(client, 'transfers', transferId, 'Перевод уже удалён', 'Удалить перевод может только его автор');
      }
    },

    leaveGroup: async (groupId) => {
      await runVoid('leave_group', client.rpc('leave_group', { p_group: groupId }));
    },

    getInviteLink: async (groupId) => {
      const row = await run('group.invite_token', client.from('groups').select('invite_token').eq('id', groupId).single());
      return `${window.location.origin}/join/${row.invite_token}`;
    },

    getInvitePreview: async (token) => {
      const [rows, places] = await Promise.all([
        run('get_invite_preview', client.rpc('get_invite_preview', { p_token: token })),
        run('get_invite_members', client.rpc('get_invite_members', { p_token: token })),
      ]);
      const [row] = rows;
      if (row === undefined) {
        throw new ApiError('invalid-invite', 'Приглашение недействительно. Попросите новую ссылку');
      }
      return {
        groupName: row.group_name,
        emoji: row.emoji,
        membersCount: row.members_count,
        places: places.map((place) => ({ memberId: place.member_id, name: place.name })),
      };
    },

    joinGroup: async (token) => run('join_group', client.rpc('join_group', { p_token: token })),

    claimMember: async (token, memberId) => run('claim_member', client.rpc('claim_member', { p_token: token, p_member: memberId })),

    addMember: async (groupId, name) => {
      const id = await run('add_member', client.rpc('add_member', { p_group: groupId, p_name: name }));
      return { id, name: name.trim(), joinedAt: new Date().toISOString(), leftAt: null, isVirtual: true };
    },

    renameMember: async (groupId, memberId, name) => {
      await runVoid('rename_member', client.rpc('rename_member', { p_group: groupId, p_member: memberId, p_name: name }));
    },

    removeMember: async (groupId, memberId) => {
      await runVoid('remove_member', client.rpc('remove_member', { p_group: groupId, p_member: memberId }));
    },

    updateGroup: async (groupId, { name, emoji }) => {
      await runVoid('update_group', client.rpc('update_group', { p_group: groupId, p_name: name, p_emoji: emoji }));
    },

    rotateInvite: async (groupId) => {
      const token = await run('rotate_invite', client.rpc('rotate_invite', { p_group: groupId }));
      return `${window.location.origin}/join/${token}`;
    },
  };
}

function createAuthApi(client: Client, url: string, anonKey: string): AuthApi {
  return {
    getUser: async () => {
      const { data, error } = await client.auth.getSession();
      if (error !== null) {
        throw loggedAuth('auth.session', error);
      }
      return toAuthUser(data.session);
    },
    onChange: (listener) => {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        log('info', 'auth.state_changed', { authEvent: event });
        listener(toAuthUser(session));
      });
      return () => data.subscription.unsubscribe();
    },
    signUp: async ({ email, password, name }) => {
      const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
      if (error !== null) {
        throw loggedAuth('auth.sign_up', error);
      }
      const user = toAuthUser(data.session);
      if (user === null) {
        // Сессии нет, если в проекте включено подтверждение email (по ТЗ, решение Q7, оно выключено).
        throw loggedAuth('auth.sign_up', { code: 'email_not_confirmed', message: 'Email confirmation required' });
      }
      return user;
    },
    signIn: async ({ email, password }) => {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error !== null) {
        throw loggedAuth('auth.sign_in', error);
      }
      const user = toAuthUser(data.session);
      if (user === null) {
        throw loggedAuth('auth.sign_in', { message: 'No session after sign in' });
      }
      return user;
    },
    signOut: async () => {
      const { error } = await client.auth.signOut();
      if (error !== null) {
        throw loggedAuth('auth.sign_out', error);
      }
    },
    oauthProviders: async () => {
      // Публичные настройки Auth: какие провайдеры включены в панели Supabase. Сбой — просто без кнопок.
      try {
        const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: anonKey } });
        const settings: unknown = response.ok ? await response.json() : null;
        return enabledProviders(settings);
      } catch {
        return [];
      }
    },
    updateName: async (name) => {
      const trimmed = name.trim();
      const { data: session } = await client.auth.getSession();
      const userId = session.session?.user.id;
      if (userId === undefined) {
        throw loggedAuth('auth.update_name', { status: 401, message: 'No session' });
      }
      // Имя видят другие участники — в таблице profiles; имя в шапке — в метаданных сессии.
      await runVoid('profiles.update', client.from('profiles').update({ name: trimmed }).eq('id', userId));
      const { data, error } = await client.auth.updateUser({ data: { name: trimmed } });
      if (error !== null) {
        throw loggedAuth('auth.update_name', error);
      }
      return userFromSupabase(data.user);
    },
    signInWithOAuth: async (provider, next) => {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      log('info', 'auth.oauth_started', { provider });
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error !== null) {
        throw loggedAuth('auth.oauth', error);
      }
    },
  };
}

const KNOWN_PROVIDERS: readonly OAuthProvider[] = ['google'];

/**
 * Провайдеры, включённые в настройках Supabase Auth (`GET /auth/v1/settings` → `external`).
 * @param settings Ответ сервера.
 */
export function enabledProviders(settings: unknown): OAuthProvider[] {
  if (typeof settings !== 'object' || settings === null || !('external' in settings)) {
    return [];
  }
  const external: unknown = settings.external;
  if (typeof external !== 'object' || external === null) {
    return [];
  }
  return KNOWN_PROVIDERS.filter((provider) => provider in external && Reflect.get(external, provider) === true);
}

async function run<T>(op: string, query: PromiseLike<QueryResult<T>>): Promise<NonNullable<T>> {
  const result = await runMaybe(op, query);
  if (result === null || result === undefined) {
    throw logged(op, new ApiError('not-found', 'Нет данных'), 404);
  }
  return result;
}

async function runMaybe<T>(op: string, query: PromiseLike<QueryResult<T>>): Promise<T> {
  let result: QueryResult<T>;
  try {
    result = await query;
  } catch (error) {
    throw logged(op, fromPostgrestError({ message: error instanceof Error ? error.message : String(error) }, 0), 0);
  }
  if (result.error !== null) {
    throw logged(op, fromPostgrestError(result.error, result.status), result.status, result.error.code);
  }
  return result.data;
}

async function runVoid(op: string, query: PromiseLike<QueryResult<unknown>>): Promise<void> {
  await runMaybe(op, query);
}

/**
 * RLS не сообщает, почему UPDATE/DELETE не затронул строк: запись удалена или она чужая.
 * Различаем повторным чтением: не видна — удалена (ERR-10), видна — нет прав (ERR-7).
 */
async function explainEmptyWrite(
  client: Client,
  table: 'expenses' | 'transfers',
  id: string,
  goneText: string,
  forbiddenText: string,
): Promise<ApiError> {
  const visible = await runMaybe(`${table}.exists`, client.from(table).select('id').eq('id', id).maybeSingle());
  return visible === null
    ? logged(table, new ApiError('conflict', goneText), 409)
    : logged(table, new ApiError('forbidden', forbiddenText), 403);
}

function logged(op: string, error: ApiError, status: number, code?: string): ApiError {
  log(error.kind === 'network' || error.kind === 'server' ? 'error' : 'warn', 'api.request_failed', {
    op,
    status,
    code: code ?? null,
    kind: error.kind,
    message: error.message,
  });
  return error;
}

function loggedAuth(op: string, raw: RawSupabaseError): ApiError {
  const error = fromAuthError(raw);
  log(error.kind === 'network' || error.kind === 'server' ? 'error' : 'warn', 'auth.request_failed', {
    op,
    status: raw.status ?? null,
    code: raw.code ?? null,
    kind: error.kind,
  });
  return error;
}

function toAuthUser(session: Session | null): AuthUser | null {
  return session === null ? null : userFromSupabase(session.user);
}

function userFromSupabase(user: User): AuthUser {
  const metaName: unknown = user.user_metadata.name;
  const email = user.email ?? '';
  return { id: user.id, email, name: typeof metaName === 'string' && metaName.trim() !== '' ? metaName : (email.split('@')[0] ?? '') };
}

function toGroup(row: GroupRow, members: Member[]): Group {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    ownerId: row.owner_id,
    inviteToken: row.invite_token,
    members,
    createdAt: row.created_at,
  };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    amountKop: Number(row.amount_kop),
    payerId: row.payer_id,
    split: parseSplit(row.split),
    date: row.date,
    category: row.category,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    groupId: row.group_id,
    fromId: row.from_id,
    toId: row.to_id,
    amountKop: Number(row.amount_kop),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toExpenseColumns(input: ExpenseInput) {
  return {
    title: input.title,
    amount_kop: input.amountKop,
    payer_id: input.payerId,
    split: splitToJson(input.split),
    date: input.date,
    category: input.category ?? null,
  };
}

function splitToJson(split: ExpenseSplit): Json {
  return split.kind === 'equal'
    ? { kind: 'equal', memberIds: split.memberIds }
    : { kind: 'shares', shares: split.shares.map((share) => ({ memberId: share.memberId, weight: share.weight })) };
}

/**
 * Разбирает split из jsonb. Структуру гарантирует триггер validate_expense, но клиент не доверяет ей вслепую.
 * @param value Значение колонки split.
 * @returns Способ деления.
 * @throws {ApiError} Если формат неожиданный.
 */
export function parseSplit(value: Json): ExpenseSplit {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const { kind, memberIds, shares } = value;
    if (kind === 'equal' && Array.isArray(memberIds) && memberIds.every((id) => typeof id === 'string')) {
      return { kind: 'equal', memberIds: memberIds.filter((id): id is string => typeof id === 'string') };
    }
    if (kind === 'shares' && Array.isArray(shares)) {
      const parsed = shares.flatMap((share) =>
        typeof share === 'object' &&
        share !== null &&
        !Array.isArray(share) &&
        typeof share.memberId === 'string' &&
        typeof share.weight === 'number'
          ? [{ memberId: share.memberId, weight: share.weight }]
          : [],
      );
      if (parsed.length === shares.length) {
        return { kind: 'shares', shares: parsed };
      }
    }
  }
  throw new ApiError('server', 'Неожиданный формат деления расхода');
}
