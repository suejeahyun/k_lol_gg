param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
  throw "Project root not found: $ProjectRoot"
}

Push-Location $ProjectRoot
try {
  $SqlPath = Join-Path $ProjectRoot 'prisma\test-destruction-auction-tier-effects.sql'
  if (-not (Test-Path -LiteralPath $SqlPath)) {
    throw "SQL file not found: $SqlPath"
  }

  Write-Host '[K-LOL.GG] Running destruction auction tier effects test seed...'
  npx prisma db execute --file $SqlPath
  Write-Host '[K-LOL.GG] Done. Check the SELECT output in DB console or open /admin/progress/destruction and find [TEST] 멸망전 경매 티어 연출 테스트.'
}
finally {
  Pop-Location
}
