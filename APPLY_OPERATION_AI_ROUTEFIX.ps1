$ErrorActionPreference = "Stop"

Write-Host "[1/3] Checking operation AI addons page..."

$target = "src\app\(admin)\admin\operation-ai\addons\page.tsx"

if (!(Test-Path $target)) {
  throw "Missing route file: $target"
}

Write-Host "[2/3] Running lint..."
npm run lint

Write-Host "[3/3] Running build..."
npm run build

Write-Host "Done. /admin/operation-ai/addons route has been verified."
