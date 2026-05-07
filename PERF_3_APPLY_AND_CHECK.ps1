Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "src" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "prisma" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "이 스크립트는 ZIP에서 꺼낸 src, prisma, eslint.config.mjs를 프로젝트 루트에 복사한 뒤 실행하세요."
Write-Host "복사 완료 후 아래 명령을 순서대로 실행합니다."

npx prisma generate
npx prisma migrate deploy
npm run lint
npm run build
