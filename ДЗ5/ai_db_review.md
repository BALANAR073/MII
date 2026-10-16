# ДЗ5. AI-ревью схемы БД и политик RLS

- Дата запуска: 2026-10-16 20:17
- Claude Code: 2.1.301 (Claude Code)
- Режим: claude -p (неинтерактивный), запрещены Edit, Write, NotebookEdit, Bash
- Рабочая папка: ДЗ5
- Время ответа: 199 с

## Промпт

```text
Role: ты — senior-инженер по PostgreSQL и Supabase, специалист по безопасности (RLS, security definer, права ролей) и производительности SQL.
Task: проведи ревью схемы БД в папке poravnu/supabase/migrations (4 миграции) и тестов poravnu/supabase/tests/db.test.ts. Проверь: 1) дыры в RLS и правах ролей anon/authenticated (можно ли прочитать или изменить чужие данные, обойти проверки через REST или RPC); 2) функции security definer — search_path, проверки прав внутри, утечки данных; 3) целостность данных: ограничения, внешние ключи, триггеры, гонки (одновременное вступление, выход, вставка); 4) корректность расчёта долей и балансов в SQL (сравни с poravnu/src/lib/splitByWeights.ts); 5) производительность (индексы, лишние пересчёты в group_balances и my_groups); 6) соответствие ТЗ ../ДЗ3/technical_specification.md (разделы 3 и 3.1); 7) чего не хватает в тестах.
Context: MVP «ПоРовну» (делёж расходов), Supabase (PostgreSQL + PostgREST + Auth), фронтенд обращается к таблицам напрямую через supabase-js с публичным ключом, поэтому вся защита — в базе. Схему сгенерировал AI-агент; она прошла 24 автотеста на PGlite и 31 e2e-запрос к живому проекту.
Format: ответ на русском в Markdown:
1) таблица находок: № | файл:строка | категория | проблема | серьёзность (высокая/средняя/низкая) | как исправить (с SQL, если нужно);
2) что сделано хорошо (до 5 пунктов);
3) три самых важных исправления;
4) итоговая оценка схемы по 10-балльной шкале с коротким обоснованием.
Файлы не изменяй — только ответ.
```

## Сырой ответ агента
# Ревью схемы БД «ПоРовну» (4 миграции и `db.test.ts`)

Короткий вывод: защита от чужаков сделана надёжно. Главные проблемы в другом: можно нарушить правило «вышедший участник уходит с нулевым балансом», есть гонки при выходе из группы, а email участников виден любому, кто вступил по ссылке.

## 1. Таблица находок

Пути даны относительно `poravnu/supabase/`. Миграции: `001` — schema, `002` — functions, `003` — rpc, `004` — rls.

| № | файл:строка | категория | проблема | серьёзность | как исправить |
|---|---|---|---|---|---|
| 1 | `migrations/…002_functions.sql:150-163` | целостность, Q5 | `expense_has_left_member` проверяет только участников деления, а плательщика нет. По Q11 плательщик может не входить в деление (например, подарок). Если он вышел, автор всё равно может изменить или удалить расход. Тогда у вышедшего появляется ненулевой баланс, и погасить его нельзя, потому что перевод возможен только между активными участниками. | **высокая** | Добавить плательщика в проверку: `cross join lateral (select sw.member_id from public.split_weights(e.split) sw union select e.payer_id) p join public.members m on m.group_id = e.group_id and m.user_id = p.member_id where e.id = p_expense and m.left_at is not null` |
| 2 | `migrations/…003_rpc.sql:107-112` и `…002_functions.sql:168, 225` | гонка | `leave_group` считает баланс, а `left_at` ставит отдельной командой и без блокировки. Параллельно другой участник может добавить или удалить расход либо перевод с этим человеком: триггер ещё видит его активным. После обеих транзакций человек выходит с долгом, что нарушает AC-11.2. | **высокая** | Advisory-блокировка на группу. В триггерах `expenses`/`transfers`: `perform pg_advisory_xact_lock_shared(hashtextextended(new.group_id::text, 0))`. Добавить такие же `BEFORE DELETE`-триггеры с `old.group_id`. В `leave_group`/`join_group` первой командой: `perform pg_advisory_xact_lock(hashtextextended(p_group::text, 0))`. Подробнее — в разделе 3. |
| 3 | `migrations/…003_rpc.sql:114-124` | гонка | Два последних участника выходят одновременно. В режиме READ COMMITTED каждый видит другого активным: группа не скрывается (нарушение Q4), а `owner_id` может достаться уже вышедшему. Блокировка `FOR UPDATE` есть в `join_group`, но не в `leave_group`. | средняя | Это закрывает та же эксклюзивная блокировка из п. 2, либо `perform 1 from public.groups where id = p_group for update;` в начале `leave_group`. |
| 4 | `migrations/…004_rls.sql:63-65` | RLS, целостность | Удалить перевод может его автор, даже если отправитель или получатель уже вышел. Баланс вышедшего становится ненулевым — та же проблема, что в п. 1, только для переводов. | средняя | `using (created_by = auth.uid() and public.is_active_member(group_id) and not exists (select 1 from public.members m where m.group_id = transfers.group_id and m.user_id in (from_id, to_id) and m.left_at is not null))` |
| 5 | `migrations/…004_rls.sql:14, 24-26` и `…001_schema.sql:9` | утечка данных | `profiles.email` отдаётся всем участникам общих групп, в том числе вышедшим. Достаточно знать ссылку-приглашение, чтобы вступить и собрать email до 50 человек. Фронтенд email из `profiles` не читает (`supabaseApi.ts:63` берёт только `id, name`), то есть это поле открыто зря. | средняя | `revoke select on public.profiles from authenticated; grant select (id, name, created_at) on public.profiles to authenticated;`. Свой email брать из `auth.getUser()`. Ещё лучше удалить колонку, потому что она к тому же устаревает при смене email. |
| 6 | `migrations/…004_rls.sql:18, 21` | права | `grant insert` выдан на все колонки, поэтому клиент может прислать свои `created_at`, `updated_at`, `id`. Подделка `created_at` меняет порядок ленты (Q12), дату перевода в истории (FR-5.2) и `last_activity_at` в «Моих группах». | средняя | `grant insert (group_id, title, amount_kop, payer_id, split, category, date) on public.expenses to authenticated; grant insert (group_id, from_id, to_id, amount_kop) on public.transfers to authenticated;` |
| 7 | `migrations/…002_functions.sql:59-105, 109-147` и `…003_rpc.sql:168` | производительность | Из-за `set search_path` SQL-функции `split_weights`/`expense_shares` не встраиваются в запрос и вызываются по разу на каждый расход, и каждый раз заново соединяются с `members`. `my_groups` вызывает `group_balances` для каждой группы, считает балансы всех участников и оставляет одну строку. Получается G×E вызовов на каждый запрос списка групп. Для MVP (до 50 расходов) это терпимо, при росте — нет. | средняя | (а) Хранить доли отдельной таблицей `expense_parts(expense_id, member_id, weight, share_kop)`, заполнять её в триггере при записи. Это заодно даёт настоящие внешние ключи на участников деления вместо jsonb. (б) Тогда баланс — это простые `sum … group by`. Для `my_groups` — отдельный запрос только по `v_user` без `group_balances`. |
| 8 | `migrations/…001_schema.sql:45` и `…002_functions.sql:65-68` | целостность | `split` проверяется только по `kind`. Если вес `1.5` или `"abc"`, а `memberIds` содержит не uuid или вообще не массив, база возвращает `22P02`/`22023` вместо `23514` с понятной подсказкой. Лишние ключи (`shares` при `kind: 'equal'`) молча игнорируются. | низкая | Добавить CHECK: `jsonb_typeof(split -> case split->>'kind' when 'equal' then 'memberIds' else 'shares' end) = 'array'` и проверку состава ключей `(select array_agg(k order by k) from jsonb_object_keys(split) k)`. В триггере ловить `invalid_text_representation` и превращать её в `23514 invalid_split`. |
| 9 | `migrations/…004_rls.sql:70-76` | поверхность API | Служебные функции `is_active_member`, `shares_group`, `expense_has_left_member`, `split_weights`, `expense_shares`, `require_user` доступны как `POST /rest/v1/rpc/...`. `expense_has_left_member` — это security definer, который по любому uuid отвечает, есть ли в чужом расходе вышедшие. Утечка небольшая (uuid не угадать), но лишняя. | низкая | Перенести вспомогательные функции в схему `private`, которую PostgREST не публикует (`grant usage on schema private to authenticated`), а политики ссылаются на `private.is_active_member(...)`. |
| 10 | `migrations/…004_rls.sql:68` | права | `revoke execute on all functions` действует только на уже созданные функции. Новая функция в следующей миграции снова получит EXECUTE для `public`, а в Supabase — и для `anon`/`authenticated`. | низкая | `alter default privileges in schema public revoke execute on functions from public, anon, authenticated;` |
| 11 | `migrations/…004_rls.sql:33-35` | соответствие ТЗ 3.1 | По ТЗ `groups` (и, по смыслу, история) видна и вышедшим участникам. В схеме видно только активным, это подтверждает тест на `db.test.ts:324`. Создание группы по ТЗ — прямой `INSERT` с `owner_id = auth.uid()`, а сделано через RPC. Оба отклонения безопаснее ТЗ, но не задокументированы. | низкая | Оставить как есть и обновить ТЗ 3.1 (версия 1.2), указав, почему так. |
| 12 | `migrations/…001_schema.sql:46-47` | целостность | Колонки `category` и `date` открыты на запись, но без ограничений: можно записать текст любой длины или дату `0001-01-01`. | низкая | `check (category is null or char_length(category) <= 30)`, `check (date between '2000-01-01' and current_date + 366)`. Второе лучше проверять в триггере, потому что `current_date` в CHECK — не immutable. |
| 13 | `migrations/…001_schema.sql:19, 52-53, 66-68` | целостность | Удалить пользователя из `auth.users` (например, по запросу на удаление данных) невозможно. Каскад доходит до `members`, но упирается в внешние ключи `expenses`/`transfers` и в `groups.owner_id` без `on delete` (NO ACTION). Это поведение нигде явно не выбрано. | низкая | Явно решить, что делать: анонимизировать профиль (`name = 'Удалённый пользователь'`) вместо удаления. Зафиксировать решение в ТЗ. |
| 14 | `migrations/…003_rpc.sql:76-87` | надёжность кода | Строка 83 опирается на `FOUND`, выставленный командой `select into` на строке 75. Пока работает, но любая вставка запроса между ними молча сломает возврат вышедшего участника. | низкая | `if v_member.user_id is not null then update … else insert … end if;` |
| 15 | `migrations/…004_rls.sql:20` | конкурентность | Нет защиты от «потерянного обновления»: два окна редактируют один расход, и побеждает последний сохранивший. | низкая | Клиент шлёт `.eq('updated_at', прежнее)`. Если затронуто 0 строк — показать «Расход изменён, обновите». |
| 16 | `tests/db.test.ts` | тесты | Не покрыты: Q5 — правка или удаление расхода с вышедшим участником, в том числе вышедшим плательщиком (п. 1); удаление перевода с вышедшим (п. 4); вышедший участник в новом расходе или переводе (сейчас проверяется только посторонний); смена `group_id` при UPDATE; UPDATE и DELETE переводов чужим пользователем; чтение чужого `email` (п. 5); подделка `created_at` (п. 6); `join_group` в скрытую группу; `leave_group` не-участником (PT403); `rotate_invite` бывшим владельцем; `my_groups` без вышедших и скрытых групп и с правильной сортировкой; плохой jsonb (п. 8); балансы с переводами и вышедшими участниками в сверке SQL↔TS (сейчас `transfers: []`); одинаковый `joined_at`, когда ничью решает `user_id`. Гонки на PGlite не проверить: у него одно соединение. | средняя | Добавить эти кейсы. Для гонок — отдельный интеграционный тест на настоящем Postgres (два клиента `pg`, `begin` и ручное чередование команд) или хотя бы ручной сценарий в `e2e_results.md`. Ещё учесть, что в PGlite функции принадлежат суперпользователю, а в Supabase — `postgres`. Поведение RLS у них может отличаться, поэтому e2e на живом проекте нужны и дальше. |

**Расчёт долей (вопрос 4) — расхождений не нашёл.** Формулы совпадают со `splitByWeights`: `floor` через целочисленное деление `bigint` (приведение `sum() over ()` к `bigint` сделано правильно), остатки — по убыванию. Ничья в SQL решается по `(joined_at, user_id)`, а во фронтенде — по индексу в массиве. Это одно и то же, потому что `getExpenseShares` упорядочивает участников по списку группы, а `supabaseApi.ts:55` получает его с `order('joined_at').order('user_id')`. Переполнения нет: 10⁸ × 1000 намного меньше 2⁶³. Сумма долей всегда равна сумме расхода, потому что лишних копеек (`leftover`) меньше, чем участников.

## 2. Что сделано хорошо

1. **Нет доверия клиенту.** Таблицы закрыты `revoke all`, права выданы точечно, включая права на отдельные колонки для UPDATE. Группы и участники меняются только через RPC, `anon` видит только превью приглашения.
2. **Все security definer функции написаны правильно:** `set search_path = ''`, полные имена объектов, проверка прав в начале. `is_active_member` устраняет рекурсию в RLS по `members`.
3. **Составные внешние ключи `(group_id, payer_id/from_id/to_id/created_by) → members`** не дают сослаться на человека из другой группы, даже если проверка в триггере отключена.
4. **Деньги хранятся в `bigint`, ограничения CHECK повторяют ТЗ.** Есть сверка SQL и TypeScript на 60 случайных расходах — отличный способ поймать расхождение в копейку.
5. **Лимит в 50 участников защищён от гонки** через `FOR UPDATE` на строке группы. Ошибки возвращаются с кодами `PTxxx`, где в `message` машинный ключ, а в `hint` текст для пользователя, — удобно для фронтенда.

## 3. Три самых важных исправления

**1. Учитывать плательщика в Q5 (п. 1) и закрыть удаление переводов с вышедшими (п. 4).** Это одна и та же дыра в правиле «вышедший участник уходит с нулевым балансом», и её можно эксплуатировать без всяких гонок:

```sql
create or replace function public.expense_has_left_member(p_expense uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.expenses e
    cross join lateral (
      select sw.member_id from public.split_weights(e.split) sw
      union select e.payer_id
    ) p
    join public.members m on m.group_id = e.group_id and m.user_id = p.member_id
    where e.id = p_expense and m.left_at is not null
  );
$$;

drop policy transfers_delete_author on public.transfers;
create policy transfers_delete_author on public.transfers
  for delete to authenticated
  using (created_by = auth.uid() and public.is_active_member(group_id)
         and not exists (select 1 from public.members m
                         where m.group_id = transfers.group_id
                           and m.user_id in (transfers.from_id, transfers.to_id)
                           and m.left_at is not null));
```

**2. Сериализовать вступление и выход относительно записи в группу (пп. 2–3).** Advisory-блокировки не требуют прав на UPDATE таблицы `groups`, поэтому работают и в триггерах, которые выполняются с правами вызывающего:

```sql
-- первой строкой в validate_expense и validate_transfer:
perform pg_advisory_xact_lock_shared(hashtextextended(new.group_id::text, 0));

-- новый триггер на удаление (повесить на expenses и transfers, before delete):
create function public.lock_group_on_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended(old.group_id::text, 0));
  return old;
end; $$;

-- в leave_group сразу после проверки is_active_member, до расчёта баланса;
-- в join_group — после поиска группы по токену:
perform pg_advisory_xact_lock(hashtextextended(p_group::text, 0));
```

После ожидания блокировки следующая команда в режиме READ COMMITTED берёт новый снимок данных. Поэтому `group_balances` в `leave_group` увидит уже зафиксированный параллельный расход.

**3. Закрыть колонки, которые клиенту не нужны (пп. 5–6):**

```sql
revoke select on public.profiles from authenticated;
grant select (id, name, created_at) on public.profiles to authenticated;

revoke insert on public.expenses, public.transfers from authenticated;
grant insert (group_id, title, amount_kop, payer_id, split, category, date) on public.expenses to authenticated;
grant insert (group_id, from_id, to_id, amount_kop) on public.transfers to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
```

Внимание: если фронтенд передаёт `id` при оптимистичной вставке, его нужно добавить в список колонок.

## 4. Итоговая оценка: 7/10

Посторонний пользователь не может ни прочитать, ни изменить чужие данные: RLS, права на колонки, составные внешние ключи и security definer функции сделаны грамотно. Для схемы, созданной AI-агентом, это выше среднего. Баллы сняты за три вещи:

- можно нарушить ключевой финансовый инвариант (баланс вышедшего участника = 0) — без гонок через вышедшего плательщика и удаление переводов, а с гонками — при одновременном выходе и записи;
- лишняя утечка email;
- пересчёт балансов с нуля при каждом запросе, который не масштабируется.

Тесты хорошо проверяют то, что задумано, но почти не проверяют то, что должно быть запрещено. Именно поэтому 24 зелёных теста не поймали п. 1. После исправлений из раздела 3 и пары тестов на них схема тянет на 8.5–9/10.

Файлы я не менял.
