# K-LOL.GG 패치 롤백 보조 스크립트
# 사용법: $BackupDir 값을 실제 백업 폴더명으로 바꾼 뒤 실행

$ErrorActionPreference = "Stop"
$ProjectRoot = Get-Location
$BackupDir = Join-Path $ProjectRoot "_backup_before_patch_YYYYMMDD_HHMMSS"

if (!(Test-Path $BackupDir)) {
  throw "백업 폴더를 찾을 수 없습니다. BackupDir 값을 실제 폴더명으로 바꿔주세요."
}

Copy-Item (Join-Path $BackupDir "*") -Destination $ProjectRoot -Recurse -Force
npm install
npx prisma generate
npm run build

git status
Write-Host "파일 롤백 완료. DB migration은 자동 롤백하지 않습니다. 운영 DB 롤백은 별도 SQL 백업 기준으로 진행하세요."
