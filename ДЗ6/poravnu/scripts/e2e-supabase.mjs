// ДЗ5 · End-to-end проверка API на живом проекте Supabase (Шаг 8).
// Запуск:  node scripts/e2e-supabase.mjs            — полный прогон на новых тестовых пользователях
//          node scripts/e2e-supabase.mjs --seed-demo — создать (или обновить) демо-группу «Поездка в Казань»
// Адрес и публичный ключ берутся из .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
// Отчёт сохраняется в ../api_tests/e2e_results.md: каждая проверка — запрос, HTTP-статус, результат.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  throw new Error('Нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в .env.local');
}

const SEED_DEMO = process.argv.includes('--seed-demo');
const run = Date.now().toString(36);
const results = [];

function client() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function check(name, request, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ ok: true, name, request, detail: detail ?? '', ms: Date.now() - started });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ ok: false, name, request, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
    console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function signUpOrIn(name, email, password) {
  const c = client();
  const signIn = await c.auth.signInWithPassword({ email, password });
  if (!signIn.error) {
    return { c, id: signIn.data.user.id };
  }
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { name } } });
  if (error) {
    throw new Error(`signUp ${email}: ${error.code ?? ''} ${error.message}`);
  }
  expect(data.session, 'нет сессии после signUp — включено подтверждение email?');
  return { c, id: data.user.id };
}

const users = {};
const names = { anya: 'Аня', borya: 'Боря', vika: 'Вика', gosha: 'Гоша' };
const password = SEED_DEMO ? 'Demo-pass-2026' : `E2e-${run}-pass`;
for (const [key, name] of Object.entries(names)) {
  const email = SEED_DEMO ? `${key}.poravnu.demo@example.com` : `e2e-${run}-${key}@example.com`;
  await check(`Регистрация ${name}`, `POST /auth/v1/signup {email: "${email}", data: {name: "${name}"}}`, async () => {
    users[key] = await signUpOrIn(name, email, password);
    return `user.id = ${users[key].id.slice(0, 8)}…, профиль создан триггером`;
  });
}
const { anya, borya, vika, gosha } = users;
if (!anya || !borya || !vika || !gosha) {
  throw new Error('Не удалось зарегистрировать пользователей — дальше проверять нечего');
}

let groupId = '';
let token = '';
await check('Создание группы (RPC create_group)', 'POST /rest/v1/rpc/create_group {p_name, p_emoji}', async () => {
  const { data, error, status } = await anya.c.rpc('create_group', { p_name: 'Поездка в Казань', p_emoji: '🏙' });
  expect(!error, error?.message);
  groupId = data.id;
  token = data.invite_token;
  return `HTTP ${status}, group.id = ${groupId.slice(0, 8)}…`;
});

for (const key of ['borya', 'vika', 'gosha']) {
  await check(`Вступление по ссылке: ${names[key]} (RPC join_group)`, 'POST /rest/v1/rpc/join_group {p_token}', async () => {
    const { data, error, status } = await users[key].c.rpc('join_group', { p_token: token });
    expect(!error && data === groupId, error?.message ?? 'не та группа');
    return `HTTP ${status}`;
  });
}

const all = { kind: 'equal', memberIds: [anya.id, borya.id, vika.id, gosha.id] };
const expenses = [
  [anya, 'Хостел', 1_200_000, all, '2026-10-10'],
  [borya, 'Продукты', 345_678, all, '2026-10-10'],
  [vika, 'Такси', 99_999, { kind: 'equal', memberIds: [borya.id, vika.id, gosha.id] }, '2026-10-11'],
  [
    gosha,
    'Кофе',
    60_000,
    {
      kind: 'shares',
      shares: [
        { memberId: borya.id, weight: 1 },
        { memberId: gosha.id, weight: 2 },
      ],
    },
    '2026-10-12',
  ],
];
let hostelId = '';
for (const [payer, title, amount, split, date] of expenses) {
  await check(
    `Создание расхода «${title}» (CREATE)`,
    'POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}',
    async () => {
      const { data, error, status } = await payer.c
        .from('expenses')
        .insert({ group_id: groupId, title, amount_kop: amount, payer_id: payer.id, split, date })
        .select()
        .single();
      expect(!error, error?.message);
      if (title === 'Хостел') hostelId = data.id;
      return `HTTP ${status}, created_by = автор (auth.uid())`;
    },
  );
}

await check('Чтение группы участником (READ)', 'GET /rest/v1/expenses?group_id=eq.<id>&order=date.desc', async () => {
  const { data, error, status } = await borya.c.from('expenses').select('*').eq('group_id', groupId).order('date', { ascending: false });
  expect(!error && data.length === 4, error?.message ?? `строк: ${data?.length}`);
  return `HTTP ${status}, 4 расхода`;
});

await check('Балансы как в AC-07.1 (RPC group_balances)', 'POST /rest/v1/rpc/group_balances {p_group}', async () => {
  const { data, error } = await borya.c.rpc('group_balances', { p_group: groupId });
  expect(!error, error?.message);
  const byId = Object.fromEntries(data.map((row) => [row.member_id, Number(row.balance_kop)]));
  const expected = { [anya.id]: 813_580, [borya.id]: -94_075, [vika.id]: -319_753, [gosha.id]: -399_752 };
  expect(
    JSON.stringify(byId) === JSON.stringify(Object.fromEntries(Object.keys(expected).map((id) => [id, byId[id]]))) &&
      Object.entries(expected).every(([id, v]) => byId[id] === v),
    JSON.stringify(byId),
  );
  return 'Аня +8 135,80 · Боря −940,75 · Вика −3 197,53 · Гоша −3 997,52 ₽ — сумма 0';
});

if (!SEED_DEMO) {
  await check('Изменение своего расхода (UPDATE)', 'PATCH /rest/v1/expenses?id=eq.<id> {title}', async () => {
    const { data, error, status } = await anya.c.from('expenses').update({ title: 'Хостел (2 ночи)' }).eq('id', hostelId).select();
    expect(!error && data.length === 1, error?.message ?? 'строка не изменилась');
    return `HTTP ${status}, 1 строка`;
  });

  await check('Чужой расход изменить нельзя (RLS)', 'PATCH /rest/v1/expenses?id=eq.<чужой> — от Бори', async () => {
    const { data, error, status } = await borya.c.from('expenses').update({ amount_kop: 1 }).eq('id', hostelId).select();
    expect(!error && data.length === 0, error?.message ?? 'чужой расход изменился!');
    return `HTTP ${status}, 0 строк — RLS отфильтровал`;
  });

  await check('Неверные данные отклоняет база (CHECK, 23514)', 'POST /rest/v1/expenses {amount_kop: 0}', async () => {
    const { error, status } = await borya.c
      .from('expenses')
      .insert({ group_id: groupId, title: 'Ноль', amount_kop: 0, payer_id: borya.id, split: all });
    expect(error?.code === '23514', `ожидался 23514, получено ${error?.code}`);
    return `HTTP ${status}, code ${error.code}`;
  });

  await check('Пустой список участников (триггер, 23514)', 'POST /rest/v1/expenses {split: {memberIds: []}}', async () => {
    const { error, status } = await borya.c
      .from('expenses')
      .insert({ group_id: groupId, title: 'Пусто', amount_kop: 100, payer_id: borya.id, split: { kind: 'equal', memberIds: [] } });
    expect(error?.code === '23514' && error.message === 'empty_split', `${error?.code} ${error?.message}`);
    return `HTTP ${status}, ${error.message}: «${error.hint}»`;
  });

  const stranger = await signUpOrIn('Чужой', `e2e-${run}-stranger@example.com`, password);
  await check('Чужой пользователь не видит группу (RLS)', 'GET /rest/v1/expenses — от постороннего', async () => {
    const { data, error, status } = await stranger.c.from('expenses').select('*').eq('group_id', groupId);
    expect(!error && data.length === 0, error?.message ?? `видно строк: ${data.length}`);
    return `HTTP ${status}, 0 строк`;
  });

  await check('Чужой пользователь не может добавить расход (RLS, 42501)', 'POST /rest/v1/expenses — от постороннего', async () => {
    const { error, status } = await stranger.c
      .from('expenses')
      .insert({
        group_id: groupId,
        title: 'Взлом',
        amount_kop: 100,
        payer_id: stranger.id,
        split: { kind: 'equal', memberIds: [stranger.id] },
      });
    expect(error?.code === '42501', `ожидался 42501, получено ${error?.code}`);
    return `HTTP ${status}, code ${error.code}`;
  });

  await check('Гость без входа не читает таблицы (401/42501)', 'GET /rest/v1/groups — только с apikey', async () => {
    const { error, status } = await client().from('groups').select('*');
    expect(error?.code === '42501', `ожидался 42501, получено ${error?.code}`);
    return `HTTP ${status}, ${error.message}`;
  });

  await check('Гость видит превью приглашения (RPC get_invite_preview)', 'POST /rest/v1/rpc/get_invite_preview {p_token}', async () => {
    const { data, error, status } = await client().rpc('get_invite_preview', { p_token: token });
    expect(!error && data[0]?.members_count === 4, error?.message);
    return `HTTP ${status}, «${data[0].group_name}», 4 участника`;
  });

  await check('Неверная ссылка — 404 (ERR-8)', 'POST /rest/v1/rpc/get_invite_preview {p_token: "nope"}', async () => {
    const { error, status } = await client().rpc('get_invite_preview', { p_token: 'nope' });
    expect(status === 404 && error?.message === 'invalid_invite', `${status} ${error?.message}`);
    return `HTTP ${status}, ${error.message}`;
  });

  await check('Выход с долгом запрещён (RPC leave_group, 409)', 'POST /rest/v1/rpc/leave_group {p_group} — от Бори', async () => {
    const { error, status } = await borya.c.rpc('leave_group', { p_group: groupId });
    expect(
      status === 409 && error?.message === 'balance_not_zero' && error.details === '-94075',
      `${status} ${error?.message} ${error?.details}`,
    );
    return `HTTP ${status}, долг ${error.details} коп.`;
  });

  let transferId = '';
  await check('Отметка перевода Боря → Аня (CREATE transfers)', 'POST /rest/v1/transfers {from_id, to_id, amount_kop: 94075}', async () => {
    const { data, error, status } = await borya.c
      .from('transfers')
      .insert({ group_id: groupId, from_id: borya.id, to_id: anya.id, amount_kop: 94_075 })
      .select()
      .single();
    expect(!error, error?.message);
    transferId = data.id;
    return `HTTP ${status}`;
  });

  await check('Перевод за других отметить нельзя (RLS)', 'POST /rest/v1/transfers {from: Вика, to: Аня} — от Бори', async () => {
    const { error, status } = await borya.c
      .from('transfers')
      .insert({ group_id: groupId, from_id: vika.id, to_id: anya.id, amount_kop: 100 });
    expect(error?.code === '42501', `ожидался 42501, получено ${error?.code}`);
    return `HTTP ${status}, code ${error.code}`;
  });

  await check('«Мои группы» со своим балансом (RPC my_groups)', 'POST /rest/v1/rpc/my_groups', async () => {
    const { data, error, status } = await borya.c.rpc('my_groups');
    expect(!error && data.length === 1 && Number(data[0].my_balance_kop) === 0, error?.message ?? JSON.stringify(data));
    return `HTTP ${status}, баланс Бори 0 после перевода`;
  });

  await check('Удаление своего перевода (DELETE)', 'DELETE /rest/v1/transfers?id=eq.<id>', async () => {
    const { data, error, status } = await borya.c.from('transfers').delete().eq('id', transferId).select('id');
    expect(!error && data.length === 1, error?.message ?? 'не удалено');
    return `HTTP ${status}`;
  });

  await check('Удаление своего расхода (DELETE)', 'DELETE /rest/v1/expenses?id=eq.<id>', async () => {
    const { data, error, status } = await anya.c.from('expenses').delete().eq('id', hostelId).select('id');
    expect(!error && data.length === 1, error?.message ?? 'не удалено');
    return `HTTP ${status}`;
  });

  await check('Email других участников не читается (права на колонки)', 'GET /rest/v1/profiles?select=email — от Бори', async () => {
    const { error, status } = await borya.c.from('profiles').select('email');
    expect(error?.code === '42501', `ожидался 42501, получено ${error?.code}`);
    return `HTTP ${status}, code ${error.code}`;
  });

  await check(
    'Нельзя подменить created_at при вставке (права на колонки)',
    'POST /rest/v1/transfers {created_at: "2000-01-01"}',
    async () => {
      const { error, status } = await borya.c
        .from('transfers')
        .insert({ group_id: groupId, from_id: borya.id, to_id: anya.id, amount_kop: 1, created_at: '2000-01-01T00:00:00Z' });
      expect(error?.code === '42501', `ожидался 42501, получено ${error?.code}`);
      return `HTTP ${status}, code ${error.code}`;
    },
  );

  await check('Служебные функции не опубликованы в API (схема private)', 'POST /rest/v1/rpc/is_active_member', async () => {
    const { error, status } = await borya.c.rpc('is_active_member', { p_group: groupId });
    expect(status === 404 && error?.code === 'PGRST202', `HTTP ${status} ${error?.code}`);
    return `HTTP ${status}, ${error.code} — функция не найдена в схеме public`;
  });

  await check('Истёкший / поддельный токен — 401', 'GET /rest/v1/groups с Authorization: Bearer <поддельный JWT>', async () => {
    const response = await fetch(`${URL}/rest/v1/groups?select=id`, {
      headers: { apikey: KEY, Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid' },
    });
    expect(response.status === 401, `HTTP ${response.status}`);
    return `HTTP ${response.status}`;
  });

  await check(
    'CORS: preflight с чужого origin разрешён, защита — на RLS',
    'OPTIONS /rest/v1/expenses, Origin: http://localhost:5173',
    async () => {
      const response = await fetch(`${URL}/rest/v1/expenses`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'apikey,authorization,content-type',
        },
      });
      const allow = response.headers.get('access-control-allow-origin');
      expect(response.ok && allow !== null, `HTTP ${response.status}, allow-origin ${allow}`);
      return `HTTP ${response.status}, Access-Control-Allow-Origin: ${allow}`;
    },
  );
}

const passed = results.filter((r) => r.ok).length;
const lines = [
  `# ДЗ5. End-to-end проверка API на Supabase`,
  '',
  `- Дата: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  `- Проект: ${URL.replace(/^https:\/\//, '').split('.')[0]}`,
  `- Режим: ${SEED_DEMO ? 'создание демо-группы' : 'полный прогон на новых тестовых пользователях'}`,
  `- Итог: **${passed} из ${results.length}** проверок прошли`,
  '',
  '| № | Проверка | Запрос | Результат | мс |',
  '|---|---|---|---|---|',
  ...results.map(
    (r, i) => `| ${i + 1} | ${r.ok ? '✅' : '❌'} ${r.name} | \`${r.request}\` | ${String(r.detail).replaceAll('|', '/')} | ${r.ms} |`,
  ),
  '',
];
if (!SEED_DEMO) {
  mkdirSync(join(root, '..', 'api_tests'), { recursive: true });
  writeFileSync(join(root, '..', 'api_tests', 'e2e_results.md'), lines.join('\n'));
}
console.log(`\n${passed} / ${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
