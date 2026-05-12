# 실행 위치: E:\K_LOL_GG_ver2\k_lol_gg
# docs/delete-unused-css-candidates.txt 기준으로 미사용 CSS 후보 삭제

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath ".\tools\delete-unused-css.ps1")) {
  throw "tools\delete-unused-css.ps1 파일이 없습니다. ZIP을 먼저 덮어써 주세요."
}

powershell -ExecutionPolicy Bypass -File ".\tools\delete-unused-css.ps1"
