# K-LOL.GG 전체 개선 패치 노트

## 적용 범위

1. 관리자 API 인증 보강
   - `src/app/api/admin/season-participation-applies/route.ts`
   - GET 요청에도 관리자 인증을 적용했습니다.

2. KST 날짜 기준 통일
   - 관리자 참가 신청 조회와 카카오 예약 공지에서 `getTodayKstRange()`를 사용하도록 통일했습니다.

3. 카카오 참가 등록 DB 저장 연결
   - `src/app/api/kakao/recruit/season-apply/route.ts`
   - 모집글 파싱 후 기존 플레이어와 매칭되는 경우 `SeasonParticipationApply`에 upsert합니다.
   - 동명이인 또는 미매칭 플레이어는 보류로 반환합니다.

4. AI MMR 재계산 안정화
   - `src/lib/balance/internal-mmr.ts`
   - `rebuildInternalMmr()`를 추가했습니다.
   - 내전 수정/삭제 후 전체 AI MMR, AI 리뷰, 플레이어 MMR 프로필을 재계산합니다.

5. 비밀번호 변경 페이지 추가
   - `src/app/(user)/account/password/page.tsx`
   - 기존 사이드바 링크 `/account/password`의 404 문제를 해결했습니다.

6. Secret 보안 강화
   - `src/lib/security/secrets.ts`
   - 운영 환경에서 `KAKAO_OPENCHAT_SECRET`, `KAKAO_RECRUIT_SECRET`이 누락되면 기본값 없이 실패하도록 변경했습니다.

7. 회원가입 검증 강화
   - `src/app/api/auth/signup/route.ts`
   - 아이디 4~32자, 비밀번호 8~32자 검증을 추가했습니다.

8. RateLimitLog 정리
   - `src/lib/rate-limit.ts`
   - 요청 처리 중 낮은 확률로 오래된 로그를 자동 정리합니다.
   - `src/app/api/admin/maintenance/rate-limit-cleanup/route.ts` 수동 정리 API를 추가했습니다.

9. OpenChat 테스트 도구 정리
   - `tools/openchat-api-test-client.js`
   - 깨진 한글 주석/문자열을 정상화하고 Secret 헤더를 지원하게 했습니다.

10. 관리자 API 검사 도구 강화
    - `tools/verify-admin-api-guards.mjs`
    - GET 포함 전체 `/api/admin` route의 인증 가드 여부를 점검합니다.

11. 환경변수 예시 추가
    - `.env.example`

## 검증 메모

- `node --check tools/openchat-api-test-client.js`: 통과
- `node --check tools/verify-admin-api-guards.mjs`: 통과
- `node tools/verify-admin-api-guards.mjs`: 통과
- `npm run typecheck`: 현재 컨테이너에는 원본 프로젝트 의존성 설치가 완전하지 않아 Next/Prisma/React 타입 모듈을 찾지 못해 검증 불가

로컬 프로젝트에서는 `npm install` 또는 기존 `node_modules`가 있는 상태에서 아래 순서로 검증하세요.

```powershell
npm install
npx prisma generate
npm run lint
npm run typecheck
npm run build
```
