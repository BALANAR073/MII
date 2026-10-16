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
