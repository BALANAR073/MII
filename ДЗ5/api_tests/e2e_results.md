# ДЗ5. End-to-end проверка API на Supabase

- Дата: 2026-10-16 17:35 UTC
- Проект: itppbtrmsbpreraaecqe
- Режим: полный прогон на новых тестовых пользователях
- Итог: **34 из 34** проверок прошли

| № | Проверка | Запрос | Результат | мс |
|---|---|---|---|---|
| 1 | ✅ Регистрация Аня | `POST /auth/v1/signup {email: "e2e-mvb90rcl-anya@example.com", data: {name: "Аня"}}` | user.id = ddd72a60…, профиль создан триггером | 1002 |
| 2 | ✅ Регистрация Боря | `POST /auth/v1/signup {email: "e2e-mvb90rcl-borya@example.com", data: {name: "Боря"}}` | user.id = 8ccfef0c…, профиль создан триггером | 392 |
| 3 | ✅ Регистрация Вика | `POST /auth/v1/signup {email: "e2e-mvb90rcl-vika@example.com", data: {name: "Вика"}}` | user.id = 2648e4a8…, профиль создан триггером | 425 |
| 4 | ✅ Регистрация Гоша | `POST /auth/v1/signup {email: "e2e-mvb90rcl-gosha@example.com", data: {name: "Гоша"}}` | user.id = c6a32242…, профиль создан триггером | 362 |
| 5 | ✅ Создание группы (RPC create_group) | `POST /rest/v1/rpc/create_group {p_name, p_emoji}` | HTTP 200, group.id = 53468878… | 427 |
| 6 | ✅ Вступление по ссылке: Боря (RPC join_group) | `POST /rest/v1/rpc/join_group {p_token}` | HTTP 200 | 405 |
| 7 | ✅ Вступление по ссылке: Вика (RPC join_group) | `POST /rest/v1/rpc/join_group {p_token}` | HTTP 200 | 171 |
| 8 | ✅ Вступление по ссылке: Гоша (RPC join_group) | `POST /rest/v1/rpc/join_group {p_token}` | HTTP 200 | 148 |
| 9 | ✅ Создание расхода «Хостел» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 374 |
| 10 | ✅ Создание расхода «Продукты» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 404 |
| 11 | ✅ Создание расхода «Такси» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 376 |
| 12 | ✅ Создание расхода «Кофе» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 413 |
| 13 | ✅ Чтение группы участником (READ) | `GET /rest/v1/expenses?group_id=eq.<id>&order=date.desc` | HTTP 200, 4 расхода | 406 |
| 14 | ✅ Балансы как в AC-07.1 (RPC group_balances) | `POST /rest/v1/rpc/group_balances {p_group}` | Аня +8 135,80 · Боря −940,75 · Вика −3 197,53 · Гоша −3 997,52 ₽ — сумма 0 | 243 |
| 15 | ✅ Изменение своего расхода (UPDATE) | `PATCH /rest/v1/expenses?id=eq.<id> {title}` | HTTP 200, 1 строка | 401 |
| 16 | ✅ Чужой расход изменить нельзя (RLS) | `PATCH /rest/v1/expenses?id=eq.<чужой> — от Бори` | HTTP 200, 0 строк — RLS отфильтровал | 363 |
| 17 | ✅ Неверные данные отклоняет база (CHECK, 23514) | `POST /rest/v1/expenses {amount_kop: 0}` | HTTP 400, code 23514 | 353 |
| 18 | ✅ Пустой список участников (триггер, 23514) | `POST /rest/v1/expenses {split: {memberIds: []}}` | HTTP 400, empty_split: «Выберите хотя бы одного участника» | 146 |
| 19 | ✅ Чужой пользователь не видит группу (RLS) | `GET /rest/v1/expenses — от постороннего` | HTTP 200, 0 строк | 202 |
| 20 | ✅ Чужой пользователь не может добавить расход (RLS, 42501) | `POST /rest/v1/expenses — от постороннего` | HTTP 403, code 42501 | 352 |
| 21 | ✅ Гость без входа не читает таблицы (401/42501) | `GET /rest/v1/groups — только с apikey` | HTTP 401, permission denied for table groups | 348 |
| 22 | ✅ Гость видит превью приглашения (RPC get_invite_preview) | `POST /rest/v1/rpc/get_invite_preview {p_token}` | HTTP 200, «Поездка в Казань», 4 участника | 185 |
| 23 | ✅ Неверная ссылка — 404 (ERR-8) | `POST /rest/v1/rpc/get_invite_preview {p_token: "nope"}` | HTTP 404, invalid_invite | 381 |
| 24 | ✅ Выход с долгом запрещён (RPC leave_group, 409) | `POST /rest/v1/rpc/leave_group {p_group} — от Бори` | HTTP 409, долг -94075 коп. | 400 |
| 25 | ✅ Отметка перевода Боря → Аня (CREATE transfers) | `POST /rest/v1/transfers {from_id, to_id, amount_kop: 94075}` | HTTP 201 | 175 |
| 26 | ✅ Перевод за других отметить нельзя (RLS) | `POST /rest/v1/transfers {from: Вика, to: Аня} — от Бори` | HTTP 403, code 42501 | 373 |
| 27 | ✅ «Мои группы» со своим балансом (RPC my_groups) | `POST /rest/v1/rpc/my_groups` | HTTP 200, баланс Бори 0 после перевода | 192 |
| 28 | ✅ Удаление своего перевода (DELETE) | `DELETE /rest/v1/transfers?id=eq.<id>` | HTTP 200 | 142 |
| 29 | ✅ Удаление своего расхода (DELETE) | `DELETE /rest/v1/expenses?id=eq.<id>` | HTTP 200 | 142 |
| 30 | ✅ Email других участников не читается (права на колонки) | `GET /rest/v1/profiles?select=email — от Бори` | HTTP 403, code 42501 | 194 |
| 31 | ✅ Нельзя подменить created_at при вставке (права на колонки) | `POST /rest/v1/transfers {created_at: "2000-01-01"}` | HTTP 403, code 42501 | 174 |
| 32 | ✅ Служебные функции не опубликованы в API (схема private) | `POST /rest/v1/rpc/is_active_member` | HTTP 404, PGRST202 — функция не найдена в схеме public | 364 |
| 33 | ✅ Истёкший / поддельный токен — 401 | `GET /rest/v1/groups с Authorization: Bearer <поддельный JWT>` | HTTP 401 | 363 |
| 34 | ✅ CORS: preflight с чужого origin разрешён, защита — на RLS | `OPTIONS /rest/v1/expenses, Origin: http://localhost:5173` | HTTP 200, Access-Control-Allow-Origin: * | 47 |
