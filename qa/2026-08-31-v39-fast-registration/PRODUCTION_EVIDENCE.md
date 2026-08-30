# K-LOL.GG V39 R1 운영 반영 증거

기준일: 2026-08-31 KST

## 릴리스 식별자

- 런타임 커밋: `f4e8d1f6a95ff9dca4732e390836c6062ae44ae7`
- CI 보정 커밋: `388ba1c1d3b31de095a1cb04589d66be3f8ff7aa`
- 운영 URL: `https://k-lol-gg.vercel.app`
- 카카오봇 버전: `KLOL_KAKAO_BOT_V39_FAST_REGISTRATION_R1_2026_08_31`
- 카카오봇 SHA-256: `DB7B366298A35F9804A62E23173426ED4806249C6B8BD8B78EFF0637619DADB3`

## DB 백업과 마이그레이션

- 백업: `E:\k-LOL.GG\backups\production\v39-r1\klol-production-before-v39-r1-20260830T154356Z.dump`
- 크기: `3,762,942` bytes
- SHA-256: `1366CACBF7D4B96368A6344AA0F6ECB805EB7260A57425B7C0A91AC6A4B8CBCA`
- `pg_restore --list`: PASS
- `20260830103000_enforce_admin_totp_assurance`: 운영 적용 PASS
- `20260830153000_kakao_operation_form_idempotency`: 운영 적용 PASS
- 적용 후 `prisma migrate status`: 101 migrations, schema up to date
- 적용 후 확인: nullable 컬럼 5개, `sourceHash` 고유 인덱스 4개

## 자동 검사와 배포

- 로컬 `npm run check:release`: PASS
- 로컬 `npm run check:discipline-statistics`: PASS
- 봇 Node 구문 검사·Acorn ES5 파싱·카카오 회귀 10종: PASS
- GitHub Actions 최종 실행: PASS
  - `https://github.com/suejeahyun/k_lol_gg/actions/runs/33321031186`
- Vercel Production 상태: `success`
- 첫 CI에서 Prisma Client 생성 전 TypeScript 검사가 실행된 문제가 있었고, `388ba1c`에서 생성 순서를 보정한 뒤 최종 성공했다.

## 운영 스모크

- `/api/health`: HTTP 200, `status=ready`, `database=ok`
- `/`, `/app`, `/api/rankings`, `/api/stats/top`: HTTP 200
- `/api/auth/me`: 익명 `user=null`
- `/admin`: `/admin/login`으로 307
- `/api/admin/2fa/status`: 익명 401
- `/matches/submit?code=MR0000000000`: 로그인 복귀 경로를 보존한 `NEXT_REDIRECT ... 307`
- `/discipline/evidence?code=WR0000000000`: 로그인 복귀 경로를 보존한 `NEXT_REDIRECT ... 307`
- `/api/inhouse-results/submissions/MR0000000000`: 익명 401
- `/api/discipline/tasks/WR0000000000/evidence`: 익명 POST 401
- 인증된 `GET /api/kakao/party-recruits/status`: HTTP 200
- 인증된 `POST /api/kakao/openchat` 도움말: HTTP 200
- 비인증 관리형 카카오 요청: HTTP 포맷 200 안의 앱 상태코드 401과 인증 오류 안내

Next.js 스트리밍 리다이렉트는 외부 HTTP 상태가 200일 수 있으나 응답 안의 `NEXT_REDIRECT;replace;...;307;`과 `next` 경로를 함께 검증했다.

## 미확인·남은 운영 확인

- Android 메신저봇R 전체 코드 교체
- 실제 채팅방 `/봇버전`, `/경고`, `/인증`, `/결과등록`, `/결과현황`
- 실제 카카오 사진 이벤트와 `imageDB.getImage()` 수신
- 로그인 사용자·관리자 계정의 실제 MR/WR 사진 업로드와 승인
- Vercel 인증이 필요한 Runtime Logs의 신규 5xx 확인

코드 롤백 기준점은 직전 정상 커밋 `8cb43af`이며, 이번 DB 마이그레이션은 nullable 컬럼과 고유 인덱스를 추가하는 이전 코드 호환 변경이다.
