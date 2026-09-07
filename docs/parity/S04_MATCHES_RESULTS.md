# S04 경기·결과 V1 동등성 장부

이 문서는 source와 격리 PostgreSQL 검증 상태를 기록한다. HTTP/시각·통합 증거 전에는 완료 또는 운영 반영으로 표시하지 않는다.

| V1 기능 | V2 canonical | 현재 source 상태 | 남은 검증 |
|---|---|---|---|
| 경기 목록/기간·시즌 | `/matches`, `GET /api/matches` | keyset, TIE, literal 검색 및 normalized `pg_trgm` GIN 경로 검증 | HTTP, 화면 |
| 경기 상세/MVP | `/matches/[uuid]`, `GET /api/matches/[uuid]` | 10인 게임, MVP badge, player link, 당시 nickname/tagLine snapshot과 V1 tie-break 저장 검증 | privacy exact-key, 모바일 |
| 숫자 legacy 상세 | `/matches/[legacyInt]`, `/api/matches/[legacyInt]` | DB mapping 상대 308 구현 | spoofed Host HTTP |
| 관리자 경기 등록 | `/admin/matches/new`, `POST /api/admin/matches` | 구조화 editor 구현 | catalog 대량 DOM/PG |
| 공개 경기 전체 교정 | `/admin/matches/[uuid]`, PATCH | games/participants 전체 교체+revision/outbox, 412 최신 aggregate 비교 구현 | PG old/new contribution race, HTTP 두 번째 시도 |
| DELETE | void/restore | 공개·통계 제외, 감사, 복구 구현 | S05 projection 연동 |
| 사용자 결과 접수 | `/matches/submit`, `/api/me/match-submissions` | organizer/회차/2·3게임/시즌 nullable 구현 | S01 viewer/account matrix |
| code 이어하기/이력 | `/matches/submit?code=`, `/matches/submissions` | owner 404와 cursor 구현 | HTTP 21번째/타인 |
| private 이미지 | owner/admin canonical image route | decode/SHA/rate/upload saga와 OCR retry 선예약 lease 구현 | PG cancel/upload/OCR lease race |
| 관리자 접수 검토 | `/admin/matches?view=submissions`, detail | 이미지/OCR/구조화 10행/행별 확인 구현 | 실제 fixture 화면 QA |
| 관리자 Ctrl/Cmd+V OCR | `/api/admin/matches/import` | private import submission saga 구현 | HTTP timeout/partial/cancel |
| approve/reject/reopen | admin submission routes | revision/audit/receipt, 공개 사유 snapshot, 승인 시 teamBalanceDraftId를 match/audit/outbox에 불변 전달 PG 검증 | exact race |
| 통계 재계산 | typed `match.changed` outbox | S04 emission만 구현 | S05 consumer |

## 금지 field 확인 대상

public/owner 응답에서 `memberName`, `userAccountId`, `balanceOverride`, 내부 review memo, note/provenance,
private asset ID/key/provider/SHA, OCR candidate/reference가 0건이어야 한다. registry `playerId`는 공개 profile 연결용으로 허용한다.

## 현재 증거

- `0005_s04_matches_results`를 S01 `0004` snapshot 기준으로 생성하고 `pg_trgm` availability/CREATE 권한 preflight를 추가
- 격리 PostgreSQL 18에서 빈 DB→`0004` 2회→기존 player seed→`0005`→전체 2회 적용, 6개 migration 이력과 기존 행 보존 검증
- 실제 GIN `EXPLAIN`, normalized/literal 검색, snapshot rename/교정, reject/reopen audit, teamBalance provenance, V1 MVP 저장 결과 검증
- stored summary와 실제 game 집계의 정상/고의 불일치 탐지 검증; 실행 중 발견한 aggregate SQL alias 결함 수정
- lint 0 error/0 warning
- TypeScript typecheck 통과
- contract 18/18, TypeScript unit 135/135, S04 PostgreSQL 4/4 통과
- `next build --webpack` compile/typecheck/static generation/route trace 통과
- `security:secrets` 전체 tracked tree/Git history 통과, `git diff --check`와 source/docs/tests trailing whitespace 검사 통과
- 기본 Turbopack build는 독립 worktree의 외부 `node_modules` junction 제한으로 실패했으며 main worktree 재검증이 필요
