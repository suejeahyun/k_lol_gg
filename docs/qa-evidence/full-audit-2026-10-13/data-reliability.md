# 데이터·도메인·복구 점검 — 2026-10-13

대상은 `worktrees/ux-discoverability-20261002`의 현재 소스다. 운영 코드, 테스트, migration, 배포, 운영 DB를 변경하지 않았다. 이 문서와 `data-reliability*` 증거 파일만 추가했다. 아래 DB 쓰기는 기존 안전 가드가 생성한 일회성 로컬 PostgreSQL 18.3와 합성 데이터에 한정된다.

## 이번 실행 결과

| 실행 | 현재 결과 | 근거 |
|---|---|---|
| Fresh install + 기존 DB contract 목록 전체 | 34파일, 164 tests, 164 pass, 0 fail, 0 skip | `data-reliability-contracts.json`, `data-reliability-contracts.log` |
| `npm run verify:recovery` | 2 tests, 2 pass, 0 fail, 0 skip | `data-reliability-recovery.log` |
| 실제 repository를 통한 경기 수정/MMR 상호작용 재현 | MMR 전 제목 수정 성공, MMR 후 같은 종류 수정 실패; rollback 확인 | `data-reliability-reproductions.json` |
| MMR 대량 INSERT 경계 재현 | 410경기 상당의 SQL을 로컬 PostgreSQL이 `08P01`로 거부 | 같은 JSON |

`npm run test:db` 전체 명령을 통과했다고 주장하지 않는다. 이 명령의 마지막 HTTP 단계에는 `verify-player-admin-http.ts`와 `verify-account-http.ts`가 시작하는 Chromium 회귀 검사가 포함되어 있다. 브라우저는 주 작업자의 CUA 점검 범위이므로 이 부분을 실행하지 않았다. 감사용 `data-reliability-run-contracts.mjs`가 기존 runner의 정확한 33파일 목록·순서와 exported cluster/environment helper를 재사용하고, 별도 빈 cluster에서 fresh-install 1파일을 먼저 실행했다. HTTP/browser continuation은 포함하지 않았다.

실행 명령:

```powershell
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
node --import tsx docs/qa-evidence/full-audit-2026-10-13/data-reliability-run-contracts.mjs
npm run verify:recovery
node --import tsx docs/qa-evidence/full-audit-2026-10-13/data-reliability-reproduce.mjs
```

감사 실행 환경은 `CI=false`, `V2_USE_CI_POSTGRES_SERVICE=false`, browser hold=false로 고정했다. DB runner는 실제 환경의 DB 주소·비밀값을 자식에게 전달하지 않고, 임의 포트의 `127.0.0.1`과 임의 `klol_v2_test_*` DB를 사용했다. 모든 감사 cluster는 종료·제거되었고 `.tmp/postgres-tests`와 `.tmp/postgres-recovery`에 남은 directory가 없음을 확인했다.

## 확인된 문제

### D1. MMR 계산에 포함된 경기를 수정할 수 없음 — P1

경기 수정은 참가자와 기존 game 행을 지운 다음 새 game UUID를 만든다. 반면 MMR 이력은 기존 game UUID를 `ON DELETE RESTRICT` FK로 참조한다. 따라서 MMR 계산이 한 번 끝난 경기에서는 제목만 바꿔도 삭제 단계가 실패한다.

근거:

- `src/modules/matches/infrastructure/postgres-match-repository.ts:1629` — 참가자 삭제.
- `src/modules/matches/infrastructure/postgres-match-repository.ts:1630` — game 삭제.
- `src/modules/matches/infrastructure/postgres-match-repository.ts:1307` — 새 game UUID 생성.
- `src/platform/db/schema/mmr.ts:117` — `gameId` RESTRICT FK.
- `drizzle/0008_s05b_mmr_projection.sql:163` — 실제 migration FK.

이번 재현은 실제 `PostgresMatchRepository.createMatch → publishMatch → updateMatch → PostgresMmrRepository.catchUp → updateMatch`를 실행했다. 첫 제목 수정은 200, MMR generation 1에 10개 결과 event가 저장된 뒤 제목 수정은 실패했다. PostgreSQL 18의 SQLSTATE는 `23001`, constraint는 `match_result_events_game_id_match_games_id_fk`다. 기존 경기 revision·제목·참가자 10명은 rollback으로 보존되었다.

현재 `translateConstraint`는 `23503`만 매핑하므로 이 `23001`은 일반 오류로 남는다(`postgres-match-repository.ts:325`). HTTP 경계에서는 일반 오류가 서비스 이용 불가 응답으로 바뀐다(`match-http.ts:375`, `match-http.ts:397`). HTTP/브라우저에서 동일 mutation을 따로 실행한 것은 아니다.

수정 방향은 경기와 game의 식별자 및 MMR 이력 참조를 함께 설계해 과거 이력을 보존하면서 수정하도록 하는 것이다. 단순 CASCADE 삭제는 append-only MMR 이력을 손상시킬 수 있다. 회귀 검증에는 “경기 공개 → MMR 반영 → 제목/KDA/세트 변경 → 재집계”가 필요하다. 현재 MMR contract는 참가자 table을 직접 UPDATE하여 정정한다(`tests/database/mmr-projection.contract.test.ts:183`); 실제 경기 수정 경로를 지나지 않아 기존 164개 검사 통과와 이 문제가 양립한다.

인증은 기존 match snapshot contract와 같은 no-op authorizer를 넣었다. 이 재현은 데이터 저장 경로의 문제를 증명하며, 인증 경계 검증을 대체하지 않는다.

### D2. 누적 410경기에서 MMR INSERT 매개변수 수 초과 — P1

`src/modules/mmr/infrastructure/postgres-mmr-repository.ts:250`은 전체 과거 경기의 선수별 결과를 한 INSERT에 넣는다. 각 행이 16개 매개변수를 사용한다. 유효 경기당 10명이므로 다음 경계가 생긴다.

| 경기 수 | 결과 행 | SQL 매개변수 | pg wire의 개수 필드 |
|---:|---:|---:|---:|
| 409 | 4,090 | 65,440 | 65,440 |
| 410 | 4,100 | 65,600 | 64로 overflow |

실제 Drizzle 스키마·설치된 `pg-protocol`로 생성했고, 410경기 상당 INSERT는 일회성 PostgreSQL에서 `08P01`로 실패했다. 실패 후 기존 10개 event는 유지되었다. 409행 구성의 wire 값은 검증했으나 409경기 전체 도메인 데이터를 생성해 end-to-end catch-up을 수행한 것은 아니다. 410경기 재현의 값은 합성 반복 행이며, 프로토콜 단계에서 거부되므로 개별 행 제약 검사에 도달하지 않는다.

이는 현재 코드의 경계 문제다. 운영 데이터가 이미 410경기에 이르렀는지는 확인하지 않았다. 동일 transaction 안의 제한된 행 수 INSERT와 최대 규모 회귀 검증이 필요하다. 매번 전체 원장을 읽고 새 generation에 모든 event를 다시 저장하는 비용은 별도의 장기 용량 검토 대상이지만, 보존 정책 없이 이력을 삭제하면 안 된다.

### D3. Riot 예약 동기화 처리량은 연결 수 증가에 따라 6시간 주기를 유지하지 못함 — P2 용량 개선

`vercel.json:23`의 예약 주기는 5분이며 `riot-sync-cron.ts:27`은 `runNextSync`를 한 번 실행한다. 자동 갱신 후보는 6시간 이상 지난 연결이다(`riot-application.ts:579`). 따라서 저장소에 구성된 예약 처리량은 6시간당 최대 72회다. 재시도·수동 요청 backlog가 있으면 자동 후보의 처리량은 더 줄어든다.

추가 서명 endpoint(`src/app/api/internal/jobs/riot-sync/route.ts:23`)도 한 요청에 한 작업을 처리한다. 외부 소비자가 이를 더 호출하면 총량은 늘어날 수 있으므로 72회를 시스템 전체 절대 상한으로 해석하지 않는다. 소스·scripts·GitHub 설정에서는 별도 반복 자동 소비자를 찾지 못했다. 운영에 실제 지연이 생겼는지, 현재 활성 연결이 몇 개인지는 이번 검사에서 확인하지 않았다.

API rate limit을 준수하는 제한 시간 내 여러 작업 처리 또는 예약 주기 조정이 개선 방향이다. 기존 운영 상태에는 이미 `oldestPendingAt`과 30분 지연 경고가 있다(`postgres-operational-health.ts:49`, `operational-health.ts:55`). 새로 제안할 지표는 아직 queue에 생성되지 않은 갱신 예정 연결의 최종 성공 시각·기한 초과 수다.

## 점검 범위와 확인한 보호장치

| 범위 | 이번 근거 |
|---|---|
| 스키마·migration | fresh install, 기존 버전 upgrade, 반복 migration, journal 48개/head `0047_usage_analytics`; 해당 contract 실행 |
| 시즌·신청·카카오 | 시즌/차수·방 scope, 수용 인원, command replay, notice 원자성·lease·ACK·offline recovery contract; site notice repository 읽기 |
| 경기·통계·MMR | 저장 snapshot/권한, 통계 serializable transaction·lease 재취득·지수 backoff, MMR global lock/세대/공식 전환/멱등성 contract; D1/D2 별도 교차 재현 |
| 팀 편성 | 초안 저장·선택·재평가, override와 MMR 구분, live session recheck, rating generation/활성 시즌 fallback contract 및 source |
| 이벤트·파괴전 | 동일 요청 replay·revision 경쟁, serializable retry, 신청 소유권, 자동 평가/연결 변경 확인 contract 및 source |
| Riot | 연결·해제, RSO cache/retry, signed job replay, stale link projection, archive progress·timeline 보존 contract 및 queue/cron source |
| 운영·복구 | 유지보수 원자성/replay, storage probe, operational health, pg_dump/pg_restore contract |

복구 drill은 custom archive를 새 합성 DB에 복원하여 112개 table의 정확한 행 수, 3,607개 schema 정의, FK 검증, account-player-audit fixture 관계, migration replay no-op, 실패한 DDL transaction rollback을 확인했다. 두 번째 전체 contract 실행에서는 앞선 도메인 fixture가 있는 DB의 복원도 통과했다. 이것은 운영 backup/PITR 또는 실제 외부 이미지 저장소 복구를 증명하지 않는다.

일부 contract는 Node test 하나에 여러 assertion과 workflow를 포함한다. 위 164는 실제 Node test reporter의 집계이며 assertion 수나 화면 수가 아니다. 기존 QA 문서의 과거 통과 수를 이번 실행 수에 합산하지 않았다. 실기기 카카오 설치·지정 방 확인은 사용자가 이미 완료했다고 확인한 사항이며 다시 요구하지 않는다.

이번 범위에서는 운영 부하 실험, 외부 Riot 호출, 실제 사용자 mutation, 운영 DB 조회/수정, backup 제공자 PITR 복원, 실제 blob 삭제를 수행하지 않았다. 공개/관리자 browser, 전체 lint/type/unit/build, 보안·assets 보존 검토는 주 작업자와 다른 점검 담당의 별도 증거를 따른다.
