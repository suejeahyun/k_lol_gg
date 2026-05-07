# K-LOL.GG final apply/check script
# Run this from project root after copying src, prisma, and eslint.config.mjs.

Write-Host "[1/5] Stop Node processes..."
taskkill /F /IM node.exe 2>$null

Write-Host "[2/5] Clean Next/Turbo caches..."
Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath ".turbo" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "node_modules\.cache" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[3/5] Generate Prisma Client..."
npx prisma generate

Write-Host "[4/5] Run ESLint..."
npm run lint

Write-Host "[5/5] Build..."
npm run build

Write-Host "Done. If you want to run locally, execute: npm run dev"
