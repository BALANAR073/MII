// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, sqlState, type TestDb } from './pgHarness';

/**
 * Миграция 6: участники без аккаунта, перехват места по ссылке, настройки группы (ДЗ6).
 */

async function expectSqlError(promise: Promise<unknown>, code: string, message?: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(sqlState(error)).toBe(code);
    if (message !== undefined) {
      expect(error instanceof Error ? error.message : '').toContain(message);
    }
    return;
  }
  throw new Error(`Ожидалась ошибка ${code}, но запрос прошёл`);
}

interface Trip {
  t: TestDb;
  me: string;
  groupId: string;
  token: string;
  anya: string;
  borya: string;
}

/** Пользователь создаёт группу и добавляет двух участников по имени. */
async function seedTrip(): Promise<Trip> {
  const t = await createTestDb();
  const me = await t.createUser('Дима');
  await t.asUser(me);
  const group = (await t.db.query<{ id: string; invite_token: string }>(`select id, invite_token from public.create_group('Поход', '🏕')`))
    .rows[0];
  const groupId = group?.id ?? '';
  const anya = (await t.db.query<{ add_member: string }>(`select public.add_member($1, 'Аня')`, [groupId])).rows[0]?.add_member ?? '';
  const borya = (await t.db.query<{ add_member: string }>(`select public.add_member($1, '  Боря ')`, [groupId])).rows[0]?.add_member ?? '';
  return { t, me, groupId, token: group?.invite_token ?? '', anya, borya };
}

async function balances(t: TestDb, as: string, groupId: string): Promise<Record<string, number>> {
  await t.asUser(as);
  const result = await t.db.query<{ member_id: string; balance_kop: string | number }>(`select * from public.group_balances($1)`, [
    groupId,
  ]);
  return Object.fromEntries(result.rows.map((row) => [row.member_id, Number(row.balance_kop)]));
}

describe('участники без аккаунта (миграция 6)', () => {
  let s: Trip;
  beforeEach(async () => {
    s = await seedTrip();
  });

  it('добавляются по имени, видны в группе, участвуют в расходе как плательщик и в делении', async () => {
    const members = await s.t.db.query<{ is_virtual: boolean; display_name: string | null }>(
      `select is_virtual, display_name from public.members where group_id = $1 order by joined_at`,
      [s.groupId],
    );
    expect(members.rows).toEqual([
      { is_virtual: false, display_name: null },
      { is_virtual: true, display_name: 'Аня' },
      { is_virtual: true, display_name: 'Боря' },
    ]);

    // Аня заплатила 900 ₽ за троих — расход вносит Дима.
    await s.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, 'Палатка', 90000, $2, $3)`, [
      s.groupId,
      s.anya,
      JSON.stringify({ kind: 'equal', memberIds: [s.me, s.anya, s.borya] }),
    ]);
    expect(await balances(s.t, s.me, s.groupId)).toEqual({ [s.me]: -30000, [s.anya]: 60000, [s.borya]: -30000 });
  });

  it('перевод с участником без аккаунта может отметить любой участник; между двумя зарегистрированными — только сторона', async () => {
    await s.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 100)`, [
      s.groupId,
      s.borya,
      s.anya,
    ]);
    const other = await s.t.createUser('Вика');
    await s.t.asUser(other);
    await s.t.db.query(`select public.join_group($1)`, [s.token]);
    await s.t.asUser(s.me);
    // Дима не может отметить перевод от Вики самой себе-другому зарегистрированному — только участник перевода.
    const third = await s.t.createUser('Гоша');
    await s.t.asUser(third);
    await s.t.db.query(`select public.join_group($1)`, [s.token]);
    await s.t.asUser(s.me);
    await expectSqlError(
      s.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 100)`, [s.groupId, other, third]),
      '42501',
    );
  });

  it('имя проверяется, лимит 50 участников действует, чужой добавить не может', async () => {
    await expectSqlError(s.t.db.query(`select public.add_member($1, '   ')`, [s.groupId]), '23514', 'invalid_name');
    for (let index = 0; index < 47; index += 1) {
      await s.t.db.query(`select public.add_member($1, $2)`, [s.groupId, `Гость ${index}`]);
    }
    await expectSqlError(s.t.db.query(`select public.add_member($1, 'Лишний')`, [s.groupId]), 'PT409', 'group_full');
    const stranger = await s.t.createUser('Чужой');
    await s.t.asUser(stranger);
    await expectSqlError(s.t.db.query(`select public.add_member($1, 'Взлом')`, [s.groupId]), 'PT403');
  });

  it('переименовать и убрать можно только участника без аккаунта; убрать — при нулевом балансе', async () => {
    await s.t.db.query(`select public.rename_member($1, $2, 'Анна')`, [s.groupId, s.anya]);
    await expectSqlError(s.t.db.query(`select public.rename_member($1, $2, 'Дмитрий')`, [s.groupId, s.me]), 'PT409', 'not_virtual');

    await s.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, 'Еда', 1000, $2, $3)`, [
      s.groupId,
      s.me,
      JSON.stringify({ kind: 'equal', memberIds: [s.me, s.anya] }),
    ]);
    await expectSqlError(s.t.db.query(`select public.remove_member($1, $2)`, [s.groupId, s.anya]), 'PT409', 'balance_not_zero');
    await s.t.db.query(`select public.remove_member($1, $2)`, [s.groupId, s.borya]);
    await expectSqlError(s.t.db.query(`select public.remove_member($1, $2)`, [s.groupId, s.me]), 'PT409', 'not_virtual');
    const active = await s.t.db.query<{ display_name: string | null }>(
      `select display_name from public.members where group_id = $1 and left_at is null order by joined_at`,
      [s.groupId],
    );
    expect(active.rows.map((row) => row.display_name)).toEqual([null, 'Анна']);
  });
});

describe('перехват места по ссылке (миграция 6)', () => {
  let s: Trip;
  beforeEach(async () => {
    s = await seedTrip();
    // Аня заплатила 900 ₽ за троих, Боря отдал Ане 100 ₽.
    await s.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, 'Палатка', 90000, $2, $3)`, [
      s.groupId,
      s.anya,
      JSON.stringify({ kind: 'shares', shares: [{ memberId: s.me, weight: 1 }, { memberId: s.anya, weight: 1 }, { memberId: s.borya, weight: 1 }] }),
    ]);
    await s.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 10000)`, [
      s.groupId,
      s.borya,
      s.anya,
    ]);
  });

  it('гость видит свободные места по ссылке', async () => {
    await s.t.asAnon();
    const places = await s.t.db.query(`select * from public.get_invite_members($1)`, [s.token]);
    expect(places.rows).toEqual([
      { member_id: s.anya, name: 'Аня' },
      { member_id: s.borya, name: 'Боря' },
    ]);
    await expectSqlError(s.t.db.query(`select * from public.get_invite_members('nope')`), 'PT404', 'invalid_invite');
  });

  it('аккаунт забирает место со всей историей: плательщик, деление и перевод переезжают, балансы не меняются', async () => {
    const before = await balances(s.t, s.me, s.groupId);
    const anyaAccount = await s.t.createUser('Аня Петрова');
    await s.t.asUser(anyaAccount);
    const joined = await s.t.db.query<{ claim_member: string }>(`select public.claim_member($1, $2)`, [s.token, s.anya]);
    expect(joined.rows[0]?.claim_member).toBe(s.groupId);

    const after = await balances(s.t, anyaAccount, s.groupId);
    expect(after).toEqual({ [s.me]: before[s.me], [anyaAccount]: before[s.anya], [s.borya]: before[s.borya] });

    const expense = await s.t.db.query<{ payer_id: string; split: { shares: { memberId: string }[] } }>(
      `select payer_id, split from public.expenses where group_id = $1`,
      [s.groupId],
    );
    expect(expense.rows[0]?.payer_id).toBe(anyaAccount);
    expect(JSON.stringify(expense.rows[0]?.split)).not.toContain(s.anya);
    const transfer = await s.t.db.query<{ to_id: string }>(`select to_id from public.transfers where group_id = $1`, [s.groupId]);
    expect(transfer.rows[0]?.to_id).toBe(anyaAccount);

    const member = await s.t.db.query<{ is_virtual: boolean; display_name: string | null }>(
      `select is_virtual, display_name from public.members where group_id = $1 and user_id = $2`,
      [s.groupId, anyaAccount],
    );
    expect(member.rows).toEqual([{ is_virtual: false, display_name: null }]);
    // Теперь Аня — обычный участник: расход от своего имени проходит проверку триггера.
    await s.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, 'Чай', 300, $2, $3)`, [
      s.groupId,
      anyaAccount,
      JSON.stringify({ kind: 'equal', memberIds: [anyaAccount, s.me] }),
    ]);
  });

  it('занятое место и повторное вступление отклоняются', async () => {
    const first = await s.t.createUser('Первый');
    await s.t.asUser(first);
    await s.t.db.query(`select public.claim_member($1, $2)`, [s.token, s.anya]);
    await expectSqlError(s.t.db.query(`select public.claim_member($1, $2)`, [s.token, s.borya]), 'PT409', 'already_member');

    const second = await s.t.createUser('Второй');
    await s.t.asUser(second);
    await expectSqlError(s.t.db.query(`select public.claim_member($1, $2)`, [s.token, s.anya]), 'PT409', 'not_virtual');
    await expectSqlError(s.t.db.query(`select public.claim_member($1, $2)`, [s.token, s.me]), 'PT409', 'not_virtual');
  });

  it('без флага перехвата проверка расходов работает как раньше', async () => {
    await expectSqlError(
      s.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, 'Чужой', 100, $2, $3)`, [
        s.groupId,
        s.me,
        JSON.stringify({ kind: 'equal', memberIds: ['00000000-0000-4000-8000-999999999999'] }),
      ]),
      '23514',
      'inactive_member',
    );
  });
});

describe('настройки группы (миграция 6)', () => {
  it('переименовать и сменить эмодзи может только владелец', async () => {
    const s = await seedTrip();
    await s.t.db.query(`select public.update_group($1, 'Поход на Эльбрус', '✈️')`, [s.groupId]);
    const row = await s.t.db.query(`select name, emoji from public.groups where id = $1`, [s.groupId]);
    expect(row.rows).toEqual([{ name: 'Поход на Эльбрус', emoji: '✈️' }]);
    const other = await s.t.createUser('Вика');
    await s.t.asUser(other);
    await s.t.db.query(`select public.join_group($1)`, [s.token]);
    await expectSqlError(s.t.db.query(`select public.update_group($1, 'Взлом', null)`, [s.groupId]), 'PT403');
  });

  it('удаление аккаунта убирает его участие, участники без аккаунта остаются', async () => {
    const s = await seedTrip();
    const other = await s.t.createUser('Вика');
    await s.t.asUser(other);
    await s.t.db.query(`select public.join_group($1)`, [s.token]);
    await s.t.asAdmin();
    await s.t.db.query(`delete from auth.users where id = $1`, [other]);
    const left = await s.t.db.query(`select count(*)::int as n from public.members where group_id = $1`, [s.groupId]);
    expect(left.rows).toEqual([{ n: 3 }]);
  });
});
