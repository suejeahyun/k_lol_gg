# Riot 플레이어 상세 · 1.0.0 검증

기록일: 2026-09-25 KST. 대상 작업 사본은 `worktrees/kakao-v4-gateway`, 소스 migration head는 `0045_simple_reptil`이다. 최종 Git SHA/tag/배포 ID는 아직 연결하지 않았다. 이 문서는 소스 구현·개별 검사·운영 적용을 구분한다.

관련 문서: [기능 대응표](../../parity/RIOT_PLAYER_DETAIL_PARITY.md), [구조 결정 초안](../../architecture/0013-riot-player-detail-projections.md), [한국어 패치 노트 초안](../../patch-notes/2026-09-25-riot-player-detail.md).

## 확인된 결과

| 항목 | 확인 결과 | 근거와 한계 |
|---|---|---|
| Riot data focused 검사 | 당시 55 PASS | 아래 8개 파일 명령. 이후 gap 회귀 검사가 추가됐으므로 최신 전체 합계로 재사용하지 않음. 담당자의 도구 실행 결과 확인, stdout 파일 미보관 |
| gap 수정 focused 검사 | analytics/application/public profile 24 PASS, 후속 analytics/public mock 10 PASS | data 담당 실행 보고. 서로 겹치는 검사이므로 수를 합산하지 않음 |
| 공개 큐·timeline 보강 focused 검사 | 당시 12 PASS | analytics 및 경기 성장 series 검사, data 담당 실행 보고. 공개 큐 allowlist/`MATCHED_GAME` 입력 경계, 저장 parser 큐 재검사, 중복 timeline 프레임 처리 포함 |
| data 최종 수정 focused 검사 | 30 PASS | analytics/경기 성장 series/application/public profile. 공개 제외 최신 페이지의 반복 초기화 방지까지 반영한 결과. 담당자 실행 식별자 `937c4c`, stdout 미보관 |
| 후속 gateway timeline focused 검사 | 31 PASS | 지원하지 않는 정상 JSON timeline의 영구 재시도 방지 보강. 담당자 실행 식별자 `8aea54`, focused eslint `1c96de`, stdout 미보관 |
| UI 집계·저장·빌드 focused 검사 | 14 PASS | UI 담당 실행 보고: `tests/riot-player-ui-analytics.test.ts`, `tests/riot-player-report-build.test.ts`. 특수 맵 아이템/큐·맵별 빌드 분리 포함. 후속 전체 검사와 실제 브라우저 검증은 별도 |
| Riot DB 최종 재검사 | 6 PASS | [db-contracts.json](./db-contracts.json), [db-contracts.log](./db-contracts.log). `0045` fresh/데이터가 있는 `0044` upgrade/replay, pending 작업 조회, 관측 시각/초기 partial/revision 회귀 포함. 임시 cluster 중지·삭제 확인 |
| 관리자 pagination | 6 PASS | `node --test tests/riot-admin-pagination.test.mjs`. 범위·필터 보존·첫/마지막·빈/초과 페이지·bulk 제외·5,000건 경계/조회 불가 검사 |
| 관리자 pagination lint/typecheck | 당시 PASS | 아래 명령. 이후 병렬 소스 변경의 최종 typecheck 근거로 대신하지 않음 |
| 운영 백업 + 격리 restore | PASS | [production-backup-restore.json](./production-backup-restore.json), 실제 archive 해시와 로컬 cluster 종료 별도 확인 |
| 운영 migration 사전 검사 | PASS, DB 변경 없음 | [db-migration-preflight.json](./db-migration-preflight.json), `databaseMutationIssued:false` |

기존 도구 결과 식별자는 data 55 `b3fd3f`, focused 24 `241e20`, 후속 10 `332b41`다. 이는 작업 대화의 실행 식별자이며 저장된 원본 로그 파일을 뜻하지 않는다. 본 기록자는 data 담당의 실행 보고와 해당 코드/스키마를 대조했다. pagination과 백업·preflight, 최신 DB 재검사는 본 기록자가 실행했다.

DB 재검사 종료 시각은 `2026-09-24T22:45:15.2477648Z` (09-25 07:45 KST)이며 6 PASS/0 FAIL, exit 0이다. 실행 전후 14개 대상 소스/스키마/검사 파일 해시가 같았다. 운영 DB를 사용하지 않았고 loopback 전용 PostgreSQL 18 cluster의 종료·임시 경로 삭제까지 확인했다. 이 결과에는 최초 부분 수집의 private epoch를 공개하지 않는 동작, 성공 관측 후 부분 실패에도 watermark를 유지하는 동작, revision 변경 시 초기화 및 실제 수집 시각 공개 검사가 포함된다.

DB 실행 후 gateway의 지원하지 않는 timeline 처리만 추가 수정됐다. DB 관련 소스는 바뀌지 않았으며, 실행 당시 해시와 후속 gateway 해시는 [db-contracts-followup.json](./db-contracts-followup.json)에 구분했다. 후속 31개 focused 검사가 보고됐고, 총괄 검토에 따라 DB 재실행은 하지 않았다. 최종 전체 검사는 별도 결과가 필요하다.

재현 명령:

```powershell
npx tsx --test tests/riot-player-analytics.test.ts tests/riot-recent-solo.test.ts tests/riot-application.test.ts tests/riot-public-profile-state.test.ts tests/riot-production-adapters.test.ts tests/riot-domain.test.ts tests/riot-adapter-contracts.test.ts tests/riot-activation.test.ts

$env:V2_DB_CONTRACT_SCOPE='riot'
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
npm run test:db

node --test tests/riot-admin-pagination.test.mjs
npx eslint 'src/app/(admin)/admin/riot/page.tsx' tests/riot-admin-pagination.test.mjs
npm run typecheck
```

## 백업·복원 근거

- 운영 연결 fingerprint: `c5918218dd171001`.
- 백업 당시 운영 head: `0044_vengeful_trauma`, journal 시각 `1790025671009`.
- read-only exported snapshot을 사용한 archive: 5,738,875 bytes, SHA256 `22c33abd435089d39d05986090d906e52d286fe0ecbbc146c654430075213078`.
- 비공개 archive 경로: `.private/recovery/riot-player-detail-20260925-9a3b87fe-983f-4979-a54b-46a0957e6462/production-before.dump`.
- PostgreSQL 17 운영 원본 → loopback 전용 PostgreSQL 18 임시 cluster로 복원. 186개 테이블의 행 수와 migration head 일치, 유효하지 않은 제약 0.
- raw catalog의 column/constraint 비교는 처음에 불일치했다. 삭제된 열의 물리 ordinal 간격과 PostgreSQL 18의 NOT NULL catalog 차이를 구분한 뒤 논리 열 일치, 제약 901개 일치, CHECK 23개 재파싱 비교, 미해결 차이 0을 확인했다. 원래 불일치 값도 JSON에 남겼다.
- schema 검증 시각 `2026-09-24T22:31:58.087Z` (09-25 07:31 KST). 임시 cluster 중지와 `pg_ctl status`의 no-server 결과를 확인했다. provider PITR은 검증하지 않았다.

## migration 적용 경계

사전 검사 당시 운영 journal은 45행, 새 3개 테이블은 존재하지 않았다. 검토한 `0045` SQL SHA256은 `148e5d87c43830320c41b0c53c7ed1a29b7f6ce61bcfa7a6d3bffdec67b9594f`다.

과거 운영 migration journal과 현재 source 사이의 불일치가 발견됐다. 인덱스 기준 14곳이며, timestamp 기준 불일치/대응 source 없음은 10곳이다. 전체 목록은 preflight JSON에 남겼다. 현 운영 journal 전체 fingerprint와 head `0044`, 백업 archive 실물, 검토한 `0045` 및 metadata 해시를 고정하여 **신규 `0045`만** 적용하는 ignored runner를 준비했다. 과거 source를 재적용하지 않는다.

검토한 runner로 운영 `0045` 적용 완료. 신규 3개 테이블·열·제약·index 확인, 기존 45개 journal 보존, 재실행 no-op 및 release lock 해제 PASS. [적용 근거](./db-migration.json). 기존 업무 데이터 변경은 하지 않았다.

## 아직 완료로 기록하지 않는 항목

| 항목 | 상태 |
|---|---|
| 최종 `npm run check` | PASS: 계약 441, 단위 995(+DB skip 1), lint 오류 0·기존 경고 57, 타입·ERD·프로덕션 빌드. [checks.json](./checks.json) |
| 공개 큐/사용자 지정 경기 제외 | 소스 및 focused 회귀 확인. 최신 전체 검사/운영 검증은 별도 대기 |
| 전체 동기화의 cooldown·기존 pending job 처리 | 소스 반영, 최종 전체 검사와 실제 운영 작업 결과 대기 |
| 추가 UI: 복수 패치·기기 리포트 저장·구매 순서별 빌드·성장 차트 | 합성 실제 컴포넌트 브라우저 PASS: [browser-local.json](./browser-local.json). 운영 API 검증은 별도 |
| 운영 `0044 → 0045` | PASS: [db-migration.json](./db-migration.json) |
| 최종 SHA의 배포와 운영 smoke | 대기. 배포 ID·immutable URL·alias·health 근거 필요 |
| 모든 회원 연결·전체 동기화 완료 | 대기. 미연결/연결 해제/잘못된 Riot ID의 조치 및 실제 작업 결과 집계 필요 |
| 180일 이력 전체·모든 timeline 수집 | 보장하지 않음. 증분별 이전 경기 10개·timeline 4개 예산과 provider 제한에 따라 진행 |

## 기능 범위의 한계

분석은 현재 불러온 실제 경기 표본이다. 시즌 전체, 지역/티어 전체 승픽밴율, lol.ps 비공개 MVP·인분·팀운·AI 분석을 동일하게 구현했다고 주장하지 않는다. LP는 동기화 시작 이후 날짜별 마지막 관측이며 과거 LP를 복원하지 않는다. 리포트 저장은 현재 브라우저 최대 10개이고 서버 동기화가 아니다. 이 제약과 미완료 대응 항목은 최종 패치 노트에도 유지한다.

## 최종 보완 검사

포탑 방패 실제 관측 평균·표본·정렬을 추가했고 누락값은 null, 실제 0은 보존한다. 최종 격리 DB 6개 PASS. 후속 parser 타입 캐스팅만 변경되었고 런타임 동작 차이 없음은 db-contracts-followup.json에 구분했다. 전체 앱 검사도 이 최종 소스에서 PASS다. 운영 전체 동기화와 배포는 아래 후속 근거에서 확정한다.
