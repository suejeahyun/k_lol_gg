# 계정·권한·데이터·외부 경계 점검

기준: 2026-10-05, source base `bd6433d2`, migration `0047_usage_analytics`. 운영 DB를 변경하지 않았으며 PostgreSQL 18 일회성 cluster와 합성 계정만 사용했다. 이전 문서의 완료 표기를 재사용하지 않고 아래 검사들을 이번 작업에서 실행했다.

## 확인된 문제

| 중요도 | 재현·원인 | 수정·검증 |
| --- | --- | --- |
| P2 | `/api/stats/top`의 참여·MVP 동률 정렬이 홈과 `/rankings`의 정렬과 다르다. API가 승률 순위 `rank`를 동률 기준으로 재사용했다. 참여 15회인 두 사람의 MVP가 2/6이면 화면은 6 MVP를 먼저 표시하지만 API는 높은 승률을 먼저 반환했다. | API에서 기존 `buildPublicRankingView`를 사용한다. 필드·최소 참여·0 MVP 제외 계약은 유지한다. 수정 전 실제 HTTP 실패는 `stats-top-before.log`; 수정 후 새 production build의 실제 HTTP PASS는 `stats-top-after.log`. |
| P2 | 임시 비밀번호를 변경해야 하는 유효 세션이 보호 화면으로 이동하면 서버가 원래 목적지 없이 비밀번호 변경 화면으로 보낸다. 변경 중 세션이 만료되어 다시 로그인하는 경로도 중첩 `next`를 버린다. 로그인 폼과 변경 폼에는 이미 안전한 복귀 처리가 있어 서버 진입부의 연결 누락이다. | 서버 보호 가드와 비밀번호 페이지가 기존 `normalizeAccountNext`로 원래 목적지를 보존하도록 수정. 수정 전 목적지 누락 재현은 `account-return-before.log`; 수정 후 격리 계정 DB/HTTP PASS는 `account-return-after.log`. |

## 실제 실행한 기능별 검증

명령: `npm run test:db` (전체 scope), exit 0. 전체 실행 로그는 `database.log`. 각 기능의 DB 계약은 정상 쓰기만이 아니라 아래 실패·중복·경합·복구 사례를 포함한다. 모든 UI 버튼/실기기를 이 로그 하나로 검증했다는 뜻은 아니다.

추가 회귀: `V2_DB_CONTRACT_SCOPE=accounts npm run test:db` exit 0. 임시 비밀번호 세션으로 `/tools/team-balance/drafts`, `/account/riot`, `/account/discipline`에 접근할 때 원래 목적지를 포함한 비밀번호 변경 URL을 확인했고, 비밀번호 페이지에서 세션이 없을 때 중첩 목적지를 보존한 로그인 URL도 확인했다. Next.js streaming의 200+meta redirect와 일반 307+Location을 구분하여 검사한다. 초기 검사 구현 중 변수명/streaming 응답 기대 오류는 제품 결함 근거로 사용하지 않았으며, 이를 수정한 뒤 실제 누락 목적지의 실패와 수정 후 통과를 기록했다.

변경 파일 focused ESLint, 인증/세션 단위 16건, 랭킹/통계 단위 9건, 전체 TypeScript typecheck도 통과했다.

`V2_UX_QA_STATS_TOP=true npx tsx scripts/test-db/run-ux-http-qa.ts`를 통합 build에 실행해 exit 0을 확인했다. 세 승률 순서, 참여 동률의 MVP 우선, MVP 동률의 참여 우선, 최소 참여 999의 빈 결과, 비정상 최소 참여 400, no-store 응답을 실제 격리 DB/HTTP로 검증했다. 기존 UX harness의 문의 입력·동의·용량·origin·idempotency·감사 비공개, 관리자/cron 인증, sitemap, 이벤트 로그인 안내, 회원가입 검사도 함께 통과했다. 종료 시 app과 일회성 cluster를 정리했다.

별도 재검토에서 Chromium의 로그인/계정 화면에 공통 효과 코드가 hydration 전에 `data-ui-*` 속성을 추가하는 경고를 발견해 통합 담당자에게 전달했다. 통합 수정 후 기존 실제 프로필 저장/412 복구 브라우저 검사에 콘솔 회귀를 추가했으며 경고가 사라졌고 키보드 저장·새로고침·충돌 복구와 비밀번호 복귀가 함께 통과했다 (`account-return-hydration-after.log`).

| 기능·경계 | 실제 검증 범위 | 결과 |
| --- | --- | --- |
| 가입·로그인·계정 상태·로그아웃 | 새 계정/기존 플레이어 claim, 아이디·Riot ID 충돌, 상태/role/authVersion 변경, durable token hash, 목적별 쿠키, 철회·만료, rate limit·복구 응답, 외부 origin, 비정상 query/body | 격리 DB+HTTP PASS |
| 본인 프로필·비밀번호 | 소유자 표시명/Riot ID/티어, 갱신·충돌·412 복구, 이름 변경 시 ID/역사 보존, Riot 연결 변경, 비밀번호 변경 후 세션 무효화, one-time secret | DB+HTTP+Chromium keyboard 저장/갱신 PASS |
| 관리자 계정 운영 | USER/ADMIN/SUPER 상태·role 경계, password-only 관리자, 예전 TOTP 기록, ACCOUNT 세션의 관리자 작업 거부, 승인/제한/역할/복구/초기화, receipt·audit atomicity | DB+HTTP+Chromium PASS |
| 플레이어 등록부 | 공개 active DTO allowlist, private/account 필드 제외, legacy mapping·재활성화, 무결성·중복 이름/식별자 | DB+HTTP PASS |
| 시즌·내전 참가 | 단일 활성 시즌, clone/end/retire, 신청 수정/취소/재신청·운영 검토, 마지막 정원 경합, 예비·마감, 사이트/Kakao 동일 identity 병합, pending 연결, 200행 제한과 전체 집계, 시각·시간대·권한·stale revision | DB+HTTP PASS |
| 경기·결과 제출 | 공개 10인 KDA, 당시 표시명 snapshot, 결과 거절/재검토 이유, owner 유효 팀 draft, 승인 시 팀 출처 전달, 관리자 생성, revoked/expired/stale/wrong-purpose 세션 거부 | DB PASS |
| 승률·참여·MVP 통계 | PUBLISHED만 포함, 회차 참여와 게임 수 분리, 저장된 MVP 사용, 원자 재집계·outbox replay, DTO allowlist | DB PASS. Top API 정렬 결함은 위 수정 대상 |
| MMR·팀 편성 | full-ledger replay, void/restore, 공개 경기 경험, 최신 Riot 신원/신선도, SUPER 보정, owner/admin draft 수명주기, 원장·receipt·audit | DB PASS |
| 이벤트전 | 정확히 10인 수명주기, 신청·취소·소유권, 팀 편성·대진·결과/교정·다운스트림 무효화, receipt/audit | DB PASS |
| 멸망전 | 모집·경매·BO 예선/본선·명단 변경 이력·MVP 재투표·receipt atomicity | DB PASS |
| 모집·Kakao | BOT 서명/nonce/room/sender bound, 명단 경합, SITE 결정 보존, 동일방 복사·미연결/예비 명단·모드 분리, 정원 알림 lease/ACK/retry/expiry, 양식 수명·06시 KST 경계 | DB PASS; 실폰 송수신 제외 |
| 문의·운영 신청 | signed form 저장·관리자 변경·감사/receipt, 알림/이미지 세션 소유 범위 | DB PASS; 웹 문의 HTTP는 별도 UX harness |
| 하이라이트·갤러리·비공개 이미지 | 관리자 publication·staged→ready·attach/tombstone, 목적/소유권·상태·idempotency·soft archive | DB PASS; 실제 Blob 왕복 제외 |
| 징계·증거 제출 | masked ownership, private evidence, 정확한 검토 상태·replay·atomicity | DB PASS |
| Riot·RSO·동기화 | owner/one-time RSO, 링크 변경 차단, 아카이브 dedupe/paging, API probe 서명/재시도, eligible 신원·최근 작업 제외, adapter 실패/재시도 | DB/fake adapter PASS; 실계정 외부 동의 제외 |
| 챔피언·이미지 카탈로그 | live admin session, replay·ledger atomicity, 173개 합성 NULL 이미지 backfill/rollback | DB PASS |
| 운영 설정·AI·정리·예약 작업 | 관리자/서명 job 권한, bounded 유지보수·만료 row만 삭제·재실행, safe probe 결과, 운영 상태 bounded read-only 집계 | DB/fake storage PASS; 실 외부 AI·Blob·경보 수신 제외 |
| 이용 통계 | KST 날짜, idempotency, anonymous→account identity, 관리자 제외·durable limit | DB PASS |
| migration·복구 | empty DB 설치, upgrade·재실행·실패 rollback, custom archive 복구, 48 migration/112 table/3607 schema definition, FK/행수 대조 | PostgreSQL 18 PASS |

## 정책·추가 변경 판단

- 관리자 비밀번호 로그인의 현재 계약은 `docs/architecture/0010-admin-password-login.md`다. 과거 기능 카탈로그/ADR의 TOTP 필수 문구로 현재 password-only 관리자를 오류로 오판하지 않았다. 현재 role/purpose/status/authVersion/expiry/revoke 확인은 유지된다.
- 서버와 DB transaction은 권한을 재확인하고 receipt·도메인 변경·감사를 함께 커밋한다. 승인 대기 계정의 일반 사용자를 승인된 사용자로 취급하거나 운영 DB를 테스트 대상으로 사용할 근거가 없다.
- 모집 정원과 회차 참여/게임/MVP/MMR 도메인 자체는 이번 격리 검증에서 실패가 없었다. 확인된 표시 정렬 결함 외에 집계 공식을 변경할 근거가 없으므로 새 공식을 도입하지 않았다.
- 이벤트 DB 검사에서 pg 8의 동일 client 병렬 query deprecation warning 1건을 관측했다. 현재 고정 dependency에서 검사 실패나 데이터 오류는 없었다. pg 9 업그레이드 시 해당 transaction 내부 병렬 조회를 직렬화하는 호환 작업이 필요하며 이번 릴리스에서 라이브러리를 업그레이드하지 않는다.
- Android/TalkBack 실기기, 휴대폰 절전/재시작, 실카카오 수신, 실제 Riot 동의/Production entitlement, 제공자 경보 수신은 합성 환경으로 완료 처리하지 않았다.
