# Riot 플레이어 상세 1.0.0 검증

2026-09-25. 소스·운영 DB·배포 확인 완료. **활성 회원 142명 중 연결 106명, 등록 Riot ID 확인 필요 36명이며 전체 전적 수집 완료를 뜻하지 않는다.** 전체 동기화 실행은 관리자 브라우저 재로그인 대기다.

- source/tag: `63568981e3aab41ba18424075b1b7b239078481e` / `riot-player-detail-v1.0.0`
- migration: `0045_simple_reptil`
- Vercel: `dpl_KyLuZt71CnB4iGbXie8dUkBZPUHV`, [immutable 배포](https://k-lol-466zj7hni-tjdmswo11-3715s-projects.vercel.app), [운영 사이트](https://k-lol-gg.vercel.app)
- [배포 근거](./deployment.json): READY, 확인 당시 운영 alias SHA 일치.
- [CI](./ci.json): V2 CI 36069966400 success.

## 검사 결과

| 검사 | 결과 | 근거 |
|---|---|---|
| 전체 앱 | PASS: 계약 441, 단위 995, DB 전용 skip 1 | [checks.json](./checks.json), lint 오류 0/기존 경고 57, 타입·ERD·이미지·production build |
| Riot 격리 PostgreSQL | 6 PASS, 0 FAIL | [JSON](./db-contracts.json), [실행 로그](./db-contracts.log), fresh/0044 upgrade/replay·현재 연결·부분 수집 watermark·pending 조회 |
| 후속 타입 변경 | 런타임 변경 없음, 최종 전체 check PASS | [후속 해시](./db-contracts-followup.json). parser 반환 cast만 변경 |
| 비밀정보 | 현재 tree 및 전체 Git history PASS | 실제 secret scan 실행, checks.json |
| 합성 실제 컴포넌트 브라우저 | PASS | [browser-local.json](./browser-local.json): 필터·복수 패치·정렬·저장/재진입·360px·키보드·성장 차트 |
| 운영 HTTP | PASS: 실제31경기·rank1일·상세10인/26프레임, no-store·private ID 없음·잘못된 입력400 | [public-smoke.json](./public-smoke.json) |
| 운영 전체 수집 | 현재 집계 | [production-sync.json](./production-sync.json). 연결, 랭크 관측, 상세 수집은 서로 별개 |

초기 전체 검사에서 public query mock의 innerJoin 누락, 최종 보완 중 parser 타입 cast 오류를 발견하여 수정했다. 위 전체 PASS는 두 수정과 포탑 방패 추가가 모두 포함된 최종 소스에서 실행한 결과다.

## 운영 DB 적용과 복구 근거

[운영 백업·격리 복원](./production-backup-restore.json)은 PASS다. read-only exported snapshot archive 5,738,875 bytes, SHA256 `22c33abd435089d39d05986090d906e52d286fe0ecbbc146c654430075213078`. archive는 ignored private recovery 경로에 보관한다. PostgreSQL 17 원본을 loopback PostgreSQL 18에 복원하여 186개 테이블 행 수·논리 열·제약 901개 일치, CHECK 23개 canonicalization, 유효하지 않은 제약 0을 확인했다. 물리 열 ordinal 및 PostgreSQL 18 NOT NULL catalog 차이로 발생한 최초 raw mismatch도 원본 증거에 남겼다. 임시 cluster 중지/정리 확인. provider PITR은 검증하지 않았다.

[사전 검사](./db-migration-preflight.json)에서 과거 source와 운영 migration journal 드리프트(인덱스 기준 14곳, timestamp 기준 10곳)를 확인했다. 전체 기존 운영 journal fingerprint와 0044 head, 실제 백업 해시, 검토한 0045 SQL/metadata를 고정한 runner로 **신규 0045만** 적용했다. 과거 migration을 재생하거나 기존 업무 데이터를 덮지 않았다.

[운영 적용](./db-migration.json): analytics_progress·match_archive·rank_history의 열·PK/FK/CHECK·paging index 정상, 45개 기존 journal 보존 및 46번째 head 확인, 재실행 no-op PASS. release lock 해제 확인. SQL SHA256 `148e5d87c43830320c41b0c53c7ed1a29b7f6ce61bcfa7a6d3bffdec67b9594f`.

## 기능과 데이터 경계

[PD01–32 대응표](../../parity/RIOT_PLAYER_DETAIL_PARITY.md), [ADR0013](../../architecture/0013-riot-player-detail-projections.md), [사용자 안내](../../patch-notes/2026-09-25-riot-player-detail.md)를 함께 따른다.

- 종합/챔피언/리포트, 모스트·라인·날짜별 통계, 복수 필터, 참가자 스코어보드·성장 그래프·아이템/룬/주문·실제 구매/스킬 순서·포탑 방패 관측 평균, 개인 빌드/상성 표본, 리포트 기기 저장을 제공한다.
- 화면 조회는 저장 projection을 읽는다. 큰 timeline은 경기 펼침/빌드 분석 시 별도 저장 조회하며 Riot API를 화면 로딩 중 연쇄 호출하지 않는다.
- 현재 연결/소유자/등록 ID/revision/ACTIVE 경계를 유지하고 private PUUID·인증 ID·토큰·원본 provider JSON은 공개 DTO에 보존하지 않는다. 일반 공개 매칭 큐만 허용하며 사용자 지정·연습·미확인 큐는 제외한다.
- 최근 180일 범위 증분 수집, 최초 40경기와 cursor 더 보기. 한 번의 sync로 180일 및 모든 timeline 수집을 보장하지 않는다. 매 실행 이전 경기 10개·timeline 최대4개, provider 429와 25초 예산을 준수한다.
- 날짜별 LP는 수집 시작 이후 마지막 실제 관측이다. 과거 LP·개별 경기 LP 변화를 추정하지 않는다. 연도/기간은 공식 시즌·스플릿 분류와 다르다.
- 개인 표본은 KR/티어 전체 승픽밴율이나 일반 유저 평균이 아니다. lol.ps 독자 인분/MVP/팀운/AI, 위치 기반 로밍/갱 성공 판정, 지역 모집단 비교는 동일 기능으로 제공하지 않는다.
- 리포트는 현재 기기 최대10개, 필터·계산 버전·결과 고정 저장. 서버/다른 기기 동기화 없음.

## 전체 회원 연결·동기화

활성 142명 모두 검토, 현재 연결 106명(직접 본인2·관리자104). 연결 해제24·미연결12는 등록 ID 확인 필요. 36명 중 형식 오류10명(태그 공백7·길이초과3), 나머지26명은 등록된 ID의 실제 조회/일치 확인이 필요하다. 임의 Riot ID 수정이나 RSO 소유권 인증 전환은 하지 않았다. 비활성56명은 새 연결 대상에서 제외했다.

전체 sync는 목록 페이지와 무관하게 연결 전체를 대상으로 한다. 기존 pending 작업 재사용 및 개별 cooldown 이후 예약을 적용하여 한 명의 대기 때문에 전체 요청이 실패하지 않게 했다. 브라우저 세션 초기화 후 관리자 재로그인을 요청했으며, 인증을 우회하여 관리자 요청을 생성하지 않는다. 실제 실행과 수집 수는 production-sync.json의 확인 시각을 기준으로 한다.

## 운영 실제 화면 후속 검증

[browser-production.json](./browser-production.json): 실제31경기 종합·챔피언·리포트·필터·lazy timeline 확인. 360px에서 timeline 펼침 시 문서 폭593px 오류 발견. 1.0.0의 모바일 최종 PASS로 표시하지 않고 별도1.0.1 forward-fix와 재검증으로 처리한다. 정기 수집 첫1명31경기·timeline4개·LP관측1일을 확인했으며 전체106명 완료가 아니다.
