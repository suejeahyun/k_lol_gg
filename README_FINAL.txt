K-LOL.GG FINAL ZIP

Included:
- src/
- prisma/
- eslint.config.mjs
- FINAL_APPLY_AND_CHECK.ps1

Applied fixes:
1. Admin event match / destruction tournament team composition supports drag-and-drop.
2. Participant card dropped on another card swaps the two participants.
3. Empty team area drop still moves the participant.
4. Destruction tournament captain is fixed and cannot be dragged/swapped.
5. Rankings API has export const dynamic = "force-dynamic" to prevent static rendering warnings.
6. Previous performance optimization set remains included: stats table based ranking/top stats, public page revalidate, API timing logs.

Apply:
1. Stop dev server first: Ctrl + C
2. Delete old src and prisma:
   Remove-Item -LiteralPath "src" -Recurse -Force
   Remove-Item -LiteralPath "prisma" -Recurse -Force
   Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
3. Copy src, prisma, eslint.config.mjs from this ZIP into project root.
4. Run:
   .\FINAL_APPLY_AND_CHECK.ps1

If dev server shows Internal Server Error after replacing files:
- Stop all node processes.
- Delete .next and .turbo.
- Run npx prisma generate.
- Run npm run dev.
