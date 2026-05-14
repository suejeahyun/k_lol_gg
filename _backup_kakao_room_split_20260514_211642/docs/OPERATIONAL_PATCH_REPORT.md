# K-LOL.GG 운영 안정화 패치 보고서

## 적용 범위

이번 ZIP에는 기존 파일 위에 바로 덮어쓰기 가능한 운영 안정화 패치를 포함했다.

## 반영 내용

### 1. 검증 스크립트 추가

`package.json`에 다음 스크립트를 추가했다.

```bash
npm run typecheck
npm run prisma:validate
npm run migrate:status
npm run check:admin-guards
npm run check:findmany
npm run css:unused
npm run css:delete-unused
npm run check
```

### 2. 관리자 API 권한 검사 자동화

추가 파일:

```txt
tools/verify-admin-api-guards.mjs
```

`src/app/api/admin/**/route.ts`의 `POST`, `PUT`, `PATCH`, `DELETE` 함수에 관리자 권한 검사 함수가 없으면 실패한다.

인정하는 guard 함수:

```ts
rejectIfNotAdmin()
rejectIfNotSuperAdmin()
requireAdminRequest()
requireSuperAdminRequest()
```

### 3. 미사용 CSS 삭제

삭제 후보 파일은 아래에 기록했다.

```txt
docs/delete-unused-css-candidates.txt
```

이번 ZIP에서는 import 참조가 없는 CSS 58개를 실제 삭제했다.

삭제 재실행용 스크립트:

```txt
tools/delete-unused-css.ps1
tools/delete-unused-css.mjs
```

### 4. DB 인덱스 보강

추가 migration:

```txt
prisma/migrations/20260513010000_operational_cleanup_indexes/migration.sql
```

추가 인덱스:

```sql
Player(isActive, createdAt)
Player(name)
Player(nickname)
Player(tag)
GalleryImage(showOnHome, createdAt)
```

또한 홈 노출 갤러리 이미지를 DB 차원에서 하나만 허용하도록 partial unique index를 추가했다.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "GalleryImage_only_one_home_true_idx"
ON "GalleryImage"("showOnHome")
WHERE "showOnHome" = true;
```

### 5. pagination/cache 공통 유틸 추가

추가 파일:

```txt
src/lib/http/pagination.ts
src/lib/http/cache.ts
```

공지사항 API에 우선 적용했다.

```txt
src/app/api/notices/route.ts
```

### 6. findMany 점검 스크립트 추가

추가 파일:

```txt
tools/check-unbounded-prisma-findmany.mjs
```

`take`/`skip` 없이 전체 조회하는 `findMany` 후보를 보고한다. 이 스크립트는 보고용이며 실패 처리하지 않는다.

## 적용 후 권장 실행 순서

```powershell
npm install
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run typecheck
npm run check:admin-guards
npm run check:findmany
npm run build
```

전체 검증은 아래 하나로 실행 가능하다.

```powershell
npm run check
```

## 주의사항

- `npx prisma migrate deploy`는 production DB에 직접 반영된다.
- 적용 전 Neon/Vercel 환경변수의 `DATABASE_URL`이 맞는지 확인해야 한다.
- `GalleryImage_only_one_home_true_idx` 생성 전 이미 `showOnHome = true`가 2개 이상이면 migration이 실패한다. 그 경우 먼저 하나만 남겨야 한다.

예시:

```sql
UPDATE "GalleryImage"
SET "showOnHome" = false
WHERE id NOT IN (
  SELECT id
  FROM "GalleryImage"
  WHERE "showOnHome" = true
  ORDER BY "updatedAt" DESC
  LIMIT 1
);
```
