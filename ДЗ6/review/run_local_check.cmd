@echo off
chcp 65001 >nul
rem ДЗ6: проверка проекта на ПК — зависимости, тесты (фронтенд, API-функции, БД на PGlite), аудит, сборка.
cd /d "%~dp0..\poravnu"
echo === ДЗ6. Проверка проекта ПоРовну на ПК ===
node --version
echo.
echo --- npm ci ---
call npm ci --no-audit --no-fund || goto :fail
echo.
echo --- npm test ---
call npm test || goto :fail
echo.
echo --- npm audit (production) ---
call npm audit --omit=dev --audit-level=high || goto :fail
echo.
echo --- npm run build ---
call npm run build || goto :fail
echo.
echo === ГОТОВО: тесты и сборка прошли ===
goto :eof
:fail
echo.
echo === ОШИБКА: см. вывод выше ===
exit /b 1
