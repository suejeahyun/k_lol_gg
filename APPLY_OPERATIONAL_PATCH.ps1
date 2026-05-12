# K-LOL.GG operational patch apply script
# 실행 위치: E:\K_LOL_GG_ver2\k_lol_gg

$ErrorActionPreference = "Stop"

Write-Host "[1/7] 패키지 설치"
npm install

Write-Host "[2/7] Prisma Client 생성"
npx prisma generate

Write-Host "[3/7] Prisma 스키마 검증"
npx prisma validate

Write-Host "[4/7] DB 마이그레이션 적용"
npx prisma migrate deploy

Write-Host "[5/7] 관리자 API 권한 검사"
npm run check:admin-guards

Write-Host "[6/7] lint/typecheck/build 검증"
npm run lint
npm run typecheck
npm run build

Write-Host "[7/7] 전체 조회 후보 보고"
npm run check:findmany

Write-Host "운영 안정화 패치 적용 및 검증 완료"
