# K-LOL.GG Final Operation Checklist

## 1. Apply files
1. Back up the current project folder.
2. Copy this ZIP over the project root.
3. Confirm `.env` is not overwritten.

## 2. Required environment variables
The app now refuses weak/default admin secrets. Set these in local `.env` and Vercel.

- `DATABASE_URL`
- `NEXT_PUBLIC_BASE_URL`
- `JWT_SECRET`
- `ADMIN_TOKEN_VALUE`
- `SUPER_ADMIN_ID`
- `SUPER_ADMIN_PASSWORD`
- `KAKAO_OPENCHAT_SECRET`
- `KAKAO_SEARCH_PLAYER_SECRET`
- `KAKAO_RECRUIT_SECRET`

Optional but feature-dependent:

- `DIRECT_URL`
- `RIOT_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL`

## 3. Local verification

```powershell
npx prisma migrate deploy
npx prisma generate
npm run check:deploy-readiness
npm run check:secrets
npm run check:admin-guards
npx tsc --noEmit
npm run lint
npm run build
```

## 4. Deploy verification

```powershell
npm run check:deploy-api
```

## 5. Kakao manual test

1. `/10인파티`
2. Add lines `11.`, `12.`, `13.`, `14.` manually.
3. Run `구인현황`.
4. Confirm `현재 인원: 10/10` and lines 11+ are shown.

## 6. Security rule
Never share or commit:

- `.env*` except `.env.example`
- real Kakao secrets
- real database URLs
- real OpenAI/Riot keys
- ZIP backups
