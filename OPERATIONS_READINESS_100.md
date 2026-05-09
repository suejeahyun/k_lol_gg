# K-LOL.GG 운영 전 최종 점검 / 100점 목표 반영 내역

## 반영 범위

이번 zip은 기존 검토에서 나온 권장안을 기준으로 운영 전 위험도를 낮추는 방향으로 수정했다.

### 1. 권한 / 인증
- 일반 로그인에서도 승인된 ADMIN/SUPER_ADMIN 계정이면 관리자 쿠키를 함께 발급한다.
- 로그아웃 시 user_token/admin_token을 모두 제거한다.
- /admin 페이지 접근은 user_token의 관리자 role/status 또는 legacy admin_token 둘 중 하나로 허용한다.
- 승인되지 않은 유저는 참가하기/팀 밸런스 메뉴가 노출되지 않는다.
- 팀 밸런스 draft 조회/상세/최신 API는 승인 유저 또는 관리자만 접근 가능하다.

### 2. 외부 API 안정성
- Kakao openchat API에 선택형 `KAKAO_OPENCHAT_SECRET` 인증을 추가했다.
- Kakao openchat API에 rate limit을 추가했다.
- Riot 최근 갱신/전체 갱신 API에 rate limit을 추가했다.
- Riot 전체 갱신은 최대 200게임까지만 처리해 Vercel/Neon timeout 위험을 줄였다.

### 3. 팀 밸런스 안정성
- 시즌 팀 밸런스 계산 API에 rate limit을 추가했다.
- 이벤트 팀 밸런스 API는 관리자 전용으로 제한했다.
- 팀 밸런스 계산 요청 크기 제한을 추가했다.
- 팀 밸런스 저장 API에 rate limit을 추가했다.

### 4. 참가 신청 안정성
- 시즌/이벤트/멸망전 참가 신청 API에 rate limit을 추가했다.
- 시즌 참가 취소 API에도 rate limit을 추가했다.

### 5. DB / Prisma 운영 안전성
- EventMatch 중복 relation 필드 문제를 제거했다.
- AdminLog에 actor/target/before/after/ip/userAgent 확장 컬럼을 추가했다.
- MatchGame, EventTournamentMatch, DestructionMatch 등의 중복 생성 방지 unique/index를 추가했다.
- Event/Destruction 주요 조회용 index를 추가했다.
- 새로운 migration: `20260509120000_operational_full_hardening` 추가.

### 6. UI / 이미지
- 하이라이트 페이지와 관리자 하이라이트 목록의 `<img>`를 `next/image`로 변경했다.
- YouTube 썸네일 도메인 `img.youtube.com`, `i.ytimg.com`을 next.config.ts에 추가했다.

## 배포 전 필수 확인 순서

```bash
npm install
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run lint
npm run build
```

## 운영 환경변수

```env
DATABASE_URL=
NEXT_PUBLIC_BASE_URL=
SUPER_ADMIN_ID=
SUPER_ADMIN_PASSWORD=
ADMIN_TOKEN_VALUE=
JWT_SECRET=
RIOT_API_KEY=
KAKAO_OPENCHAT_SECRET=
```

## Kakao 요청 헤더

`KAKAO_OPENCHAT_SECRET`을 설정한 경우 카카오 봇 요청에는 아래 둘 중 하나를 포함해야 한다.

```http
x-kakao-openchat-secret: 설정값
```

또는

```http
Authorization: Bearer 설정값
```

## 운영 전 DB 확인 SQL

### 활성 시즌 중복 확인

```sql
SELECT id, name, "isActive", "createdAt"
FROM "Season"
WHERE "isActive" = true
ORDER BY id DESC;
```

활성 시즌이 2개 이상이면 migrate 전 하나만 남겨야 한다.

```sql
UPDATE "Season"
SET "isActive" = false
WHERE id <> <ACTIVE_SEASON_ID>;
```

### 중복 대진 확인

```sql
SELECT "seriesId", "gameNumber", COUNT(*)
FROM "MatchGame"
GROUP BY "seriesId", "gameNumber"
HAVING COUNT(*) > 1;

SELECT "eventId", stage, round, COUNT(*)
FROM "EventTournamentMatch"
GROUP BY "eventId", stage, round
HAVING COUNT(*) > 1;

SELECT "tournamentId", stage, round, COUNT(*)
FROM "DestructionMatch"
GROUP BY "tournamentId", stage, round
HAVING COUNT(*) > 1;
```

중복이 있으면 unique index migration이 실패할 수 있으므로 먼저 정리해야 한다.

## 검토 결과

- `npm run lint`: 통과.
- `npm run build`: 현재 실행 환경에서 Prisma engine 다운로드가 막혀 검증 불가. Vercel 또는 로컬 인터넷 연결 환경에서 확인 필요.
- `npx prisma validate`: 현재 실행 환경에서 Prisma engine 다운로드가 막혀 검증 불가. Vercel 또는 로컬 인터넷 연결 환경에서 확인 필요.
