param(
  [string]$ProjectRoot = "E:\k-LOL.GG\k_lol_gg"
)

$ErrorActionPreference = "Stop"

Set-Location $ProjectRoot

$sqlPath = Join-Path $ProjectRoot "prisma\test-destruction-auction-30.sql"

if (!(Test-Path $sqlPath)) {
  throw "SQL file not found: $sqlPath"
}

Write-Host "[K-LOL.GG] Running destruction auction 30-participant test seed..." -ForegroundColor Cyan
npx prisma db execute --file $sqlPath --schema "prisma\schema.prisma"

Write-Host "[K-LOL.GG] Done. Check /admin/progress/destruction" -ForegroundColor Green
