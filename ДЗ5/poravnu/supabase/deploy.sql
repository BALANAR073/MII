-- ДЗ5 · Все миграции одним файлом для Supabase → SQL Editor (собрано из supabase/migrations).
-- Запускать один раз на пустом проекте. Для уже развёрнутого проекта запускайте только новые миграции.

-- ===== migrations/20261016000001_schema.sql =====
-- ДЗ5 · Миграция 1: таблицы, связи, ограничения, индексы.
-- Схема спроектирована AI-агентом по ТЗ (ДЗ3, раздел 3) и проверена AI-ревью (ДЗ5/db_design.md).
-- Деньги — bigint в копейках; все проверки диапазонов продублированы CHECK-ограничениями,
-- чтобы неверные данные не попали в базу даже в обход интерфейса.

-- Профиль пользователя: создаётся триггером при регистрации в Supabase Auth (миграция 2).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  -- 8 вариантов эмодзи (решение Q10 в ТЗ).
  emoji text not null default '💸' check (emoji in ('💸', '🏙', '🏠', '🎂', '🏕', '✈️', '🍕', '🎉')),
  owner_id uuid not null references public.profiles (id),
  -- 32 hex-символа: угадать токен перебором нереально.
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- Группа скрыта, когда из неё вышли все участники (решение Q4).
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

-- Участие в группе. Порядок вступления (joined_at, затем user_id) задаёт, кому достаётся лишняя копейка (Q1).
create table public.members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id)
);
create index members_user_active_idx on public.members (user_id) where left_at is null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  amount_kop bigint not null check (amount_kop between 1 and 100000000),
  payer_id uuid not null,
  -- {"kind":"equal","memberIds":[...]} или {"kind":"shares","shares":[{"memberId":..,"weight":1..1000}]}.
  -- Состав проверяет триггер validate_expense (миграция 2): jsonb не даёт внешних ключей.
  split jsonb not null check (split ->> 'kind' in ('equal', 'shares')),
  category text,
  date date not null default current_date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Составные ключи: плательщик и автор обязаны быть участниками именно этой группы.
  foreign key (group_id, payer_id) references public.members (group_id, user_id),
  foreign key (group_id, created_by) references public.members (group_id, user_id)
);
create index expenses_group_feed_idx on public.expenses (group_id, date desc, created_at desc);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_id uuid not null,
  to_id uuid not null,
  amount_kop bigint not null check (amount_kop between 1 and 100000000),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  foreign key (group_id, from_id) references public.members (group_id, user_id),
  foreign key (group_id, to_id) references public.members (group_id, user_id),
  foreign key (group_id, created_by) references public.members (group_id, user_id)
);
create index transfers_group_created_idx on public.transfers (group_id, created_at desc);

comment on table public.expenses is 'Расходы группы. Суммы — целые копейки.';
comment on table public.transfers is 'Отмеченные переводы между участниками (FR-5.1).';

-- ===== migrations/20261016000002_functions.sql =====
-- ДЗ5 · Миграция 2: служебные функции, расчёт долей и балансов, триггеры.
-- Все функции с search_path = '' и полными именами объектов: защита от подмены объектов через search_path.

-- Профиль создаётся автоматически при регистрации (имя берём из метаданных signUp).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, 'user'), '@', 1)), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Пользователь — активный участник группы. security definer: функция используется в политиках RLS
-- таблицы members, и без него проверка участия рекурсивно упиралась бы в те же политики.
create or replace function public.is_active_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.group_id = p_group and m.user_id = auth.uid() and m.left_at is null
  );
$$;

-- Пользователь видит профиль другого, если они вместе состоят (или состояли) в группе,
-- где текущий пользователь сейчас активен: вышедшие участники остаются в истории.
create or replace function public.shares_group(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members me
    join public.members other on other.group_id = me.group_id
    where me.user_id = auth.uid() and me.left_at is null and other.user_id = p_user
  );
$$;

-- Участники деления и их веса: при делении поровну у каждого вес 1.
create or replace function public.split_weights(p_split jsonb)
returns table (member_id uuid, weight integer)
language sql
immutable
set search_path = ''
as $$
  select (e #>> '{}')::uuid, 1
  from jsonb_array_elements(case when p_split ->> 'kind' = 'equal' then p_split -> 'memberIds' else '[]'::jsonb end) as e
  union all
  select (s ->> 'memberId')::uuid, (s ->> 'weight')::integer
  from jsonb_array_elements(case when p_split ->> 'kind' = 'shares' then p_split -> 'shares' else '[]'::jsonb end) as s;
$$;

-- Доли участников в расходе — тот же алгоритм, что splitByWeights во фронтенде (FR-3.4):
-- база floor(amount·w / Σw), лишние копейки — по наибольшему остатку, при равенстве — по порядку вступления.
-- Совпадение с TypeScript-реализацией проверяет тест supabase/tests/db.test.ts на случайных данных.
create or replace function public.expense_shares(p_group uuid, p_amount bigint, p_split jsonb)
returns table (member_id uuid, share_kop bigint)
language sql
stable
set search_path = ''
as $$
  with weights as (
    select sw.member_id, sw.weight::bigint as weight, m.joined_at
    from public.split_weights(p_split) sw
    join public.members m on m.group_id = p_group and m.user_id = sw.member_id
  ),
  totals as (
    -- sum(bigint) возвращает numeric, а деление bigint / numeric — дробное, без округления вниз.
    -- Поэтому сумма весов явно приводится к bigint: тогда деление целочисленное, как floor в TypeScript.
    select w.*, (sum(w.weight) over ())::bigint as total_weight from weights w
  ),
  parts as (
    select t.member_id, t.joined_at,
           (p_amount * t.weight) / t.total_weight as base_kop,
           (p_amount * t.weight) % t.total_weight as remainder
    from totals t
  ),
  ranked as (
    select p.*,
           row_number() over (order by p.remainder desc, p.joined_at, p.member_id) as place,
           p_amount - (sum(p.base_kop) over ())::bigint as leftover
    from parts p
  )
  select r.member_id, (r.base_kop + case when r.place <= r.leftover then 1 else 0 end)::bigint
  from ranked r;
$$;

-- Балансы участников группы (FR-4.1): оплачено − доли + отправлено − получено. Сумма всегда 0.
-- Доступно только активным участникам группы.
create or replace function public.group_balances(p_group uuid)
returns table (member_id uuid, balance_kop bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  return query
    with shares as (
      select s.member_id, sum(s.share_kop) as kop
      from public.expenses e
      cross join lateral public.expense_shares(e.group_id, e.amount_kop, e.split) s
      where e.group_id = p_group
      group by s.member_id
    ),
    paid as (
      select e.payer_id as member_id, sum(e.amount_kop) as kop from public.expenses e where e.group_id = p_group group by e.payer_id
    ),
    sent as (
      select t.from_id as member_id, sum(t.amount_kop) as kop from public.transfers t where t.group_id = p_group group by t.from_id
    ),
    received as (
      select t.to_id as member_id, sum(t.amount_kop) as kop from public.transfers t where t.group_id = p_group group by t.to_id
    )
    select m.user_id,
           (coalesce(paid.kop, 0) - coalesce(shares.kop, 0) + coalesce(sent.kop, 0) - coalesce(received.kop, 0))::bigint
    from public.members m
    left join paid on paid.member_id = m.user_id
    left join shares on shares.member_id = m.user_id
    left join sent on sent.member_id = m.user_id
    left join received on received.member_id = m.user_id
    where m.group_id = p_group
    order by m.joined_at, m.user_id;
end;
$$;

-- Среди участников расхода есть вышедший — такой расход менять нельзя (решение Q5).
create or replace function public.expense_has_left_member(p_expense uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses e
    cross join lateral public.split_weights(e.split) sw
    join public.members m on m.group_id = e.group_id and m.user_id = sw.member_id
    where e.id = p_expense and m.left_at is not null
  );
$$;

-- Проверка расхода перед записью: состав деления, веса, активность участников (ERR-1, FR-3.4).
-- Ошибки — с кодом 23514 (check_violation): PostgREST вернёт 400, клиент покажет текст валидации.
create or replace function public.validate_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_distinct integer;
  v_bad_weight integer;
  v_inactive integer;
begin
  -- Сначала права: иначе чужак получил бы ошибку валидации вместо отказа в доступе
  -- (BEFORE-триггер срабатывает раньше проверки RLS WITH CHECK).
  if auth.uid() is not null and not public.is_active_member(new.group_id) then
    raise exception 'forbidden' using errcode = '42501', hint = 'Нет доступа к группе';
  end if;
  if tg_op = 'UPDATE' and (new.group_id <> old.group_id or new.created_by <> old.created_by) then
    raise exception 'immutable_field' using errcode = '23514', hint = 'Группу и автора расхода менять нельзя';
  end if;

  select count(*), count(distinct member_id), count(*) filter (where weight is null or weight < 1 or weight > 1000)
    into v_count, v_distinct, v_bad_weight
  from public.split_weights(new.split);

  if v_count = 0 then
    raise exception 'empty_split' using errcode = '23514', hint = 'Выберите хотя бы одного участника';
  end if;
  if v_distinct <> v_count then
    raise exception 'duplicate_member' using errcode = '23514', hint = 'Участник указан в делении дважды';
  end if;
  if v_bad_weight > 0 then
    raise exception 'invalid_weight' using errcode = '23514', hint = 'Доля — целое число от 1 до 1000';
  end if;

  select count(*) into v_inactive
  from (select member_id from public.split_weights(new.split) union select new.payer_id) p
  where not exists (
    select 1 from public.members m
    where m.group_id = new.group_id and m.user_id = p.member_id and m.left_at is null
  );
  if v_inactive > 0 then
    raise exception 'inactive_member' using errcode = '23514', hint = 'Участник не состоит в группе';
  end if;

  new.title := btrim(new.title);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger expenses_validate
  before insert or update on public.expenses
  for each row execute function public.validate_expense();

-- Перевод только между активными участниками (FR-5.1).
create or replace function public.validate_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from (values (new.from_id), (new.to_id)) as p (member_id)
    where not exists (
      select 1 from public.members m
      where m.group_id = new.group_id and m.user_id = p.member_id and m.left_at is null
    )
  ) then
    raise exception 'inactive_member' using errcode = '23514', hint = 'Участник перевода не состоит в группе';
  end if;
  return new;
end;
$$;

create trigger transfers_validate
  before insert on public.transfers
  for each row execute function public.validate_transfer();

-- ===== migrations/20261016000003_rpc.sql =====
-- ДЗ5 · Миграция 3: серверные функции (RPC), доступные как POST /rest/v1/rpc/<имя>.
-- Операции, которые меняют несколько таблиц сразу или должны обходить RLS по правилам ТЗ (раздел 3.1).
-- Коды ошибок PTxxx PostgREST превращает в HTTP-статус xxx (401, 403, 404, 409),
-- в message — машинный ключ, в hint — текст для человека.

create or replace function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'PT401', hint = 'Сессия истекла, войдите снова';
  end if;
  return auth.uid();
end;
$$;

-- Создание группы: группа и участие создателя — одной транзакцией (FR-2.2).
create or replace function public.create_group(p_name text, p_emoji text default '💸')
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_group public.groups;
begin
  insert into public.groups (name, emoji, owner_id)
  values (btrim(p_name), coalesce(p_emoji, '💸'), v_user)
  returning * into v_group;
  insert into public.members (group_id, user_id) values (v_group.id, v_user);
  return v_group;
end;
$$;

-- Превью приглашения доступно и гостю: название, эмодзи, число участников (FR-2.3).
create or replace function public.get_invite_preview(p_token text)
returns table (group_name text, emoji text, members_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select g.name, g.emoji, (select count(*)::integer from public.members m where m.group_id = g.id and m.left_at is null)
    from public.groups g
    where g.invite_token = p_token and g.hidden_at is null;
  if not found then
    raise exception 'invalid_invite' using errcode = 'PT404', hint = 'Приглашение недействительно. Попросите новую ссылку';
  end if;
end;
$$;

-- Вступление по ссылке. Вышедший участник возвращается с прежним порядком вступления (Q5). Лимит — 50 (Q9).
create or replace function public.join_group(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_group uuid;
  v_member public.members;
begin
  select g.id into v_group from public.groups g where g.invite_token = p_token and g.hidden_at is null for update;
  if v_group is null then
    raise exception 'invalid_invite' using errcode = 'PT404', hint = 'Приглашение недействительно. Попросите новую ссылку';
  end if;

  select * into v_member from public.members m where m.group_id = v_group and m.user_id = v_user;
  if found and v_member.left_at is null then
    return v_group;
  end if;
  if (select count(*) from public.members m where m.group_id = v_group and m.left_at is null) >= 50 then
    raise exception 'group_full' using errcode = 'PT409', hint = 'В группе уже 50 участников';
  end if;

  if found then
    update public.members set left_at = null where group_id = v_group and user_id = v_user;
  else
    insert into public.members (group_id, user_id) values (v_group, v_user);
  end if;
  return v_group;
end;
$$;

-- Выход только при нулевом балансе (FR-2.4, AC-11.2). Владелец передаёт группу самому раннему участнику (Q4).
create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_balance bigint;
  v_heir uuid;
begin
  if not public.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  select b.balance_kop into v_balance from public.group_balances(p_group) b where b.member_id = v_user;
  if coalesce(v_balance, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = 'PT409', detail = v_balance::text, hint = 'Сначала рассчитайтесь';
  end if;

  update public.members set left_at = now() where group_id = p_group and user_id = v_user;

  select m.user_id into v_heir
  from public.members m
  where m.group_id = p_group and m.left_at is null
  order by m.joined_at, m.user_id
  limit 1;

  if v_heir is null then
    update public.groups set hidden_at = now() where id = p_group;
  else
    update public.groups set owner_id = v_heir where id = p_group and owner_id = v_user;
  end if;
end;
$$;

-- Перевыпуск ссылки — только владелец (FR-2.5).
create or replace function public.rotate_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  update public.groups set invite_token = v_token where id = p_group and owner_id = v_user and hidden_at is null;
  if not found then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Сбросить ссылку может только владелец группы';
  end if;
  return v_token;
end;
$$;

-- Список «Мои группы» со своим балансом (FR-2.1) — одним запросом, без загрузки всех расходов.
create or replace function public.my_groups()
returns table (
  id uuid,
  name text,
  emoji text,
  active_members_count integer,
  my_balance_kop bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.require_user();
begin
  return query
    select g.id, g.name, g.emoji,
           (select count(*)::integer from public.members m2 where m2.group_id = g.id and m2.left_at is null),
           coalesce((select b.balance_kop from public.group_balances(g.id) b where b.member_id = v_user), 0),
           greatest(
             g.created_at,
             (select max(e.created_at) from public.expenses e where e.group_id = g.id),
             (select max(t.created_at) from public.transfers t where t.group_id = g.id)
           )
    from public.groups g
    join public.members m on m.group_id = g.id and m.user_id = v_user and m.left_at is null
    where g.hidden_at is null
    order by 6 desc;
end;
$$;

-- ===== migrations/20261016000004_rls.sql =====
-- ДЗ5 · Миграция 4: Row Level Security и права (ТЗ, раздел 3.1).
-- Принцип: гость (anon) не видит ни одной таблицы; вошедший (authenticated) видит только группы,
-- где он активный участник; всё, что меняет несколько таблиц, — только через RPC из миграции 3.

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.transfers enable row level security;

-- Права на таблицы: по умолчанию Supabase выдаёт anon и authenticated всё — забираем и выдаём точечно.
revoke all on public.profiles, public.groups, public.members, public.expenses, public.transfers from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;
grant select on public.groups to authenticated;
grant select on public.members to authenticated;
grant select, insert, delete on public.expenses to authenticated;
-- Менять можно только содержимое расхода: группу и автора — нельзя (вдобавок к триггеру).
grant update (title, amount_kop, payer_id, split, date, category) on public.expenses to authenticated;
grant select, insert, delete on public.transfers to authenticated;

-- profiles: свой профиль и профили тех, с кем пользователь сейчас в одной группе.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_group(id));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- groups и members: только активные участники. Создание и вступление — через RPC.
create policy groups_select_members on public.groups
  for select to authenticated
  using (hidden_at is null and public.is_active_member(id));
create policy members_select_members on public.members
  for select to authenticated
  using (public.is_active_member(group_id));

-- expenses: читать — участники; добавлять — участник от своего имени; менять и удалять — только автор,
-- и только если в расходе нет вышедших участников (Q5).
create policy expenses_select_members on public.expenses
  for select to authenticated
  using (public.is_active_member(group_id));
create policy expenses_insert_member on public.expenses
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_active_member(group_id));
create policy expenses_update_author on public.expenses
  for update to authenticated
  using (created_by = auth.uid() and public.is_active_member(group_id) and not public.expense_has_left_member(id))
  with check (created_by = auth.uid());
create policy expenses_delete_author on public.expenses
  for delete to authenticated
  using (created_by = auth.uid() and public.is_active_member(group_id) and not public.expense_has_left_member(id));

-- transfers: отмечать — только отправитель или получатель; удалять — только автор отметки (Q2).
create policy transfers_select_members on public.transfers
  for select to authenticated
  using (public.is_active_member(group_id));
create policy transfers_insert_party on public.transfers
  for insert to authenticated
  with check (created_by = auth.uid() and auth.uid() in (from_id, to_id) and public.is_active_member(group_id));
create policy transfers_delete_author on public.transfers
  for delete to authenticated
  using (created_by = auth.uid() and public.is_active_member(group_id));

-- Функции: по умолчанию EXECUTE есть у всех — оставляем только нужное.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.shares_group(uuid) to authenticated;
grant execute on function public.expense_has_left_member(uuid) to authenticated;
grant execute on function public.split_weights(jsonb) to authenticated;
grant execute on function public.expense_shares(uuid, bigint, jsonb) to authenticated;
grant execute on function public.group_balances(uuid) to authenticated;
grant execute on function public.require_user() to authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;
grant execute on function public.my_groups() to authenticated;
-- Превью приглашения видит и гость: он ещё не вошёл, но должен понять, куда его зовут.
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- ===== migrations/20261016000005_review_fixes.sql =====
-- ДЗ5 · Миграция 5: исправления по AI-ревью схемы (ДЗ5/ai_db_review.md) и Security Advisor Supabase.
-- Номера в комментариях — номера находок ревью. Разбор всех находок — ДЗ5/ai_db_review_response.md.

-- ── 9. Служебные функции — в схему private: PostgREST публикует только public,
--     поэтому они перестают быть доступны как /rest/v1/rpc/*. Политики RLS ссылаются на функции
--     по OID и продолжают работать; тела функций, где они вызываются, пересоздаются ниже.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_active_member(uuid) set schema private;
alter function public.shares_group(uuid) set schema private;
alter function public.expense_has_left_member(uuid) set schema private;
alter function public.split_weights(jsonb) set schema private;
alter function public.expense_shares(uuid, bigint, jsonb) set schema private;
alter function public.require_user() set schema private;

-- ── 1. Вышедшим считается и плательщик, а не только участники деления (Q5, Q11).
create or replace function private.expense_has_left_member(p_expense uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses e
    cross join lateral (
      select sw.member_id from private.split_weights(e.split) sw
      union
      select e.payer_id
    ) p
    join public.members m on m.group_id = e.group_id and m.user_id = p.member_id
    where e.id = p_expense and m.left_at is not null
  );
$$;

create or replace function private.expense_shares(p_group uuid, p_amount bigint, p_split jsonb)
returns table (member_id uuid, share_kop bigint)
language sql
stable
set search_path = ''
as $$
  with weights as (
    select sw.member_id, sw.weight::bigint as weight, m.joined_at
    from private.split_weights(p_split) sw
    join public.members m on m.group_id = p_group and m.user_id = sw.member_id
  ),
  totals as (
    select w.*, (sum(w.weight) over ())::bigint as total_weight from weights w
  ),
  parts as (
    select t.member_id, t.joined_at,
           (p_amount * t.weight) / t.total_weight as base_kop,
           (p_amount * t.weight) % t.total_weight as remainder
    from totals t
  ),
  ranked as (
    select p.*,
           row_number() over (order by p.remainder desc, p.joined_at, p.member_id) as place,
           p_amount - (sum(p.base_kop) over ())::bigint as leftover
    from parts p
  )
  select r.member_id, (r.base_kop + case when r.place <= r.leftover then 1 else 0 end)::bigint
  from ranked r;
$$;

create or replace function public.group_balances(p_group uuid)
returns table (member_id uuid, balance_kop bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  return query
    with shares as (
      select s.member_id, sum(s.share_kop) as kop
      from public.expenses e
      cross join lateral private.expense_shares(e.group_id, e.amount_kop, e.split) s
      where e.group_id = p_group
      group by s.member_id
    ),
    paid as (select e.payer_id as member_id, sum(e.amount_kop) as kop from public.expenses e where e.group_id = p_group group by e.payer_id),
    sent as (select t.from_id as member_id, sum(t.amount_kop) as kop from public.transfers t where t.group_id = p_group group by t.from_id),
    received as (select t.to_id as member_id, sum(t.amount_kop) as kop from public.transfers t where t.group_id = p_group group by t.to_id)
    select m.user_id,
           (coalesce(paid.kop, 0) - coalesce(shares.kop, 0) + coalesce(sent.kop, 0) - coalesce(received.kop, 0))::bigint
    from public.members m
    left join paid on paid.member_id = m.user_id
    left join shares on shares.member_id = m.user_id
    left join sent on sent.member_id = m.user_id
    left join received on received.member_id = m.user_id
    where m.group_id = p_group
    order by m.joined_at, m.user_id;
end;
$$;

-- ── 2, 3. Блокировка группы: запись расходов и переводов берёт разделяемую блокировку,
--     вступление и выход — исключительную. Выход больше не может «проскочить» мимо параллельного
--     расхода с ненулевым балансом, а два последних участника не выйдут одновременно, не скрыв группу.
create or replace function private.lock_group_shared(p_group uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock_shared(hashtextextended(p_group::text, 0));
$$;

create or replace function private.lock_group_exclusive(p_group uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_group::text, 0));
$$;

-- ── 8, 12. Проверка расхода: структура split, дата и категория.
create or replace function public.validate_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_distinct integer;
  v_bad_weight integer;
  v_inactive integer;
begin
  perform private.lock_group_shared(new.group_id);
  if auth.uid() is not null and not private.is_active_member(new.group_id) then
    raise exception 'forbidden' using errcode = '42501', hint = 'Нет доступа к группе';
  end if;
  if tg_op = 'UPDATE' and (new.group_id <> old.group_id or new.created_by <> old.created_by) then
    raise exception 'immutable_field' using errcode = '23514', hint = 'Группу и автора расхода менять нельзя';
  end if;
  if new.date < date '2000-01-01' or new.date > current_date + 366 then
    raise exception 'invalid_date' using errcode = '23514', hint = 'Укажите дату расхода';
  end if;

  begin
    select count(*), count(distinct member_id), count(*) filter (where weight is null or weight < 1 or weight > 1000)
      into v_count, v_distinct, v_bad_weight
    from private.split_weights(new.split);
  exception
    -- Не uuid вместо id, дробный или текстовый вес, не массив — понятная ошибка валидации вместо 22P02.
    when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then
      raise exception 'invalid_split' using errcode = '23514', hint = 'Неверный формат деления расхода';
  end;

  if v_count = 0 then
    raise exception 'empty_split' using errcode = '23514', hint = 'Выберите хотя бы одного участника';
  end if;
  if v_distinct <> v_count then
    raise exception 'duplicate_member' using errcode = '23514', hint = 'Участник указан в делении дважды';
  end if;
  if v_bad_weight > 0 then
    raise exception 'invalid_weight' using errcode = '23514', hint = 'Доля — целое число от 1 до 1000';
  end if;

  select count(*) into v_inactive
  from (select member_id from private.split_weights(new.split) union select new.payer_id) p
  where not exists (
    select 1 from public.members m
    where m.group_id = new.group_id and m.user_id = p.member_id and m.left_at is null
  );
  if v_inactive > 0 then
    raise exception 'inactive_member' using errcode = '23514', hint = 'Участник не состоит в группе';
  end if;

  new.title := btrim(new.title);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.validate_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.lock_group_shared(new.group_id);
  if exists (
    select 1 from (values (new.from_id), (new.to_id)) as p (member_id)
    where not exists (
      select 1 from public.members m
      where m.group_id = new.group_id and m.user_id = p.member_id and m.left_at is null
    )
  ) then
    raise exception 'inactive_member' using errcode = '23514', hint = 'Участник перевода не состоит в группе';
  end if;
  return new;
end;
$$;

create or replace function public.lock_group_on_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.lock_group_shared(old.group_id);
  return old;
end;
$$;

create trigger expenses_lock_on_delete before delete on public.expenses
  for each row execute function public.lock_group_on_delete();
create trigger transfers_lock_on_delete before delete on public.transfers
  for each row execute function public.lock_group_on_delete();

alter table public.expenses
  add constraint expenses_category_length check (category is null or char_length(category) <= 30),
  add constraint expenses_split_shape check (
    jsonb_typeof(split -> case split ->> 'kind' when 'equal' then 'memberIds' else 'shares' end) = 'array'
  );

-- ── RPC: новые ссылки на private и блокировки (2, 3, 14).
create or replace function public.create_group(p_name text, p_emoji text default '💸')
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_group public.groups;
begin
  insert into public.groups (name, emoji, owner_id)
  values (btrim(p_name), coalesce(p_emoji, '💸'), v_user)
  returning * into v_group;
  insert into public.members (group_id, user_id) values (v_group.id, v_user);
  return v_group;
end;
$$;

create or replace function public.join_group(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_group uuid;
  v_member public.members;
begin
  select g.id into v_group from public.groups g where g.invite_token = p_token and g.hidden_at is null;
  if v_group is null then
    raise exception 'invalid_invite' using errcode = 'PT404', hint = 'Приглашение недействительно. Попросите новую ссылку';
  end if;
  perform private.lock_group_exclusive(v_group);

  select * into v_member from public.members m where m.group_id = v_group and m.user_id = v_user;
  if v_member.user_id is not null and v_member.left_at is null then
    return v_group;
  end if;
  if (select count(*) from public.members m where m.group_id = v_group and m.left_at is null) >= 50 then
    raise exception 'group_full' using errcode = 'PT409', hint = 'В группе уже 50 участников';
  end if;

  if v_member.user_id is not null then
    update public.members set left_at = null where group_id = v_group and user_id = v_user;
  else
    insert into public.members (group_id, user_id) values (v_group, v_user);
  end if;
  return v_group;
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_balance bigint;
  v_heir uuid;
begin
  if not private.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  -- После ожидания блокировки следующий запрос видит уже зафиксированные параллельные записи.
  perform private.lock_group_exclusive(p_group);
  select b.balance_kop into v_balance from public.group_balances(p_group) b where b.member_id = v_user;
  if coalesce(v_balance, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = 'PT409', detail = v_balance::text, hint = 'Сначала рассчитайтесь';
  end if;

  update public.members set left_at = now() where group_id = p_group and user_id = v_user;

  select m.user_id into v_heir
  from public.members m
  where m.group_id = p_group and m.left_at is null
  order by m.joined_at, m.user_id
  limit 1;

  if v_heir is null then
    update public.groups set hidden_at = now() where id = p_group;
  else
    update public.groups set owner_id = v_heir where id = p_group and owner_id = v_user;
  end if;
end;
$$;

create or replace function public.rotate_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  update public.groups set invite_token = v_token where id = p_group and owner_id = v_user and hidden_at is null;
  if not found then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Сбросить ссылку может только владелец группы';
  end if;
  return v_token;
end;
$$;

create or replace function public.my_groups()
returns table (
  id uuid,
  name text,
  emoji text,
  active_members_count integer,
  my_balance_kop bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  return query
    select g.id, g.name, g.emoji,
           (select count(*)::integer from public.members m2 where m2.group_id = g.id and m2.left_at is null),
           coalesce((select b.balance_kop from public.group_balances(g.id) b where b.member_id = v_user), 0),
           greatest(
             g.created_at,
             (select max(e.created_at) from public.expenses e where e.group_id = g.id),
             (select max(t.created_at) from public.transfers t where t.group_id = g.id)
           )
    from public.groups g
    join public.members m on m.group_id = g.id and m.user_id = v_user and m.left_at is null
    where g.hidden_at is null
    order by 6 desc;
end;
$$;

-- ── 4. Перевод с вышедшим участником удалить нельзя: иначе его баланс станет ненулевым.
drop policy transfers_delete_author on public.transfers;
create policy transfers_delete_author on public.transfers
  for delete to authenticated
  using (
    created_by = auth.uid()
    and private.is_active_member(group_id)
    and not exists (
      select 1 from public.members m
      where m.group_id = transfers.group_id and m.user_id in (transfers.from_id, transfers.to_id) and m.left_at is not null
    )
  );

-- ── 5, 6. Права на колонки: email других участников не читается; при вставке нельзя подменить
--     id, created_by, created_at — они заполняются базой.
revoke select on public.profiles from authenticated;
grant select (id, name, created_at) on public.profiles to authenticated;

revoke insert on public.expenses, public.transfers from authenticated;
grant insert (group_id, title, amount_kop, payer_id, split, category, date) on public.expenses to authenticated;
grant insert (group_id, from_id, to_id, amount_kop) on public.transfers to authenticated;

-- ── Права на функции: служебные — только для политик и триггеров, RPC — как раньше.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.shares_group(uuid) to authenticated;
grant execute on function private.expense_has_left_member(uuid) to authenticated;
grant execute on function private.split_weights(jsonb) to authenticated;
grant execute on function private.expense_shares(uuid, bigint, jsonb) to authenticated;
grant execute on function private.lock_group_shared(uuid) to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.group_balances(uuid) to authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- ── 10. Новые функции в следующих миграциях не получат EXECUTE автоматически.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
