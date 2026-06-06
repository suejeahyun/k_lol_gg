param(
  [string]$ProjectRoot = "E:\k-LOL.GG\k_lol_gg"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectRoot)) {
  throw "ProjectRoot not found: $ProjectRoot"
}

$targets = @(
  "src\app\(user)\community\notice-comments",
  "src\app\(user)\community\notice-comments\page.tsx"
)

foreach ($rel in $targets) {
  $path = Join-Path $ProjectRoot $rel
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Host "[DELETE] $rel" -ForegroundColor Yellow
  } else {
    Write-Host "[SKIP] $rel" -ForegroundColor DarkGray
  }
}

# 공지 댓글 라우트가 비어 있는 경우 상위 폴더 정리
$communityRoot = Join-Path $ProjectRoot "src\app\(user)\community"
if (Test-Path $communityRoot) {
  Get-ChildItem -LiteralPath $communityRoot -Directory -Recurse |
    Sort-Object FullName -Descending |
    ForEach-Object {
      if (-not (Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $_.FullName -Force
        Write-Host "[EMPTY DIR DELETE] $($_.FullName)" -ForegroundColor DarkYellow
      }
    }
}

Write-Host "Done." -ForegroundColor Green
