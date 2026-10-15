# Запуск экспериментов ДЗ2 (Шаги 4–5) через Claude Code в неинтерактивном режиме.
# Запуск:  powershell -ExecutionPolicy Bypass -File run_experiments.ps1
# Результаты сохраняются в папку results\ как есть, без правок.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$root = $PSScriptRoot
$results = Join-Path $root 'results'
New-Item -ItemType Directory -Force -Path $results | Out-Null
$version = (& claude --version) -join ' '

function Invoke-Claude {
    param([string]$Dir, [string]$PromptFile, [string]$OutFile, [string]$Title, [switch]$Continue)

    $prompt = Get-Content -Path (Join-Path $root "prompts\$PromptFile") -Raw -Encoding UTF8
    $cliArgs = @()
    if ($Continue) { $cliArgs += '-c' }
    $cliArgs += @('-p', $prompt, '--output-format', 'text', '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', 'Bash')

    Push-Location (Join-Path $root $Dir)
    Write-Host ">>> $Title ($Dir, $PromptFile)..."
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try { $answer = (& claude @cliArgs) -join "`n" } finally { Pop-Location }
    $sw.Stop()

    $header = @(
        "# $Title", '',
        "- Дата запуска: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        "- Claude Code: $version",
        "- Рабочая папка: experiments\$Dir",
        "- Файл правил CLAUDE.md в папке: $(if (Test-Path (Join-Path $root "$Dir\CLAUDE.md")) { 'ДА' } else { 'НЕТ' })",
        "- Время ответа: $([math]::Round($sw.Elapsed.TotalSeconds)) с", '',
        '## Промпт', '', '```text', $prompt.TrimEnd(), '```', '',
        '## Сырой ответ агента', ''
    ) -join "`n"
    [IO.File]::WriteAllText((Join-Path $results $OutFile), $header + $answer + "`n", $utf8)
    Write-Host "    сохранено: results\$OutFile ($($answer.Length) символов)"
}

# --- Шаг 5: одна и та же задача без правил и с правилами ---
Invoke-Claude -Dir 'no_rules'   -PromptFile 'test_task.txt' -OutFile 'test_before_rules.md' -Title 'Тест: ответ БЕЗ файла правил'
Invoke-Claude -Dir 'with_rules' -PromptFile 'test_task.txt' -OutFile 'test_after_rules.md'  -Title 'Тест: ответ С файлом правил'

# --- Шаг 4: цепочка Chain-of-Thought (каждый шаг продолжает предыдущий диалог, флаг -c) ---
Invoke-Claude -Dir 'cot' -PromptFile 'cot_1.txt' -OutFile 'cot_step1.md' -Title 'CoT, шаг 1: анализ'
Invoke-Claude -Dir 'cot' -PromptFile 'cot_2.txt' -OutFile 'cot_step2.md' -Title 'CoT, шаг 2: типы и сигнатуры' -Continue
Invoke-Claude -Dir 'cot' -PromptFile 'cot_3.txt' -OutFile 'cot_step3.md' -Title 'CoT, шаг 3: реализация'     -Continue
Invoke-Claude -Dir 'cot' -PromptFile 'cot_4.txt' -OutFile 'cot_step4.md' -Title 'CoT, шаг 4: тесты и самопроверка' -Continue

Write-Host 'Готово.'
