# K-LOL.GG unused CSS cleanup
# 실행 위치: 프로젝트 루트(E:\K_LOL_GG_ver2\k_lol_gg)
# 목적: docs/delete-unused-css-candidates.txt에 적힌 미사용 CSS 후보 삭제 + 빈 폴더 정리

$ErrorActionPreference = "Stop"

$Root = Get-Location
$CandidateFile = Join-Path $Root "docs\delete-unused-css-candidates.txt"

if (-not (Test-Path -LiteralPath $CandidateFile)) {
  throw "삭제 후보 파일이 없습니다: $CandidateFile"
}

$Candidates = Get-Content -LiteralPath $CandidateFile |
  Where-Object { $_ -and -not $_.Trim().StartsWith("#") } |
  ForEach-Object { $_.Trim() }

foreach ($RelativePath in $Candidates) {
  $WindowsPath = $RelativePath -replace '/', '\\'
  $FullPath = Join-Path $Root $WindowsPath

  if (Test-Path -LiteralPath $FullPath) {
    Remove-Item -LiteralPath $FullPath -Force
    Write-Host "[deleted] $RelativePath"
  } else {
    Write-Host "[skip] $RelativePath"
  }
}

Get-ChildItem -Path "src\styles" -Directory -Recurse |
  Sort-Object FullName -Descending |
  Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force) } |
  Remove-Item -Force

Write-Host "CSS 삭제 후보 정리 완료"
