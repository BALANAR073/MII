# ДЗ5. End-to-end проверка API на Supabase

- Дата: 2026-10-16 17:03 UTC
- Проект: itppbtrmsbpreraaecqe
- Режим: полный прогон на новых тестовых пользователях
- Итог: **31 из 31** проверок прошли

| № | Проверка | Запрос | Результат | мс |
|---|---|---|---|---|
| 1 | ✅ Регистрация Аня | `POST /auth/v1/signup {email: "e2e-mvb7ussg-anya@example.com", data: {name: "Аня"}}` | user.id = 03eb09ec…, профиль создан триггером | 1572 |
| 2 | ✅ Регистрация Боря | `POST /auth/v1/signup {email: "e2e-mvb7ussg-borya@example.com", data: {name: "Боря"}}` | user.id = 64b037e0…, профиль создан триггером | 393 |
| 3 | ✅ Регистрация Вика | `POST /auth/v1/signup {email: "e2e-mvb7ussg-vika@example.com", data: {name: "Вика"}}` | user.id = bdac2d79…, профиль создан триггером | 620 |
| 4 | ✅ Регистрация Гоша | `POST /auth/v1/signup {email: "e2e-mvb7ussg-gosha@example.com", data: {name: "Гоша"}}` | user.id = c05a078d…, профиль создан триггером | 504 |
| 5 | ✅ Создание группы (RPC create_group) | `POST /rest/v1/rpc/create_group {p_name, p_emoji}` | HTTP 200, group.id = 3d5e8eca… | 354 |
| 6 | ✅ Вступление по ссылке: Боря (RPC join_group) | `POST /rest/v1/rpc/join_group {p_token}` | HTTP 200 | 250 |
| 7 | ✅ Вступление по ссылке: Вика (RPC join_group) | `POST /rest/v1/rpc/join_group {p_token}` | HTTP 200 | 478 |
| 8 | ✅ Вступление по ссылке: Гоша (RPC join_group) | `POST /rest/v1/rpc/join_group {p_token}` | HTTP 200 | 241 |
| 9 | ✅ Создание расхода «Хостел» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 236 |
| 10 | ✅ Создание расхода «Продукты» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 176 |
| 11 | ✅ Создание расхода «Такси» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 155 |
| 12 | ✅ Создание расхода «Кофе» (CREATE) | `POST /rest/v1/expenses {group_id, title, amount_kop, payer_id, split, date}` | HTTP 201, created_by = автор (auth.uid()) | 151 |
| 13 | ✅ Чтение группы участником (READ) | `GET /rest/v1/expenses?group_id=eq.<id>&order=date.desc` | HTTP 200, 4 расхода | 187 |
| 14 | ✅ Балансы как в AC-07.1 (RPC group_balances) | `POST /rest/v1/rpc/group_balances {p_group}` | Аня +8 135,80 · Боря −940,75 · Вика −3 197,53 · Гоша −3 997,52 ₽ — сумма 0 | 219 |
| 15 | ✅ Изменение своего расхода (UPDATE) | `PATCH /rest/v1/expenses?id=eq.<id> {title}` | HTTP 200, 1 строка | 206 |
| 16 | ✅ Чужой расход изменить нельзя (RLS) | `PATCH /rest/v1/expenses?id=eq.<чужой> — от Бори` | HTTP 200, 0 строк — RLS отфильтровал | 202 |
| 17 | ✅ Неверные данные отклоняет база (CHECK, 23514) | `POST /rest/v1/expenses {amount_kop: 0}` | HTTP 400, code 23514 | 184 |
| 18 | ✅ Пустой список участников (триггер, 23514) | `POST /rest/v1/expenses {split: {memberIds: []}}` | HTTP 400, empty_split: «Выберите хотя бы одного участника» | 123 |
| 19 | ✅ Чужой пользователь не видит группу (RLS) | `GET /rest/v1/expenses — от постороннего` | HTTP 200, 0 строк | 184 |
| 20 | ✅ Чужой пользователь не может добавить расход (RLS, 42501) | `POST /rest/v1/expenses — от постороннего` | HTTP 403, code 42501 | 187 |
| 21 | ✅ Гость без входа не читает таблицы (401/42501) | `GET /rest/v1/groups — только с apikey` | HTTP 401, permission denied for table groups | 156 |
| 22 | ✅ Гость видит превью приглашения (RPC get_invite_preview) | `POST /rest/v1/rpc/get_invite_preview {p_token}` | HTTP 200, «Поездка в Казань», 4 участника | 170 |
| 23 | ✅ Неверная ссылка — 404 (ERR-8) | `POST /rest/v1/rpc/get_invite_preview {p_token: "nope"}` | HTTP 404, invalid_invite | 204 |
| 24 | ✅ Выход с долгом запрещён (RPC leave_group, 409) | `POST /rest/v1/rpc/leave_group {p_group} — от Бори` | HTTP 409, долг -94075 коп. | 204 |
| 25 | ✅ Отметка перевода Боря → Аня (CREATE transfers) | `POST /rest/v1/transfers {from_id, to_id, amount_kop: 94075}` | HTTP 201 | 117 |
| 26 | ✅ Перевод за других отметить нельзя (RLS) | `POST /rest/v1/transfers {from: Вика, to: Аня} — от Бори` | HTTP 403, code 42501 | 156 |
| 27 | ✅ «Мои группы» со своим балансом (RPC my_groups) | `POST /rest/v1/rpc/my_groups` | HTTP 200, баланс Бори 0 после перевода | 172 |
| 28 | ✅ Удаление своего перевода (DELETE) | `DELETE /rest/v1/transfers?id=eq.<id>` | HTTP 200 | 170 |
| 29 | ✅ Удаление своего расхода (DELETE) | `DELETE /rest/v1/expenses?id=eq.<id>` | HTTP 200 | 143 |
| 30 | ✅ Истёкший / поддельный токен — 401 | `GET /rest/v1/groups с Authorization: Bearer <поддельный JWT>` | HTTP 401 | 164 |
| 31 | ✅ CORS: preflight с чужого origin разрешён, защита — на RLS | `OPTIONS /rest/v1/expenses, Origin: http://localhost:5173` | HTTP 200, Access-Control-Allow-Origin: * | 101 |
