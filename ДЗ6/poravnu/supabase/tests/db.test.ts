// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateBalances } from '../../src/features/balances/calculateBalances';
import type { Expense, ExpenseSplit, Member } from '../../src/types/group';
import { createTestDb, sqlState, type TestDb } from './pgHarness';

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

interface Kazan {
  t: TestDb;
  groupId: string;
  token: string;
  anya: string;
  borya: string;
  vika: string;
  gosha: string;
}

/** Группа «Поездка в Казань» из UI-концепций ДЗ3, созданная через RPC и REST-операции. */
async function seedKazan(t: TestDb): Promise<Kazan> {
  const anya = await t.createUser('Аня');
  const borya = await t.createUser('Боря');
  const vika = await t.createUser('Вика');
  const gosha = await t.createUser('Гоша');

  await t.asUser(anya);
  const group = await t.db.query<{ id: string; invite_token: string }>(`select id, invite_token from public.create_group('Поездка в Казань', '🏙')`);
  const groupId = group.rows[0]?.id ?? '';
  const token = group.rows[0]?.invite_token ?? '';
  for (const user of [borya, vika, gosha]) {
    await t.asUser(user);
    await t.db.query(`select public.join_group($1)`, [token]);
  }

  const all = { kind: 'equal', memberIds: [anya, borya, vika, gosha] };
  await insertExpense(t, anya, groupId, 'Хостел', 1_200_000, anya, all);
  await insertExpense(t, borya, groupId, 'Продукты', 345_678, borya, all);
  await insertExpense(t, vika, groupId, 'Такси', 99_999, vika, { kind: 'equal', memberIds: [borya, vika, gosha] });
  await insertExpense(t, gosha, groupId, 'Кофе', 60_000, gosha, {
    kind: 'shares',
    shares: [
      { memberId: borya, weight: 1 },
      { memberId: gosha, weight: 2 },
    ],
  });
  await t.asAdmin();
  return { t, groupId, token, anya, borya, vika, gosha };
}

async function insertExpense(t: TestDb, as: string, groupId: string, title: string, amountKop: number, payerId: string, split: object) {
  await t.asUser(as);
  return t.db.query<{ id: string }>(
    `insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, $2, $3, $4, $5) returning id`,
    [groupId, title, amountKop, payerId, JSON.stringify(split)],
  );
}

async function balances(t: TestDb, as: string, groupId: string): Promise<Record<string, number>> {
  await t.asUser(as);
  const result = await t.db.query<{ member_id: string; balance_kop: string | number }>(`select * from public.group_balances($1)`, [groupId]);
  return Object.fromEntries(result.rows.map((row) => [row.member_id, Number(row.balance_kop)]));
}

describe('схема и миграции', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await createTestDb();
  });

  it('все 4 миграции применяются, профиль создаётся триггером при регистрации', async () => {
    const id = await t.createUser('Аня');
    const profile = await t.db.query<{ name: string; email: string }>(`select name, email from public.profiles where id = $1`, [id]);
    expect(profile.rows).toEqual([{ name: 'Аня', email: 'user1@example.com' }]);
  });

  it('CHECK-ограничения отклоняют неверные данные даже в обход интерфейса', async () => {
    const { groupId, anya } = await seedKazan(t);
    const all = { kind: 'equal', memberIds: [anya] };
    await expectSqlError(insertExpense(t, anya, groupId, 'Ноль', 0, anya, all), '23514');
    await expectSqlError(insertExpense(t, anya, groupId, 'Много', 100_000_001, anya, all), '23514');
    await expectSqlError(insertExpense(t, anya, groupId, '   ', 100, anya, all), '23514');
  });
});

describe('Row Level Security (ТЗ, раздел 3.1)', () => {
  let k: Kazan;
  beforeEach(async () => {
    k = await seedKazan(await createTestDb());
  });

  it('гость не видит ни одной таблицы', async () => {
    await k.t.asAnon();
    for (const table of ['profiles', 'groups', 'members', 'expenses', 'transfers']) {
      await expectSqlError(k.t.db.query(`select * from public.${table}`), '42501');
    }
  });

  it('чужой пользователь видит 0 строк и не может добавить расход в чужую группу (NFR-4)', async () => {
    const stranger = await k.t.createUser('Чужой');
    await k.t.asUser(stranger);
    for (const table of ['groups', 'members', 'expenses', 'transfers']) {
      const result = await k.t.db.query(`select * from public.${table}`);
      expect(result.rows, table).toHaveLength(0);
    }
    const profiles = await k.t.db.query(`select id, name from public.profiles`);
    expect(profiles.rows).toHaveLength(1);
    await expectSqlError(
      insertExpense(k.t, stranger, k.groupId, 'Взлом', 100, stranger, { kind: 'equal', memberIds: [stranger] }),
      '42501',
    );
    await expectSqlError(k.t.db.query(`select * from public.group_balances($1)`, [k.groupId]), 'PT403');
  });

  it('участник видит всю группу и профили остальных', async () => {
    await k.t.asUser(k.borya);
    expect((await k.t.db.query(`select * from public.expenses`)).rows).toHaveLength(4);
    expect((await k.t.db.query(`select * from public.members`)).rows).toHaveLength(4);
    expect((await k.t.db.query(`select id, name from public.profiles`)).rows).toHaveLength(4);
  });

  it('нельзя добавить расход от чужого имени', async () => {
    await k.t.asUser(k.borya);
    await expectSqlError(
      k.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split, created_by) values ($1, 'x', 100, $2, $3, $4)`, [
        k.groupId,
        k.borya,
        JSON.stringify({ kind: 'equal', memberIds: [k.borya] }),
        k.anya,
      ]),
      '42501',
    );
  });

  it('чужой расход нельзя ни изменить, ни удалить (AC-09.3): 0 затронутых строк', async () => {
    await k.t.asUser(k.borya);
    const updated = await k.t.db.query(`update public.expenses set amount_kop = 1 where title = 'Хостел'`);
    const deleted = await k.t.db.query(`delete from public.expenses where title = 'Хостел'`);
    expect(updated.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);
  });

  it('свой расход автор меняет, но группу и автора сменить нельзя', async () => {
    await k.t.asUser(k.borya);
    const updated = await k.t.db.query(`update public.expenses set amount_kop = 100000 where title = 'Продукты'`);
    expect(updated.affectedRows).toBe(1);
    await expectSqlError(k.t.db.query(`update public.expenses set created_by = $1 where title = 'Продукты'`, [k.anya]), '42501');
  });

  it('перевод отмечает только его участник (AC-08.2)', async () => {
    await k.t.asUser(k.borya);
    await expectSqlError(
      k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 100)`, [k.groupId, k.vika, k.anya]),
      '42501',
    );
    const ok = await k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 94075)`, [
      k.groupId,
      k.borya,
      k.anya,
    ]);
    expect(ok.affectedRows).toBe(1);
  });
});

describe('проверки расхода в триггере (ERR-1)', () => {
  let k: Kazan;
  beforeEach(async () => {
    k = await seedKazan(await createTestDb());
  });

  it.each([
    ['пустой список участников', { kind: 'equal', memberIds: [] }, 'empty_split'],
    ['повтор участника', { kind: 'equal', memberIds: ['A', 'A'] }, 'duplicate_member'],
    ['доля 0', { kind: 'shares', shares: [{ memberId: 'A', weight: 0 }] }, 'invalid_weight'],
    ['доля 1001', { kind: 'shares', shares: [{ memberId: 'A', weight: 1001 }] }, 'invalid_weight'],
  ])('%s', async (_label, split, message) => {
    const json = JSON.parse(JSON.stringify(split).replaceAll('"A"', `"${k.anya}"`)) as object;
    await expectSqlError(insertExpense(k.t, k.anya, k.groupId, 'Тест', 100, k.anya, json), '23514', message);
  });

  it('участник деления не из группы', async () => {
    const stranger = await k.t.createUser('Чужой');
    await expectSqlError(
      insertExpense(k.t, k.anya, k.groupId, 'Тест', 100, k.anya, { kind: 'equal', memberIds: [k.anya, stranger] }),
      '23514',
      'inactive_member',
    );
  });
});

describe('расчёт долей и балансов в SQL совпадает с фронтендом', () => {
  it('балансы «Поездки в Казань» — как в AC-07.1', async () => {
    const k = await seedKazan(await createTestDb());
    expect(await balances(k.t, k.borya, k.groupId)).toEqual({
      [k.anya]: 813_580,
      [k.borya]: -94_075,
      [k.vika]: -319_753,
      [k.gosha]: -399_752,
    });
  });

  it('1 000 ₽ на троих: лишняя копейка — тому, кто вступил раньше (AC-T3.3)', async () => {
    const t = await createTestDb();
    const a = await t.createUser('А');
    const b = await t.createUser('Б');
    const c = await t.createUser('В');
    await t.asUser(a);
    const token = (await t.db.query<{ invite_token: string }>(`select invite_token from public.create_group('Тест')`)).rows[0]?.invite_token;
    for (const user of [b, c]) {
      await t.asUser(user);
      await t.db.query(`select public.join_group($1)`, [token]);
    }
    await t.asUser(a);
    const groupId = (await t.db.query<{ id: string }>(`select id from public.groups`)).rows[0]?.id;
    const direct = await t.db.query<{ member_id: string; share_kop: string | number }>(
      `select * from private.expense_shares($1, 100000, $2::jsonb)`,
      [groupId, JSON.stringify({ kind: 'equal', memberIds: [c, b, a] })],
    );
    expect(Object.fromEntries(direct.rows.map((row) => [row.member_id, Number(row.share_kop)]))).toEqual({ [a]: 33_334, [b]: 33_333, [c]: 33_333 });
  });

  it('на 60 случайных расходах балансы SQL и TypeScript совпадают до копейки', async () => {
    const t = await createTestDb();
    const names = ['Аня', 'Боря', 'Вика', 'Гоша', 'Дима'];
    const ids: string[] = [];
    for (const name of names) {
      ids.push(await t.createUser(name));
    }
    await t.asUser(ids[0] ?? '');
    const group = (await t.db.query<{ id: string; invite_token: string }>(`select id, invite_token from public.create_group('Случайная')`)).rows[0];
    const groupId = group?.id ?? '';
    // Вступают в обратном порядке, чтобы порядок группы не совпадал с порядком id.
    for (const id of [...ids.slice(1)].reverse()) {
      await t.asUser(id);
      await t.db.query(`select public.join_group($1)`, [group?.invite_token]);
    }

    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    for (let index = 0; index < 60; index += 1) {
      const participants = ids.filter(() => random() > 0.35);
      const members = participants.length > 0 ? participants : [pick(ids)];
      const split: ExpenseSplit =
        index % 2 === 0
          ? { kind: 'equal', memberIds: members }
          : { kind: 'shares', shares: members.map((memberId) => ({ memberId, weight: 1 + Math.floor(random() * 7) })) };
      const author = pick(ids);
      await insertExpense(t, author, groupId, `Расход ${index}`, 1 + Math.floor(random() * 9_999_999), author, split);
    }

    await t.asUser(ids[0] ?? '');
    const memberRows = await t.db.query<{ user_id: string; joined_at: Date }>(
      `select user_id, joined_at from public.members where group_id = $1 order by joined_at, user_id`,
      [groupId],
    );
    const expenseRows = await t.db.query<{ id: string; amount_kop: string | number; payer_id: string; split: ExpenseSplit }>(
      `select id, amount_kop, payer_id, split from public.expenses where group_id = $1`,
      [groupId],
    );
    const members: Member[] = memberRows.rows.map((row) => ({ id: row.user_id, name: row.user_id, joinedAt: row.joined_at.toISOString(), leftAt: null }));
    const expenses: Expense[] = expenseRows.rows.map((row) => ({
      id: row.id,
      groupId,
      title: '',
      amountKop: Number(row.amount_kop),
      payerId: row.payer_id,
      split: row.split,
      date: '2026-10-16',
      createdBy: row.payer_id,
      createdAt: '',
    }));
    const tsBalances = Object.fromEntries(calculateBalances({ members, expenses, transfers: [] }).map((item) => [item.memberId, item.balanceKop]));

    const sqlBalances = await balances(t, ids[0] ?? '', groupId);
    expect(sqlBalances).toEqual(tsBalances);
    expect(Object.values(sqlBalances).reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});

describe('RPC: приглашения, выход, «Мои группы»', () => {
  let k: Kazan;
  beforeEach(async () => {
    k = await seedKazan(await createTestDb());
  });

  it('гость видит превью приглашения, а неверный токен даёт 404 (FR-2.3, ERR-8)', async () => {
    await k.t.asAnon();
    const preview = await k.t.db.query(`select * from public.get_invite_preview($1)`, [k.token]);
    expect(preview.rows).toEqual([{ group_name: 'Поездка в Казань', emoji: '🏙', members_count: 4 }]);
    await expectSqlError(k.t.db.query(`select * from public.get_invite_preview('nope')`), 'PT404', 'invalid_invite');
    await expectSqlError(k.t.db.query(`select public.join_group($1)`, [k.token]), '42501');
  });

  it('в группу больше 50 участников не вступить (ERR-12)', async () => {
    for (let index = 0; index < 46; index += 1) {
      const user = await k.t.createUser(`Гость ${index}`);
      await k.t.asUser(user);
      await k.t.db.query(`select public.join_group($1)`, [k.token]);
    }
    const late = await k.t.createUser('Опоздавший');
    await k.t.asUser(late);
    await expectSqlError(k.t.db.query(`select public.join_group($1)`, [k.token]), 'PT409', 'group_full');
  });

  it('выйти с долгом нельзя, в расчёте — можно; вернуться можно по ссылке (AC-11.1, AC-11.2, Q5)', async () => {
    await k.t.asUser(k.borya);
    await expectSqlError(k.t.db.query(`select public.leave_group($1)`, [k.groupId]), 'PT409', 'balance_not_zero');
    await k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 94075)`, [k.groupId, k.borya, k.anya]);
    await k.t.db.query(`select public.leave_group($1)`, [k.groupId]);
    expect((await k.t.db.query(`select * from public.expenses`)).rows).toHaveLength(0);

    await k.t.db.query(`select public.join_group($1)`, [k.token]);
    expect((await k.t.db.query(`select * from public.expenses`)).rows).toHaveLength(4);
  });

  it('владелец передаёт группу следующему; когда выходят все — группа скрывается (Q4)', async () => {
    const t = await createTestDb();
    const a = await t.createUser('А');
    const b = await t.createUser('Б');
    await t.asUser(a);
    const group = (await t.db.query<{ id: string; invite_token: string }>(`select id, invite_token from public.create_group('Пустая')`)).rows[0];
    await t.asUser(b);
    await t.db.query(`select public.join_group($1)`, [group?.invite_token]);
    await t.asUser(a);
    await t.db.query(`select public.leave_group($1)`, [group?.id]);
    await t.asAdmin();
    expect((await t.db.query(`select owner_id, hidden_at from public.groups`)).rows).toEqual([{ owner_id: b, hidden_at: null }]);
    await t.asUser(b);
    await t.db.query(`select public.leave_group($1)`, [group?.id]);
    await t.asAdmin();
    const hidden = await t.db.query<{ hidden_at: Date | null }>(`select hidden_at from public.groups`);
    expect(hidden.rows[0]?.hidden_at).not.toBeNull();
  });

  it('сбросить ссылку может только владелец (FR-2.5)', async () => {
    await k.t.asUser(k.borya);
    await expectSqlError(k.t.db.query(`select public.rotate_invite($1)`, [k.groupId]), 'PT403');
    await k.t.asUser(k.anya);
    const rotated = await k.t.db.query<{ rotate_invite: string }>(`select public.rotate_invite($1)`, [k.groupId]);
    expect(rotated.rows[0]?.rotate_invite).toMatch(/^[0-9a-f]{32}$/);
    await k.t.asAnon();
    await expectSqlError(k.t.db.query(`select * from public.get_invite_preview($1)`, [k.token]), 'PT404');
  });

  it('«Мои группы» возвращает свой баланс одним запросом (FR-2.1)', async () => {
    await k.t.asUser(k.borya);
    const rows = await k.t.db.query<{ name: string; active_members_count: number; my_balance_kop: string | number }>(
      `select name, active_members_count, my_balance_kop from public.my_groups()`,
    );
    expect(rows.rows.map((row) => ({ ...row, my_balance_kop: Number(row.my_balance_kop) }))).toEqual([
      { name: 'Поездка в Казань', active_members_count: 4, my_balance_kop: -94_075 },
    ]);
  });

  it('RPC без входа отвечают 401', async () => {
    await k.t.asUser('');
    await expectSqlError(k.t.db.query(`select * from public.my_groups()`), 'PT401', 'not_authenticated');
  });
});

describe('исправления по AI-ревью схемы (миграция 5)', () => {
  let k: Kazan;
  beforeEach(async () => {
    k = await seedKazan(await createTestDb());
  });

  /** Вика рассчитывается с Аней и выходит из группы. */
  async function vikaLeaves(): Promise<void> {
    await k.t.asUser(k.vika);
    await k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 319753)`, [k.groupId, k.vika, k.anya]);
    await k.t.db.query(`select public.leave_group($1)`, [k.groupId]);
  }

  it('1: расход, где вышедший — только плательщик, изменить и удалить нельзя (Q5, Q11)', async () => {
    // Аня вносит подарок, за который платила Вика; сама Вика в делении не участвует.
    await insertExpense(k.t, k.anya, k.groupId, 'Подарок', 2_000, k.vika, { kind: 'equal', memberIds: [k.anya, k.borya] });
    await k.t.asUser(k.vika);
    await k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 317753)`, [k.groupId, k.vika, k.anya]);
    await k.t.db.query(`select public.leave_group($1)`, [k.groupId]);
    await k.t.asUser(k.anya);
    expect((await k.t.db.query(`update public.expenses set amount_kop = 1 where title = 'Подарок'`)).affectedRows).toBe(0);
    expect((await k.t.db.query(`delete from public.expenses where title = 'Подарок'`)).affectedRows).toBe(0);
  });

  it('4: перевод с вышедшим участником удалить нельзя', async () => {
    await vikaLeaves();
    await k.t.asAdmin();
    await k.t.db.query(`update public.transfers set created_by = $1`, [k.anya]);
    await k.t.asUser(k.anya);
    expect((await k.t.db.query(`delete from public.transfers`)).affectedRows).toBe(0);
  });

  it('вышедшего нельзя указать в новом расходе или переводе', async () => {
    await vikaLeaves();
    await expectSqlError(
      insertExpense(k.t, k.anya, k.groupId, 'Ужин', 300, k.anya, { kind: 'equal', memberIds: [k.anya, k.vika] }),
      '23514',
      'inactive_member',
    );
    await k.t.asUser(k.anya);
    await expectSqlError(
      k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 100)`, [k.groupId, k.anya, k.vika]),
      '23514',
      'inactive_member',
    );
  });

  it('5: email других участников не читается', async () => {
    await k.t.asUser(k.borya);
    await expectSqlError(k.t.db.query(`select email from public.profiles`), '42501');
    expect((await k.t.db.query(`select id, name from public.profiles`)).rows).toHaveLength(4);
  });

  it('6: при вставке нельзя подменить created_at и id', async () => {
    await k.t.asUser(k.borya);
    await expectSqlError(
      k.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split, created_at) values ($1, 'x', 100, $2, $3, '2000-01-01')`, [
        k.groupId,
        k.borya,
        JSON.stringify({ kind: 'equal', memberIds: [k.borya] }),
      ]),
      '42501',
    );
    await expectSqlError(
      k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop, created_at) values ($1, $2, $3, 1, '2000-01-01')`, [k.groupId, k.borya, k.anya]),
      '42501',
    );
  });

  it.each([
    ['вес — дробное число', { kind: 'shares', shares: [{ memberId: 'A', weight: 1.5 }] }],
    ['id — не uuid', { kind: 'equal', memberIds: ['не-uuid'] }],
  ])('8: неверный split (%s) — понятная ошибка 23514', async (_label, split) => {
    const json = JSON.parse(JSON.stringify(split).replaceAll('"A"', `"${k.anya}"`)) as object;
    await expectSqlError(insertExpense(k.t, k.anya, k.groupId, 'Тест', 100, k.anya, json), '23514', 'invalid_split');
  });

  it('8: split без массива участников отклоняет CHECK', async () => {
    await expectSqlError(insertExpense(k.t, k.anya, k.groupId, 'Тест', 100, k.anya, { kind: 'equal', memberIds: 'all' }), '23514');
  });

  it('9: служебные функции убраны из схемы public (не видны в REST API)', async () => {
    await k.t.asAdmin();
    const rows = await k.t.db.query<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`,
    );
    expect(rows.rows.map((row) => row.name)).toEqual([
      'create_group',
      'get_invite_preview',
      'group_balances',
      'handle_new_user',
      'join_group',
      'leave_group',
      'lock_group_on_delete',
      'my_groups',
      'rotate_invite',
      'validate_expense',
      'validate_transfer',
    ]);
  });

  it('12: дата расхода — в разумных пределах', async () => {
    await k.t.asUser(k.anya);
    await expectSqlError(
      k.t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split, date) values ($1, 'Старое', 100, $2, $3, '1999-12-31')`, [
        k.groupId,
        k.anya,
        JSON.stringify({ kind: 'equal', memberIds: [k.anya] }),
      ]),
      '23514',
      'invalid_date',
    );
  });

  it('16: выход не-участника — 403, сброс ссылки бывшим владельцем — 403, скрытая группа не принимает', async () => {
    const stranger = await k.t.createUser('Чужой');
    await k.t.asUser(stranger);
    await expectSqlError(k.t.db.query(`select public.leave_group($1)`, [k.groupId]), 'PT403');

    const t = await createTestDb();
    const a = await t.createUser('А');
    await t.asUser(a);
    const group = (await t.db.query<{ id: string; invite_token: string }>(`select id, invite_token from public.create_group('Одна')`)).rows[0];
    await t.db.query(`select public.leave_group($1)`, [group?.id]);
    await expectSqlError(t.db.query(`select public.rotate_invite($1)`, [group?.id]), 'PT403');
    await expectSqlError(t.db.query(`select public.join_group($1)`, [group?.invite_token]), 'PT404', 'invalid_invite');
    expect((await t.db.query(`select * from public.my_groups()`)).rows).toHaveLength(0);
  });

  it('16: балансы SQL и TypeScript совпадают и с переводами, и с вышедшим участником', async () => {
    await vikaLeaves();
    await k.t.asUser(k.borya);
    await k.t.db.query(`insert into public.transfers (group_id, from_id, to_id, amount_kop) values ($1, $2, $3, 50000)`, [k.groupId, k.borya, k.anya]);
    await k.t.asAdmin();
    const members = (
      await k.t.db.query<{ user_id: string; joined_at: Date; left_at: Date | null }>(
        `select user_id, joined_at, left_at from public.members where group_id = $1 order by joined_at, user_id`,
        [k.groupId],
      )
    ).rows.map((row) => ({ id: row.user_id, name: row.user_id, joinedAt: row.joined_at.toISOString(), leftAt: row.left_at?.toISOString() ?? null }));
    const expenses = (
      await k.t.db.query<{ id: string; amount_kop: string | number; payer_id: string; split: ExpenseSplit }>(
        `select id, amount_kop, payer_id, split from public.expenses where group_id = $1`,
        [k.groupId],
      )
    ).rows.map((row) => ({ id: row.id, groupId: k.groupId, title: '', amountKop: Number(row.amount_kop), payerId: row.payer_id, split: row.split, date: '', createdBy: row.payer_id, createdAt: '' }));
    const transfers = (
      await k.t.db.query<{ id: string; from_id: string; to_id: string; amount_kop: string | number }>(
        `select id, from_id, to_id, amount_kop from public.transfers where group_id = $1`,
        [k.groupId],
      )
    ).rows.map((row) => ({ id: row.id, groupId: k.groupId, fromId: row.from_id, toId: row.to_id, amountKop: Number(row.amount_kop), createdBy: row.from_id, createdAt: '' }));
    const ts = Object.fromEntries(calculateBalances({ members, expenses, transfers }).map((item) => [item.memberId, item.balanceKop]));
    expect(await balances(k.t, k.borya, k.groupId)).toEqual(ts);
    expect(ts[k.vika]).toBe(0);
  });
});
