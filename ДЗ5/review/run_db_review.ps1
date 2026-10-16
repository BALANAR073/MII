# ДЗ5, Шаг 1/8: AI-ревью схемы БД и политик RLS (Claude Code в неинтерактивном режиме).
# Запуск из CMD:  powershell -ExecutionPolicy Bypass -File run_db_review.ps1
# Ответ сохраняется как есть в ДЗ5\ai_db_review.md.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

foreach ($v in 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT') {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}

$dz5 = Split-Path $PSScriptRoot -Parent
$out = Join-Path $dz5 'ai_db_review.md'
$prompt = Get-Content -Path (Join-Path $PSScriptRoot 'db_review_prompt.txt') -Raw -Encoding UTF8
$version = (& claude --version) -join ' '

Write-Host '=== ДЗ5. AI-ревью схемы БД и RLS ==='
Write-Host "Claude Code: $version"
Write-Host "Папка: $dz5"
Write-Host 'Запускаю claude -p, ответ займёт несколько минут...'

Push-Location $dz5
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
    $answer = (& claude -p $prompt --output-format text --add-dir (Join-Path (Split-Path $dz5 -Parent) 'ДЗ3') --disallowedTools Edit Write NotebookEdit Bash) -join "`n"
} finally { Pop-Location }
$sw.Stop()

$header = @(
    '# ДЗ5. AI-ревью схемы БД и политик RLS', '',
    "- Дата запуска: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    "- Claude Code: $version",
    '- Режим: claude -p (неинтерактивный), запрещены Edit, Write, NotebookEdit, Bash',
    '- Рабочая папка: ДЗ5',
    "- Время ответа: $([math]::Round($sw.Elapsed.TotalSeconds)) с", '',
    '## Промпт', '', '```text', $prompt.TrimEnd(), '```', '',
    '## Сырой ответ агента', ''
) -join "`n"
[IO.File]::WriteAllText($out, $header + $answer + "`n", $utf8)

Write-Host ''
Write-Host "Сохранено: ДЗ5\ai_db_review.md ($($answer.Length) символов, $([math]::Round($sw.Elapsed.TotalSeconds)) с)"
Write-Host '--- Итоговая оценка из ответа ---'
($answer -split "`n") | Select-String -Pattern '\d+\s*/\s*10|из\s+10' | Select-Object -Last 3 | ForEach-Object { Write-Host $_.Line }
Write-Host '=== ГОТОВО ==='
