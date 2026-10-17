-- ДЗ6 · Миграция 6: участники без аккаунта, перехват места по ссылке, настройки группы.
--
-- Раньше участником мог быть только зарегистрированный пользователь, который сам перешёл по ссылке:
-- новый пользователь оставался в группе один, и делить расходы было не с кем.
-- Теперь, как в Splitwise, участника можно добавить по имени. Он сразу участвует в расходах и переводах,
-- а позже, открыв ссылку-приглашение, человек выбирает «Я — Аня» и забирает это место со всей историей.
--
-- Устройство: участник без аккаунта — строка в members со случайным user_id, is_virtual = true и именем
-- в display_name. Внешние ключи расходов и переводов на members получают ON UPDATE CASCADE, поэтому при
-- перехвате места достаточно поменять user_id участника на id аккаунта: плательщик, автор, отправитель
-- и получатель переезжают сами, а состав деления (jsonb) переписывается отдельно.

-- ── Участник без аккаунта
alter table public.members drop constraint members_user_id_fkey;
alter table public.members
  add column is_virtual boolean not null default false,
  add column display_name text,
  -- У участника без аккаунта есть имя; у зарегистрированного имя берётся из профиля.
  add constraint members_display_name_check check (
    (is_virtual and display_name is not null and char_length(btrim(display_name)) between 1 and 40)
    or (not is_virtual and display_name is null)
  );

-- Зарегистрированный участник по-прежнему обязан иметь профиль: внешний ключ заменён триггером,
-- потому что у участника без аккаунта профиля нет.
create or replace function private.check_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_virtual and not exists (select 1 from public.profiles p where p.id = new.user_id) then
    raise exception 'member_without_profile' using errcode = '23503', hint = 'Участник должен быть зарегистрирован';
  end if;
  return new;
end;
$$;

create trigger members_check_profile
  before insert or update on public.members
  for each row execute function private.check_member_profile();

-- Удаление аккаунта по-прежнему убирает его участие (раньше это делал внешний ключ с on delete cascade).
create or replace function private.delete_member_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.members m where m.user_id = old.id and not m.is_virtual;
  return old;
end;
$$;

create trigger profiles_delete_members
  before delete on public.profiles
  for each row execute function private.delete_member_rows();

-- ── Ссылки расходов и переводов на участников переезжают вместе с user_id
alter table public.expenses
  drop constraint expenses_group_id_payer_id_fkey,
  drop constraint expenses_group_id_created_by_fkey,
  add constraint expenses_group_id_payer_id_fkey foreign key (group_id, payer_id)
    references public.members (group_id, user_id) on update cascade,
  add constraint expenses_group_id_created_by_fkey foreign key (group_id, created_by)
    references public.members (group_id, user_id) on update cascade;

alter table public.transfers
  drop constraint transfers_group_id_from_id_fkey,
  drop constraint transfers_group_id_to_id_fkey,
  drop constraint transfers_group_id_created_by_fkey,
  add constraint transfers_group_id_from_id_fkey foreign key (group_id, from_id)
    references public.members (group_id, user_id) on update cascade,
  add constraint transfers_group_id_to_id_fkey foreign key (group_id, to_id)
    references public.members (group_id, user_id) on update cascade,
  add constraint transfers_group_id_created_by_fkey foreign key (group_id, created_by)
    references public.members (group_id, user_id) on update cascade;

-- Участник без аккаунта: отметить перевод с ним может любой участник группы (сам он войти не может).
create or replace function private.is_virtual_member(p_group uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.group_id = p_group and m.user_id = p_member and m.is_virtual
  );
$$;

drop policy transfers_insert_party on public.transfers;
create policy transfers_insert_party on public.transfers
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_active_member(group_id)
    and (
      auth.uid() in (from_id, to_id)
      or private.is_virtual_member(group_id, from_id)
      or private.is_virtual_member(group_id, to_id)
    )
  );

-- Перевод с участником без аккаунта может удалить его автор (как и раньше); с вышедшим — нельзя (миграция 5).

-- ── RPC: добавить участника по имени. Любой активный участник, лимит 50 (Q9), имя 1–40 символов.
create or replace function public.add_member(p_group uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_name' using errcode = '23514', hint = 'Имя — от 1 до 40 символов';
  end if;
  perform private.lock_group_exclusive(p_group);
  if (select count(*) from public.members m where m.group_id = p_group and m.left_at is null) >= 50 then
    raise exception 'group_full' using errcode = 'PT409', hint = 'В группе уже 50 участников';
  end if;
  insert into public.members (group_id, user_id, is_virtual, display_name) values (p_group, v_id, true, v_name);
  return v_id;
end;
$$;

-- ── RPC: переименовать участника без аккаунта (у зарегистрированного имя — в его профиле).
create or replace function public.rename_member(p_group uuid, p_member uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_name' using errcode = '23514', hint = 'Имя — от 1 до 40 символов';
  end if;
  update public.members set display_name = v_name
  where group_id = p_group and user_id = p_member and is_virtual and left_at is null;
  if not found then
    raise exception 'not_virtual' using errcode = 'PT409', hint = 'Переименовать можно только участника без аккаунта';
  end if;
end;
$$;

-- ── RPC: убрать участника без аккаунта — только при нулевом балансе, как выход (AC-11.2).
create or replace function public.remove_member(p_group uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_balance bigint;
begin
  if not private.is_active_member(p_group) then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Нет доступа к группе';
  end if;
  perform private.lock_group_exclusive(p_group);
  if not exists (
    select 1 from public.members m where m.group_id = p_group and m.user_id = p_member and m.is_virtual and m.left_at is null
  ) then
    raise exception 'not_virtual' using errcode = 'PT409', hint = 'Убрать можно только участника без аккаунта';
  end if;
  select b.balance_kop into v_balance from public.group_balances(p_group) b where b.member_id = p_member;
  if coalesce(v_balance, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = 'PT409', detail = v_balance::text, hint = 'Сначала рассчитайтесь';
  end if;
  update public.members set left_at = now() where group_id = p_group and user_id = p_member;
end;
$$;

-- ── RPC: свободные места по ссылке — гость видит имена участников без аккаунта, чтобы выбрать своё.
create or replace function public.get_invite_members(p_token text)
returns table (member_id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select g.id into v_group from public.groups g where g.invite_token = p_token and g.hidden_at is null;
  if v_group is null then
    raise exception 'invalid_invite' using errcode = 'PT404', hint = 'Приглашение недействительно. Попросите новую ссылку';
  end if;
  return query
    select m.user_id, m.display_name
    from public.members m
    where m.group_id = v_group and m.is_virtual and m.left_at is null
    order by m.joined_at, m.user_id;
end;
$$;

-- ── Проверка расхода пропускает переезд id при перехвате места (иначе промежуточное состояние
--     «в делении участник, которого уже нет» отменило бы операцию). Остальное — как в миграции 5.
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
  -- Переезд id при перехвате места (claim_member): проверять нечего, меняются только ссылки на участника.
  -- Флаг ставит только claim_member внутри своей транзакции; клиент PostgREST произвольный SQL выполнить не может.
  if current_setting('poravnu.claiming', true) = 'on' then
    return new;
  end if;
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

-- ── RPC: вступить по ссылке, заняв место участника без аккаунта. Вся его история становится историей аккаунта.
create or replace function public.claim_member(p_token text, p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_group uuid;
begin
  select g.id into v_group from public.groups g where g.invite_token = p_token and g.hidden_at is null;
  if v_group is null then
    raise exception 'invalid_invite' using errcode = 'PT404', hint = 'Приглашение недействительно. Попросите новую ссылку';
  end if;
  perform private.lock_group_exclusive(v_group);

  if exists (select 1 from public.members m where m.group_id = v_group and m.user_id = v_user) then
    raise exception 'already_member' using errcode = 'PT409', hint = 'Вы уже состоите в этой группе';
  end if;
  if not exists (
    select 1 from public.members m where m.group_id = v_group and m.user_id = p_member and m.is_virtual and m.left_at is null
  ) then
    raise exception 'not_virtual' using errcode = 'PT409', hint = 'Это место уже занято. Обновите страницу';
  end if;

  perform set_config('poravnu.claiming', 'on', true);
  -- Состав деления хранится в jsonb, внешние ключи его не видят — переписываем id вручную.
  update public.expenses e
  set split = replace(e.split::text, '"' || p_member::text || '"', '"' || v_user::text || '"')::jsonb
  where e.group_id = v_group and e.split::text like '%' || p_member::text || '%';

  -- Плательщик, отправитель и получатель переедут по ON UPDATE CASCADE.
  update public.members
  set user_id = v_user, is_virtual = false, display_name = null
  where group_id = v_group and user_id = p_member;
  perform set_config('poravnu.claiming', 'off', true);
  return v_group;
end;
$$;

-- ── RPC: переименовать группу и сменить эмодзи — владелец (как и сброс ссылки, FR-2.5).
create or replace function public.update_group(p_group uuid, p_name text, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  update public.groups
  set name = btrim(p_name), emoji = coalesce(p_emoji, emoji)
  where id = p_group and owner_id = v_user and hidden_at is null;
  if not found then
    raise exception 'forbidden' using errcode = 'PT403', hint = 'Изменить группу может только владелец';
  end if;
end;
$$;

-- ── Права: новые функции не получают EXECUTE по умолчанию (миграция 5, находка 10).
grant execute on function private.is_virtual_member(uuid, uuid) to authenticated;
grant execute on function public.add_member(uuid, text) to authenticated;
grant execute on function public.rename_member(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.claim_member(text, uuid) to authenticated;
grant execute on function public.update_group(uuid, text, text) to authenticated;
grant execute on function public.get_invite_members(text) to anon, authenticated;
