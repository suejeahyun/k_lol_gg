# K-LOL.GG 운영 안정화 ZIP 적용 스크립트
# 실행 위치: 기존 프로젝트 루트
# 예: E:\k-LOL.GG\K_LOL_GG_ver2\k_lol_gg

$ErrorActionPreference = "Stop"

$ProjectRoot = Get-Location
$PatchZip = Join-Path $ProjectRoot "k_lol_gg_stabilized_patch.zip"
$PatchDir = Join-Path $ProjectRoot "_patch_k_lol_gg_stabilized"
$BackupDir = Join-Path $ProjectRoot ("_backup_before_patch_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

if (!(Test-Path $PatchZip)) {
  throw "패치 ZIP을 프로젝트 루트에 k_lol_gg_stabilized_patch.zip 이름으로 넣어주세요."
}

Write-Host "[1/9] 기존 주요 파일 백업 생성: $BackupDir"
New-Item -ItemType Directory -Path $BackupDir | Out-Null

$backupTargets = @(
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "prisma",
  "src",
  "tools"
)

foreach ($target in $backupTargets) {
  $src = Join-Path $ProjectRoot $target
  if (Test-Path $src) {
    Copy-Item $src -Destination $BackupDir -Recurse -Force
  }
}

Write-Host "[2/9] 기존 패치 임시 폴더 제거"
if (Test-Path $PatchDir) {
  Remove-Item $PatchDir -Recurse -Force
}
New-Item -ItemType Directory -Path $PatchDir | Out-Null

Write-Host "[3/9] 패치 ZIP 압축 해제"
Expand-Archive -Path $PatchZip -DestinationPath $PatchDir -Force

Write-Host "[4/9] 패치 파일 덮어쓰기"
Copy-Item (Join-Path $PatchDir "*") -Destination $ProjectRoot -Recurse -Force

Write-Host "[5/9] 기존에 삭제해도 되는 산출물/캐시 제거"
$deleteTargets = @(
  ".next",
  "node_modules/.cache",
  "tsconfig.tsbuildinfo"
)

foreach ($target in $deleteTargets) {
  $path = Join-Path $ProjectRoot $target
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "삭제 완료: $target"
  }
}

Write-Host "[6/9] 의존성 설치"
npm install

Write-Host "[7/9] Prisma 검증 및 DB migration 적용"
npx prisma validate
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy

Write-Host "[8/9] 코드 검증"
npm run lint
npm run typecheck
npm run check:admin-guards
npm run build

Write-Host "[9/9] Git 반영"
git status
git add .
git commit -m "stabilize recruit admin kakao ranking operations"
git push origin main

Write-Host "완료: Vercel 배포 로그에서 build 성공 여부와 /admin/recruits, /kakao, /recruit 페이지를 확인하세요."
