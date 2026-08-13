# Daily version-drift check, run unattended by the "MCP Context Index Watch" scheduled task.
#
# Metadata only: no install, no execution, no sandbox, a few seconds. It appends to
# results/versions.jsonl, rewrites the drift report, and leaves a one-line summary at
# results/last-watch.txt so a later session can read the state without parsing JSONL.
#
# It deliberately does NOT re-probe, does NOT re-pin the cohort, and does NOT push to the public
# repo. Publishing an updated drift report is a human decision: re-run
# `node scripts/build-publication.mjs`, then commit and push.
#
# ---------------------------------------------------------------------------------------------
# THIS TASK IS WORKSTATION-ONLY AND MUST BE DELETED WHEN THE HARNESS MOVES TO A LINUX BOX.
# Removal:  Unregister-ScheduledTask -TaskName 'MCP Context Index Watch' -Confirm:$false
# See "Scheduled automation" in ..\README.md. A scheduled task pointing at a stale workstation
# path is exactly the kind of leftover that outlives its purpose.
# ---------------------------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("watch_{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  watch start" | Add-Content -Path $log

$out = & node src/watch.js *>&1
$code = $LASTEXITCODE
$out | ForEach-Object { Add-Content -Path $log -Value $_ }

if ($code -ne 0) {
  $summary = @(
    "watch $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "result: FAILED (exit $code)"
    "log: $log"
  )
} else {
  # The counts line the watcher prints, e.g. "  moved: 23  unpublished: 0  deprecated: 0  errors: 0"
  $counts = ($out | Select-String -Pattern '^\s+moved:').ToString().Trim()
  $summary = @(
    "watch $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "result: ok"
    $counts
    "report: docs\version-drift-dev-tooling-v1.md"
    "log: $log"
    ""
    "Not published. To publish this drift report:"
    "  node scripts\build-publication.mjs"
    "  cd ..\mcp-context-index; git add -A; git commit; git push"
  )
}

$summary | Set-Content -Path (Join-Path $root 'results\last-watch.txt') -Encoding utf8
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  watch done (exit $code)" | Add-Content -Path $log

# Keep the log directory from growing without bound; the evidence lives in versions.jsonl.
Get-ChildItem $logDir -Filter 'watch_*.log' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
