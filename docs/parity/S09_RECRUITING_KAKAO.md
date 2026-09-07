# S09 구인·스크림·Kakao 동등성 기록

- 기준 커밋: `1057847`
- 상태: 소스·타입·변경 범위 lint·단위/보안/HTTP 계약·격리 PostgreSQL 18 집중 검증 통과
- 운영 Kakao 호출·운영 secret·전체 브라우저 회귀·Vercel 반영: 수행하지 않음

## 구현 근거

- `0009_s09_recruiting.sql`: 구인·스크림 aggregate, command receipt, Kakao nonce binding, outbox
- 공개: `GET/POST /api/recruits`, `/recruits`, `/help/kakao`, `/help/recruits`
- 관리자: `GET /api/admin/recruits`, `PATCH /api/admin/recruits/[recruitId]`, `/admin/kakao`, `/admin/kakao/recruits`
- 연동 경계: `POST /api/integrations/kakao/recruits`; raw body HMAC, timestamp, nonce, room, sender, bot-self 차단
- mutation 경계: 승인 계정 또는 ADMIN/SUPER의 transaction session 재확인, `If-Match`, `Idempotency-Key`, audit/outbox

## 집중 검증 결과

- TypeScript: 통과
- 변경 범위 ESLint: 경고·오류 0
- 구인 application/security/HTTP 및 징계 선행 코어: 27/27 통과(통합 뒤 재실행)
- 격리 PostgreSQL 18: 구인 계약 2/2 통과(구현 worktree 증거)
- `git diff --check`: 통과

## 남은 검증

- 실제 Kakao secret/room/sender allowlist 설정은 운영 자격 증명 없이 미확인
- S03 시즌 신청 bridge, S12 운영 신청 4종 bridge, S10 private asset port의 실제 adapter 연결
- S14 전체 HTTP·브라우저·접근성·반응형·성능·복구 회귀
