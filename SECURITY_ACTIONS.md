# K-LOL.GG 운영 전 필수 조치

## 1. 즉시 교체해야 하는 값

이미 `.env` 원본이 전달된 상태이므로 아래 값은 노출된 값으로 간주하고 전부 교체해야 합니다.

- DATABASE_URL: Neon에서 DB role password 재발급 또는 새 role 생성
- RIOT_API_KEY: Riot Developer Portal에서 기존 키 폐기 후 새 키 발급
- JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- ADMIN_PASSWORD: 새 관리자 비밀번호로 교체
- ADMIN_TOKEN_VALUE: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 2. Vercel Environment Variables에 다시 등록할 값

- DATABASE_URL
- NEXT_PUBLIC_BASE_URL
- ADMIN_ID
- ADMIN_PASSWORD
- ADMIN_TOKEN_VALUE
- JWT_SECRET
- RIOT_API_KEY

`RIOT_API_KEY = 값`처럼 공백을 넣지 말고, Key는 `RIOT_API_KEY`, Value는 실제 키로 분리해서 입력합니다.

## 3. 배포 전 DB 확인 SQL

### 활성 시즌 1개 확인

```sql
SELECT id, name, "isActive"
FROM "Season"
WHERE "isActive" = true;
```

2개 이상이면 하나만 남기고 비활성화합니다.

```sql
UPDATE "Season"
SET "isActive" = false
WHERE id <> 유지할_시즌_ID;
```

### AdminLog 컬럼 확인

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'AdminLog'
ORDER BY ordinal_position;
```

정상 컬럼은 `id`, `action`, `message`, `createdAt`입니다.

## 4. 적용 순서

```bash
npm install
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run lint
npm run build
```

## 5. 이 ZIP에 포함된 코드 변경

- 관리자 토큰 하드코딩 제거
- ADMIN_TOKEN_VALUE 환경변수화
- JWT_SECRET 누락 시 명확한 오류 처리
- 관리자 검증 시 DB의 최신 role/status 확인
- 유저 검증 시 DB의 최신 status/player 연결 확인
- /api/logs 관리자 전용 보호
- Riot 최근 갱신: 본인 또는 관리자만 허용
- Riot 전체 갱신: 관리자만 허용
- 팀 밸런스 저장: 승인 유저만 허용
- 시즌 참가 신청 JWT 직접 decode 제거, verifyAuthToken 사용
- 운영 인덱스 및 활성 시즌 단일 제약 migration 추가

## 6. 주의

- 이 ZIP에는 실제 `.env`를 포함하지 않았습니다.
- `package-lock.json`은 로컬에서 `npm install` 후 생성해야 합니다.
- 운영 DB에 활성 시즌이 2개 이상 있으면 새 partial unique index migration이 실패합니다.
