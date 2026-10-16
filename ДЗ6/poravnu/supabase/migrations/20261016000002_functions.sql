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
