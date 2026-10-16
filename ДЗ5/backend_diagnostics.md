# ДЗ5. Диагностика бэкенда: 10 частых проблем, команды и промпты

**Выполнил:** Творогов Д.Н., гр. 4481

Справочник для «ПоРовну» на Supabase. По каждой проблеме: симптом, как проверить командой и готовый промпт для AI-агента. Большинство проблем встретились в ходе ДЗ5.

Команды ниже — для CMD на Windows (для bash — `export` вместо `set`). Переменные:

```bat
set URL=https://itppbtrmsbpreraaecqe.supabase.co
set ANON=sb_publishable_...
```

## Общий шаблон промпта

```text
Role: ты — backend-инженер, специалист по Supabase (PostgREST, RLS, Auth).
Task: найди причину ошибки и предложи минимальное исправление. Не предлагай расширять права
(GRANT для anon, отключение RLS), если ошибка — это сработавшая защита.
Context: <симптом>, <запрос>, <ответ: HTTP-статус, code, message, hint>, <строка из Logs>, <миграция/политика>.
Format: 1) причина в одном предложении; 2) какой слой (клиент / PostgREST / RLS / триггер / RPC / Auth);
3) исправление (SQL или TS); 4) тест, который это закрепит.
```

## 10 проблем

| № | Симптом | Частая причина | Проверка |
|:-:|---|---|---|
| 1 | Запрос вернул `200 []`, хотя данные есть | RLS отфильтровал строки: пользователь не участник или запрос без JWT | тот же запрос с токеном участника; в SQL Editor: `select * from pg_policies where tablename='expenses'` |
| 2 | `401 permission denied for table …` | запрос гостя (только `apikey`) или истёк токен | `curl "%URL%/rest/v1/groups" -H "apikey: %ANON%"` → должно быть 401; в клиенте — `auth.getSession()` |
| 3 | `403 new row violates row-level security policy` | `WITH CHECK` политики: вставка в чужую группу, перевод за других | сравнить поля запроса с политикой в `0004_rls.sql` |
| 4 | `400 23514` с именем CHECK или `empty_split` | неверные данные: сумма 0, пустой список участников, вес вне 1–1000 | текст в `hint`; тест в `db.test.ts` с теми же данными |
| 5 | `404 PGRST202 Could not find the function` | опечатка в имени параметра RPC (`p_group` vs `p_group_id`), функция в `private` или кэш схемы не обновлён | `curl -X POST "%URL%/rest/v1/rpc/<имя>" …`: подсказка в `hint`; после миграции — `notify pgrst, 'reload schema';` |
| 6 | `relation "…" already exists` в SQL Editor | повторный запуск `deploy.sql` на развёрнутой базе | выполнять только новую миграцию |
| 7 | После регистрации нет сессии, «Email not confirmed» | включено подтверждение email | Authentication → Providers → Email → Confirm email; `curl "%URL%/auth/v1/settings" -H "apikey: %ANON%"` → `mailer_autoconfirm` |
| 8 | Балансы расходятся на копейку, сумма ≠ 0 | смешение `numeric` и `bigint` в SQL (`sum(bigint)` → `numeric`) | тест совпадения SQL ↔ TS; `select sum(balance_kop) from group_balances('…')` должно быть 0 |
| 9 | CORS-ошибка в консоли браузера | на самом деле 401/5xx без заголовков, неверный `VITE_SUPABASE_URL` или запрос к `localhost` через прокси | `curl -i -X OPTIONS "%URL%/rest/v1/groups" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"`; проверить `.env.local` и перезапустить `npm run dev` |
| 10 | Медленные «Мои группы», 5xx по таймауту | балансы считаются заново для каждой группы | Supabase → Reports / Query Performance; `explain analyze select * from my_groups();` от имени пользователя |

## Промпты по проблемам

**1. Пустой ответ**

```text
Запрос GET /rest/v1/expenses?group_id=eq.<id> от пользователя <uuid> возвращает [] без ошибки,
а в Table Editor строки есть. Политика: <текст expenses_select_members>. Пользователь в members: <строка>.
Это RLS? Как убедиться, не отключая RLS? Дай SQL для проверки от имени пользователя
(set local role authenticated; set local request.jwt.claims …).
```

**2–3. Отказ в доступе**

```text
Запрос <метод, путь, тело> → <статус> <code> <message>. Это ошибка в коде или сработавшая защита?
Объясни, какая политика или право отказали. Если это защита — как клиенту показать понятный текст
(какой ApiErrorKind в supabaseErrors.ts), а не исправлять права.
```

**4. Ошибка валидации**

```text
Вставка расхода <JSON> даёт 400 23514 <message>. Найди в 0002_functions.sql / миграции 5 правило,
которое сработало, и проверь, что клиентская валидация (expenseValidation.ts) проверяет то же самое
до отправки. Если нет — предложи правку и тест.
```

**5. Функция не найдена**

```text
POST /rest/v1/rpc/<имя> {<параметры>} → 404 PGRST202, hint: <hint>. Сравни с сигнатурой в миграциях.
Причины по порядку: имя параметра, схема (public/private), права execute, кэш схемы PostgREST.
```

**6–7. Развёртывание и Auth**

```text
Разворачиваю схему в новом проекте Supabase. Ошибка: <текст>. Применённые миграции: <список>.
Какую миграцию выполнять и в каком порядке? Какие настройки Auth нужны для входа без подтверждения email?
```

**8. Расхождение в расчётах**

```text
SQL group_balances и TS computeBalances дают разные результаты для данных <JSON>: <результаты>.
Пройди оба алгоритма по шагам, найди расхождение (типы, округление, порядок раздачи остатка
по joined_at, user_id) и предложи тест на случайных данных.
```

**9. CORS**

```text
В консоли браузера: <ошибка CORS> для <URL>. Ответ preflight: <curl -i OPTIONS>. Отличи настоящий CORS
от маскировки (401, 5xx, неверный адрес). Что проверить в .env.local и в Authentication → URL Configuration?
```

**10. Производительность**

```text
my_groups выполняется <N> мс при <G> группах и <E> расходах. EXPLAIN ANALYZE: <план>.
Предложи индекс или денормализацию (таблица expense_parts с триггером), оцени выигрыш и цену,
сохрани совпадение расчёта с TypeScript.
```

## Общие проверки

```bat
cd ДЗ5\poravnu
npm test               :: 202 теста, включая 36 тестов БД на PGlite — без интернета
npm run test:e2e       :: 34 запроса к живому Supabase, отчёт в ..\api_tests\e2e_results.md
```

Если `npm test` зелёный, а `test:e2e` — нет, проблема в развёртывании: не применена миграция или настройки Auth. Если красный `npm test` — проблема в коде или в SQL.
