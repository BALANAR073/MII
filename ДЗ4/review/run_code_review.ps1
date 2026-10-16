# ДЗ4, Шаг 7: AI-ревью кода фронтенда (Claude Code в неинтерактивном режиме).
# Запуск из CMD:  powershell -ExecutionPolicy Bypass -File run_code_review.ps1
# Ответ сохраняется как есть в ДЗ4\ai_code_review.md.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

# Запуск как из обычного CMD: убираем переменные родительской сессии Claude Code
foreach ($v in 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT') {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}

$dz4 = Split-Path $PSScriptRoot -Parent
$out = Join-Path $dz4 'ai_code_review.md'
$prompt = Get-Content -Path (Join-Path $PSScriptRoot 'code_review_prompt.txt') -Raw -Encoding UTF8
$version = (& claude --version) -join ' '

Write-Host '=== ДЗ4. AI-ревью кода фронтенда ==='
Write-Host "Claude Code: $version"
Write-Host "Папка: $dz4"
Write-Host 'Запускаю claude -p, ответ займёт несколько минут...'

Push-Location $dz4
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
    $answer = (& claude -p $prompt --output-format text --add-dir (Join-Path (Split-Path $dz4 -Parent) 'ДЗ3') --disallowedTools Edit Write NotebookEdit Bash) -join "`n"
} finally { Pop-Location }
$sw.Stop()

$header = @(
    '# ДЗ4. AI-ревью кода фронтенда', '',
    "- Дата запуска: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    "- Claude Code: $version",
    '- Режим: claude -p (неинтерактивный), запрещены Edit, Write, NotebookEdit, Bash',
    '- Рабочая папка: ДЗ4',
    "- Время ответа: $([math]::Round($sw.Elapsed.TotalSeconds)) с", '',
    '## Промпт', '', '```text', $prompt.TrimEnd(), '```', '',
    '## Сырой ответ агента', ''
) -join "`n"
[IO.File]::WriteAllText($out, $header + $answer + "`n", $utf8)

Write-Host ''
Write-Host "Сохранено: ДЗ4\ai_code_review.md ($($answer.Length) символов, $([math]::Round($sw.Elapsed.TotalSeconds)) с)"
Write-Host '--- Итоговая оценка из ответа ---'
($answer -split "`n") | Select-String -Pattern '\d+\s*/\s*10|из\s+10' | Select-Object -Last 3 | ForEach-Object { Write-Host $_.Line }
Write-Host '=== ГОТОВО ==='
