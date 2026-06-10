$ProjectRoot = Split-Path -Parent $PSScriptRoot
$files = @(
  "src/styles/mobile-app-page-fix.css",
  "src/styles/mobile-admin-final.css",
  "src/styles/mobile-admin-app-simplified.css",
  "src/styles/mobile-admin-app-v8.css",
  "src/styles/mobile-unified-v9.css",
  "src/styles/mobile-app-admin-v10.css",
  "src/styles/mobile-app-admin-v11.css",
  "src/styles/mobile-unified-v12.css",
  "src/styles/mobile-unified-v13.css"
)
foreach ($file in $files) {
  $path = Join-Path $ProjectRoot $file
  if (Test-Path $path) {
    Remove-Item $path -Force
    Write-Host "removed $file"
  }
}
Write-Host "PC CSS restore cleanup complete" -ForegroundColor Green
