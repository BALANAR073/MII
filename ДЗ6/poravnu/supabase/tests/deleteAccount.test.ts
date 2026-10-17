// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTestDb, sqlState, type TestDb } from './pgHarness';

/** Миграция 7: удаление своего аккаунта (ДЗ6). */

async function count(t: TestDb, sql: string, params: unknown[] = []): Promise<number> {
  await t.asAdmin();
  const result = await t.db.query<{ n: string | number }>(sql, params);
  return Number(result.rows[0]?.n ?? 0);
}

/** Аня создаёт группу, Боря вступает по ссылке, Аня платит за обоих. */
async function seedShared(t: TestDb) {
  const anya = await t.createUser('Аня');
  const borya = await t.createUser('Боря');
  await t.asUser(anya);
  const group = (
    await t.db.query<{ id: string; invite_token: string }>(`select id, invite_token from public.create_group('Квартира', '🏠')`)
  ).rows[0];
  const groupId = group?.id ?? '';
  await t.asUser(borya);
  await t.db.query(`select public.join_group($1)`, [group?.invite_token]);
  await t.asUser(anya);
  await t.db.query(`insert into public.expenses (group_id, title, amount_kop, payer_id, split) values ($1, 'Аренда', 1000, $2, $3)`, [
    groupId,
    anya,
    JSON.stringify({ kind: 'equal', memberIds: [anya, borya] }),
  ]);
  return { anya, borya, groupId };
}

describe('удаление аккаунта (миграция 7)', () => {
  it('группа с другими участниками остаётся: место — без аккаунта, владение — следующему, балансы прежние', async () => {
    const t = await createTestDb();
    const { anya, borya, groupId } = await seedShared(t);
    await t.asUser(borya);
    const before = (await t.db.query<{ member_id: string; balance_kop: string }>(`select * from public.group_balances($1)`, [groupId]))
      .rows;

    await t.asUser(anya);
    await t.db.query(`select public.delete_my_account()`);

    expect(await count(t, `select count(*) n from auth.users where id = $1`, [anya])).toBe(0);
    expect(await count(t, `select count(*) n from public.profiles where id = $1`, [anya])).toBe(0);
    await t.asAdmin();
    const group = (await t.db.query<{ owner_id: string }>(`select owner_id from public.groups where id = $1`, [groupId])).rows[0];
    expect(group?.owner_id).toBe(borya);
    const place = (
      await t.db.query<{ is_virtual: boolean; display_name: string }>(
        `select is_virtual, display_name from public.members where user_id = $1`,
        [anya],
      )
    ).rows[0];
    expect(place).toEqual({ is_virtual: true, display_name: 'Аня' });

    await t.asUser(borya);
    const after = (await t.db.query<{ member_id: string; balance_kop: string }>(`select * from public.group_balances($1)`, [groupId])).rows;
    expect(after).toEqual(before);
  });

  it('группа, где больше никого нет, удаляется вместе с расходами', async () => {
    const t = await createTestDb();
    const solo = await t.createUser('Одиночка');
    await t.asUser(solo);
    const groupId = (await t.db.query<{ id: string }>(`select id from public.create_group('Мой бюджет', '💸')`)).rows[0]?.id;
    await t.db.query(`select public.add_member($1, 'Друг без аккаунта')`, [groupId]);
    await t.db.query(`select public.delete_my_account()`);

    expect(await count(t, `select count(*) n from public.groups where id = $1`, [groupId])).toBe(0);
    expect(await count(t, `select count(*) n from public.members where group_id = $1`, [groupId])).toBe(0);
  });

  it('гость удалить аккаунт не может', async () => {
    const t = await createTestDb();
    await t.asAnon();
    try {
      await t.db.query(`select public.delete_my_account()`);
      throw new Error('запрос прошёл');
    } catch (error) {
      expect(sqlState(error)).toBe('42501');
    }
  });
});
