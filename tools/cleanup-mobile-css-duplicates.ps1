$ProjectRoot = Split-Path -Parent $PSScriptRoot
$files = @(
  "src/styles/mobile-browser.css",
  "src/styles/overrides/mobile-overrides.css",
  "src/styles/responsive.css",
  "src/styles/mobile-app-page-fix.css",
  "src/styles/mobile-admin-final.css",
  "src/styles/mobile-admin-app-simplified.css",
  "src/styles/mobile-admin-app-v8.css",
  "src/styles/mobile-unified-v9.css",
  "src/styles/mobile-app-admin-v10.css",
  "src/styles/mobile-app-admin-v11.css",
  "src/styles/mobile-unified-v12.css"
)
foreach ($file in $files) {
  $path = Join-Path $ProjectRoot $file
  if (Test-Path $path) {
    Remove-Item $path -Force
    Write-Host "Removed $file"
  }
}
Write-Host "Mobile duplicate CSS cleanup complete."
