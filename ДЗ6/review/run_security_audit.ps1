# ДЗ6: AI-аудит безопасности по OWASP Top 10 (Claude Code в неинтерактивном режиме, только чтение).
# Запуск из CMD:  powershell -ExecutionPolicy Bypass -File run_security_audit.ps1
# Ответ сохраняется как есть в ДЗ6\ai_security_audit.md.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

foreach ($v in 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT') {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}

$dz6 = Split-Path $PSScriptRoot -Parent
$out = Join-Path $dz6 'ai_security_audit.md'
$prompt = Get-Content -Path (Join-Path $PSScriptRoot 'security_audit_prompt.txt') -Raw -Encoding UTF8
$version = (& claude --version) -join ' '

Write-Host '=== ДЗ6. AI-аудит безопасности ==='
Write-Host "Claude Code: $version"
Write-Host "Папка: $dz6"
Write-Host 'Запускаю claude -p, ответ займёт несколько минут...'

Push-Location $dz6
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
    $answer = (& claude -p $prompt --output-format text --add-dir (Join-Path (Split-Path $dz6 -Parent) '.github') --disallowedTools Edit Write NotebookEdit Bash) -join "`n"
} finally { Pop-Location }
$sw.Stop()

$header = @(
    '# ДЗ6. AI-аудит безопасности (OWASP Top 10)', '',
    "- Дата запуска: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    "- Claude Code: $version",
    '- Режим: claude -p (неинтерактивный), запрещены Edit, Write, NotebookEdit, Bash',
    '- Рабочая папка: ДЗ6 (+ .github для чтения workflow)',
    "- Время ответа: $([math]::Round($sw.Elapsed.TotalSeconds)) с", '',
    '## Промпт', '', '```text', $prompt.TrimEnd(), '```', '',
    '## Сырой ответ агента', ''
) -join "`n"
[IO.File]::WriteAllText($out, $header + $answer + "`n", $utf8)

Write-Host ''
Write-Host "Сохранено: ДЗ6\ai_security_audit.md ($($answer.Length) символов, $([math]::Round($sw.Elapsed.TotalSeconds)) с)"
Write-Host '--- Итоговая оценка из ответа ---'
($answer -split "`n") | Select-String -Pattern '\d+\s*/\s*10|из\s+10' | Select-Object -Last 3 | ForEach-Object { Write-Host $_.Line }
Write-Host '=== ГОТОВО ==='
