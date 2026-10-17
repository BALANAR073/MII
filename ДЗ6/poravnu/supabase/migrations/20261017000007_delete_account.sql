-- ДЗ6 · Миграция 7: удаление своего аккаунта.
--
-- Зачем: пользователь вправе удалить свои персональные данные (152-ФЗ, политика конфиденциальности),
-- а сквозной тест scripts/e2e-supabase.mjs в конце удаляет созданных им пользователей — раньше они
-- копились в profiles, потому что без секретного ключа удалить пользователя было нельзя.
--
-- Что происходит с группами, где был пользователь:
--   • других зарегистрированных участников нет — группа удаляется целиком (вместе с расходами);
--   • они есть — история остаётся: место пользователя становится «участником без аккаунта» с тем же
--     именем, поэтому балансы остальных не меняются; владение группой переходит к участнику,
--     вступившему раньше остальных.
-- Затем удаляется запись в auth.users; профиль удаляется каскадом.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_name text;
  v_group uuid;
  v_heir uuid;
begin
  select p.name into v_name from public.profiles p where p.id = v_user;

  for v_group in
    select m.group_id from public.members m where m.user_id = v_user and not m.is_virtual order by m.group_id
  loop
    perform private.lock_group_exclusive(v_group);

    select m.user_id into v_heir
    from public.members m
    where m.group_id = v_group and m.user_id <> v_user and not m.is_virtual and m.left_at is null
    order by m.joined_at, m.user_id
    limit 1;

    if v_heir is null then
      delete from public.groups g where g.id = v_group;
    else
      update public.groups g set owner_id = v_heir where g.id = v_group and g.owner_id = v_user;
      update public.members m
      set is_virtual = true, display_name = coalesce(v_name, 'Удалённый участник')
      where m.group_id = v_group and m.user_id = v_user;
    end if;
  end loop;

  delete from auth.users u where u.id = v_user;
end;
$$;

-- Гостю функция недоступна вовсе (а не только отвечает «войдите»).
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
