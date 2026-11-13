param(
  [ValidateSet('prepare','start','stop','status','seed','reset','functions','web','test','push')]
  [string]$Action = 'start',
  [switch]$ConfirmLocalReset
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  $portableNode = Join-Path $env:TEMP 'klooyd-mobile-tools/node-v22.23.5-win-x64'
  if (-not (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe'))) {
    throw 'Instala Node.js 22 LTS o posterior y ejecuta npm ci en la raíz y en frontend.'
  }
  $env:PATH = $portableNode + ';' + $env:PATH
}
foreach ($dockerBin in @(
  (Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin'),
  (Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin')
)) {
  if (Test-Path -LiteralPath $dockerBin) { $env:PATH = $dockerBin + ';' + $env:PATH; break }
}
Push-Location $repoRoot
try {
  if ($Action -eq 'test') { & node.exe --test scripts/mobile-local.test.mjs }
  elseif ($Action -eq 'reset' -and $ConfirmLocalReset) { & node.exe scripts/mobile-local.mjs reset --confirm-local-reset }
  else { & node.exe scripts/mobile-local.mjs $Action }
  if ($LASTEXITCODE -ne 0) { throw "La acción local '$Action' terminó con código $LASTEXITCODE." }
} finally { Pop-Location }
