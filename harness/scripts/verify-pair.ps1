# Runs one reproducibility pair against the pinned cohort, unattended, and writes a verdict.
#
# Two sweeps of the identical pinned cohort, then the comparator, then a regenerated index.
# Costs nothing against any AI subscription: the harness is plain Node, no model in the loop.
# Roughly 45 minutes wall clock, dominated by npm install.
#
# Non-destructive. It appends to results/*.jsonl (never rewrites), regenerates docs/index-*.md,
# and deletes only its own sandbox/ subdirectories. It touches nothing outside mcp-probe/.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir "verify-pair_$stamp.log"

function Log($msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
  Write-Output $line
  Add-Content -Path $log -Value $line
}

Log "verify-pair start, harness root $root"

# A stale lock from a killed sweep would block both runs. Clear it only if no process holds it.
$lock = Join-Path $root 'results\.run.lock'
if (Test-Path $lock) {
  $held = Get-Content $lock -Raw | ConvertFrom-Json
  $alive = Get-Process -Id $held.pid -ErrorAction SilentlyContinue
  if ($alive) {
    Log "ABORT: a sweep is already running (pid $($held.pid), run $($held.run_id))"
    exit 1
  }
  Log "clearing stale lock from run $($held.run_id)"
  Remove-Item $lock -Force
}

foreach ($pass in 'A', 'B') {
  Log "sweep $pass starting"
  $env:RUN_NOTE = "scheduled verification pair, leg $pass"
  & node src/run.js *>&1 | Tee-Object -FilePath $log -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { Log "sweep $pass FAILED with exit $LASTEXITCODE"; exit $LASTEXITCODE }
  Log "sweep $pass done"
}

Log "comparing"
$verdictText = & node src/reproduce.js *>&1
$verdictText | ForEach-Object { Add-Content -Path $log -Value $_ }
$verdictText | Write-Output

& node src/report.js *>&1 | Out-Null

$verdict = ($verdictText | Select-String -Pattern '^VERDICT: (\S+)').Matches.Groups[1].Value
Log "VERDICT $verdict"

# One-line summary at a fixed path, so the next session can read the outcome without
# parsing a sweep log or spending tokens on the full JSONL.
$summary = Join-Path $root 'results\last-verification.txt'
@(
  "verification run $stamp"
  "verdict: $verdict"
  "log: $log"
  ""
  ($verdictText -join "`n")
) | Set-Content -Path $summary -Encoding utf8

Log "wrote $summary"
