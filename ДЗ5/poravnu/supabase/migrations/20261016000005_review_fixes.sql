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
