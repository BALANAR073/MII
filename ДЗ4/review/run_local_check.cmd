@echo off
chcp 65001 >nul
rem ДЗ4: проверка проекта на ПК — установка зависимостей, тесты, сборка.
rem Запуск из CMD: run_local_check.cmd
cd /d "%~dp0..\poravnu"
echo === ДЗ4. Проверка проекта ПоРовну на ПК ===
node --version
call npm --version
echo.
echo --- npm ci ---
call npm ci --no-audit --no-fund || goto :fail
echo.
echo --- npm test ---
call npm test || goto :fail
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
