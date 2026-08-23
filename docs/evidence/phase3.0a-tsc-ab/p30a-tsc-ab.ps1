# Phase 3.0A — TypeScript crash A/B/C experiment runner
# Runs the exact historical crash command: bunx --bun tsc --noEmit -p tsconfig.json
# from packages/opencode (tsc resolves to workspace typescript 5.8.2).
$ErrorActionPreference = "Continue"
$root = "e:\software programming\opencode-dev"
$db = Join-Path $root ".db-rehearsal"
$dbTmp = Join-Path $root ".db-rehearsal.P30A-TMP"
$pkg = Join-Path $root "packages\opencode"

function MoveDir([string]$from, [string]$to) {
  for ($i = 0; $i -lt 12; $i++) {
    try { [System.IO.Directory]::Move($from, $to); return $true }
    catch { Start-Sleep -Seconds 5 }
  }
  return $false
}

function RunCase([string]$name, [bool]$dbPresent) {
  Set-Location $pkg
  $out = Join-Path $root ".tmp\p30a-tsc-$name.log"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  & bunx --bun tsc --noEmit -p tsconfig.json *> $out
  $code = $LASTEXITCODE
  $sw.Stop()
  Write-Output "== CASE $name (db-rehearsal present: $dbPresent) =="
  Write-Output "command   : bunx --bun tsc --noEmit -p tsconfig.json"
  Write-Output "cwd       : $pkg"
  Write-Output "exit_code : $code"
  Write-Output "elapsed_ms: $($sw.ElapsedMilliseconds)"
  Write-Output "log_lines : $((Get-Content $out | Measure-Object -Line).Lines)"
  Write-Output "--- first 6 log lines ---"
  Get-Content $out -TotalCount 6
  Write-Output "--- last 4 log lines ---"
  Get-Content $out -Tail 4
  Write-Output ""
}

Write-Output "typescript : $(& bunx --bun tsc --version)"
Write-Output "bun        : $(& bun --version)"
Write-Output "node       : $(& node --version)"
Write-Output "tsconfig   : $pkg\tsconfig.json"
Write-Output ""

# Case B: .db-rehearsal present (current state)
if (-not (Test-Path $db)) { throw ".db-rehearsal missing at start" }
RunCase "B" $true

# Case A/C: .db-rehearsal absent (working tree otherwise identical: all 3.0 changes committed)
if (-not (MoveDir $db $dbTmp)) { throw "could not move .db-rehearsal away" }
RunCase "A" $false

# restore
if (-not (MoveDir $dbTmp $db)) { throw "FAILED to restore .db-rehearsal — manual action needed" }
Write-Output "restored   : $(Test-Path $db)"
