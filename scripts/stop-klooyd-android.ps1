$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $repoRoot 'local/state.local/phone-access.json'
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
foreach ($entry in @(@{Id=$state.tunnelPid; Pattern='cloudflared.*--url http://127\.0\.0\.1:5174'}, @{Id=$state.gatewayPid; Pattern='mobile-phone(-gateway)?\.mjs'})) {
  if (-not $entry.Id) { continue }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$entry.Id)"
  if ($processInfo -and $processInfo.CommandLine -match $entry.Pattern) {
    Stop-Process -Id ([int]$entry.Id)
  } elseif ($processInfo) {
    throw 'El PID ya pertenece a otro proceso; no se detuvo.'
  }
}
Write-Output 'Acceso Android detenido. Supabase local conserva los datos.'
