# ДЗ5. Логи и Security Advisor из панели Supabase

- Проект: `itppbtrmsbpreraaecqe` (poravnu, ветка main, PRODUCTION)
- Дата просмотра: 2026-10-16, 20:08–20:13 по местному времени (UTC+3)
- Строки выписаны дословно, как они показаны в панели. Многоточие «…» означает, что текст в панели обрезан по ширине колонки.
- Скриншоты: `screenshots/pc/06_api_logs.png`, `07_postgres_logs.png`, `08_security_advisor.png`

## 1. API Gateway (Edge Logs): ответы 4xx/5xx

Фильтр панели по умолчанию: «Last hour», показано 100 последних запросов. Все ошибки пришлись на прогон `npm run test:e2e` в 20:03 и ожидаемы: это негативные проверки RLS, CHECK, RPC и входа. Ответов 5xx нет.

| Время | Статус | Метод | Путь |
|---|---|---|---|
| 16 Oct 26 20:03:13 | 401 | GET | /rest/v1/groups |
| 16 Oct 26 20:03:12 | 403 | POST | /rest/v1/transfers |
| 16 Oct 26 20:03:12 | 409 | POST | /rest/v1/rpc/leave_group |
| 16 Oct 26 20:03:12 | 404 | POST | /rest/v1/rpc/get_invite_preview |
| 16 Oct 26 20:03:11 | 401 | GET | /rest/v1/groups |
| 16 Oct 26 20:03:11 | 403 | POST | /rest/v1/expenses |
| 16 Oct 26 20:03:11 | 400 | POST | /auth/v1/token |
| 16 Oct 26 20:03:11 | 400 | POST | /rest/v1/expenses |
| 16 Oct 26 20:03:10 | 400 | POST | /rest/v1/expenses |
| 16 Oct 26 20:03:07 | 400 | POST | /auth/v1/token |
| 16 Oct 26 20:03:06 | 400 | POST | /auth/v1/token |
| 16 Oct 26 20:03:06 | 400 | POST | /auth/v1/token |
| 16 Oct 26 20:03:05 | 400 | POST | /auth/v1/token |

Итого: 13 ответов 4xx (400 × 7, 401 × 2, 403 × 2, 404 × 1, 409 × 1), 5xx — 0.

## 2. Postgres: строки ERROR и FATAL

Фильтр панели по умолчанию: «Last hour», показано 77 записей. Строк WARNING нет.

### ERROR (17)

| Время | Уровень | Сообщение |
|---|---|---|
| 16 Oct 26 20:03:12 | ERROR | new row violates row-level security policy for table "transfers" |
| 16 Oct 26 20:03:12 | ERROR | balance_not_zero  -94075  Сначала рассчитайтесь |
| 16 Oct 26 20:03:12 | ERROR | invalid_invite  Приглашение недействительно. Попросите новую ссылку |
| 16 Oct 26 20:03:11 | ERROR | permission denied for table groups  Grant the required privileges to the current role with: GRANT SELECT ON public.groups TO anon; |
| 16 Oct 26 20:03:11 | ERROR | forbidden  Нет доступа к группе |
| 16 Oct 26 20:03:11 | ERROR | empty_split  Выберите хотя бы одного участника |
| 16 Oct 26 20:03:10 | ERROR | new row for relation "expenses" violates check constraint "expenses_amount_kop_check" |
| 16 Oct 26 19:49:28 | ERROR | new row violates row-level security policy for table "transfers" |
| 16 Oct 26 19:49:28 | ERROR | balance_not_zero  -94075  Сначала рассчитайтесь |
| 16 Oct 26 19:49:27 | ERROR | invalid_invite  Приглашение недействительно. Попросите новую ссылку |
| 16 Oct 26 19:49:27 | ERROR | permission denied for table groups  Grant the required privileges to the current role with: GRANT SELECT ON public.groups TO anon; |
| 16 Oct 26 19:49:27 | ERROR | forbidden  Нет доступа к группе |
| 16 Oct 26 19:49:26 | ERROR | empty_split  Выберите хотя бы одного участника |
| 16 Oct 26 19:49:26 | ERROR | new row for relation "expenses" violates check constraint "expenses_amount_kop_check" |
| 16 Oct 26 19:37:26 | ERROR | relation "profiles" already exists |
| 16 Oct 26 19:37:23 | ERROR | invalid_invite  Приглашение недействительно. Попросите новую ссылку |
| 16 Oct 26 19:37:22 | ERROR | permission denied for table groups  Grant the required privileges to the current role with: GRANT SELECT ON public.groups TO anon; |

Две серии по 7 ошибок (19:49 и 20:03) — это два e2e-прогона, по одной ошибке на каждую негативную проверку. Ошибка `relation "profiles" already exists` в 19:37:26 появилась при повторном запуске `deploy.sql` в SQL Editor: следующая строка лога — `statement: -- ДЗ5 · Все миграции одним файлом для Supabase → SQL Editor …`.

### FATAL (36)

Все 36 строк одинаковые:

```text
FATAL  password authentication failed for user "postgres"  Connection matched file "/etc/postgresql/pg_hba.conf" line 97: "host all all ::0/0 scram…
```

| Время | Кол-во |
|---|---|
| 16 Oct 26 19:27:14 | 3 |
| 16 Oct 26 19:27:13 | 6 |
| 16 Oct 26 19:26:52 | 8 |
| 16 Oct 26 19:26:48 | 3 |
| 16 Oct 26 19:26:47 | 2 |
| 16 Oct 26 19:26:39 | 1 |
| 16 Oct 26 19:26:38 | 4 |
| 16 Oct 26 19:26:35 | 2 |
| 16 Oct 26 19:26:34 | 3 |
| 16 Oct 26 19:26:33 | 4 |

Это неудачные попытки прямого подключения к БД под пользователем `postgres` с неверным паролем между 19:26:33 и 19:27:14. Источник по панели не определить. Если это были не вы (например, не попытки подключиться через psql или клиент БД), пароль базы стоит сменить.

## 3. Security Advisor

Errors: 0 · Warnings: 12 · Info: 0.

| № | Issue type | Entity/item | Description |
|---|---|---|---|
| 1 | Public Can Execute SECURITY DEFINER Function | public.get_invite_preview(p_token text) | Detects SECURITY DEFINER functions that are callable without signing i… |
| 2 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.create_group(p_name text, p_emoji tex… | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 3 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.expense_has_left_member(p_expense uui… | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 4 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.get_invite_preview(p_token text) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 5 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.group_balances(p_group uuid) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 6 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.is_active_member(p_group uuid) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 7 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.join_group(p_token text) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 8 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.leave_group(p_group uuid) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 9 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.my_groups() | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 10 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.rotate_invite(p_group uuid) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 11 | Signed-In Users Can Execute SECURITY DEFINER Funct… | public.shares_group(p_user uuid) | Detects SECURITY DEFINER functions that are callable by signed-in users… |
| 12 | Leaked Password Protection Disabled | Auth | Leaked password protection is currently disabled. |
