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
