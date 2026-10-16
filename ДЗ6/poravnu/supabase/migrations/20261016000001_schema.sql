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
