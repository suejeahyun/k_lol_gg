Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath ".turbo" -Recurse -Force -ErrorAction SilentlyContinue

npx prisma generate
npx prisma migrate deploy
npm run lint
npm run build
