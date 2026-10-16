# ДЗ3, Шаг 6: проверка ТЗ AI-агентом (Claude Code в неинтерактивном режиме).
# Запуск из CMD:  powershell -ExecutionPolicy Bypass -File run_tz_review.ps1
# Ответ сохраняется как есть в ДЗ3\tz_ai_review.md.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

# Запуск как из обычного CMD: убираем переменные родительской сессии Claude Code
foreach ($v in 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT') {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}

$dz3 = Split-Path $PSScriptRoot -Parent
$out = Join-Path $dz3 'tz_ai_review.md'
$prompt = Get-Content -Path (Join-Path $PSScriptRoot 'tz_review_prompt.txt') -Raw -Encoding UTF8
$version = (& claude --version) -join ' '

Write-Host '=== ДЗ3. AI-ревью технического задания ==='
Write-Host "Claude Code: $version"
Write-Host "Папка: $dz3"
Write-Host 'Запускаю claude -p, ответ займёт несколько минут...'

Push-Location $dz3
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
    $answer = (& claude -p $prompt --output-format text --disallowedTools Edit Write NotebookEdit Bash) -join "`n"
} finally { Pop-Location }
$sw.Stop()

$header = @(
    '# ДЗ3. AI-ревью технического задания', '',
    "- Дата запуска: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    "- Claude Code: $version",
    '- Режим: claude -p (неинтерактивный), запрещены Edit, Write, NotebookEdit, Bash',
    '- Рабочая папка: ДЗ3',
    "- Время ответа: $([math]::Round($sw.Elapsed.TotalSeconds)) с", '',
    '## Промпт', '', '```text', $prompt.TrimEnd(), '```', '',
    '## Сырой ответ агента', ''
) -join "`n"
[IO.File]::WriteAllText($out, $header + $answer + "`n", $utf8)

Write-Host ''
Write-Host "Сохранено: ДЗ3\tz_ai_review.md ($($answer.Length) символов, $([math]::Round($sw.Elapsed.TotalSeconds)) с)"
Write-Host '--- Итоговая оценка из ответа ---'
($answer -split "`n") | Select-String -Pattern '/10|из 10|10-балл' | Select-Object -Last 3 | ForEach-Object { Write-Host $_.Line }
Write-Host '=== ГОТОВО ==='
