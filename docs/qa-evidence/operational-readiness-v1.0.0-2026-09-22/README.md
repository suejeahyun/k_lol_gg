# 운영 준비 보완 1.0.0

- 작업일: 2026-09-22 KST. K-LOL.GG 웹사이트·서버·카카오 연동 범위.
- 시작 source: `04fee42ab54a527a42554340b579d5e402af597b`.
- 시작 production: `b7798363f9b0caee847a654afe2dde07afbcb2f9`, `dpl_Enu7zPFs7kr4pqUpiveAhB7BKXDJ`, DB `0041_clever_skullbuster`.
- 릴리스 소스: `c5cbbcd8a700a84c33283ab922bc1b5631e3123f`.
- 운영 적용: `dpl_7FHerKERF1CKe4kFvN5DQkvUHX8k` READY·production, [운영 주소](https://k-lol-gg.vercel.app), 확인 2026-09-21T21:54:32.954Z. DB0044·통계 예약 처리·후보/운영 실제 Blob·운영 읽기 PASS. 전체 검사 결과와 실기기 미확인 범위는 아래에 구분한다.

## 변경 범위

| 항목 | 구현·검증 기준 |
|---|---|
| 통계 자동 갱신 | 기존 MATCH_CHANGED outbox를 5분 주기·10건·20초 claim budget으로 처리. 인증·lease·실패 backoff·receipt·void/restore 검증 |
| 파티 복사 흐름 | 목록 20건 제한 제거, 번호별 직접 상세·DRAFT 재조회/취소, 저장 후 목록, 목록에서 편집코드 일괄발급 제거. R24 호환 |
| 사이트 내전 알림 | 실제 FEATURES scope의 SITE 9→10 transaction 큐, HMAC·target·nonce·lease·ack·만료·보관 정리. 기본 OFF |
| 회원 연결 검토 | UNVERIFIED 한글 표시와 필터, 사이트/카카오 정원 집계의 방·종목 범위 일치 |
| 모집 마감 | 06시 날짜 경계에서 IN_PROGRESS→CLOSED, 빈 DRAFT→CANCELED. 참가·예비·미연결 명단은 그대로 보존 |
| 팀 입력 | 최신 연결의 최근 솔로 요약, SUPER+TOTP 팀 전용 보정. MMR 원장 보존. 작성 중·무효 경기의 경력 집계 제외 |
| 운영 검증 | 실제 DB 백업 복원, 서명된 실제 Blob 진단 경로, 카카오 요청 시간·상태·trace 관측, 릴리스 문서 정합성 |

## 검증 근거

- `check-final.log`: 최종 소스 lint/typecheck/ERD/계약 418 PASS·단위 934 PASS(+DB 전용 1 skip)/홈 이미지/production build exit 0. lint 55 warnings, 오류 0. 임시·비공개 산출물을 lint 입력에서 제외하여 이전 326 warnings 중 임시 파일 경고가 제거됨.
- 통계 집중·격리 DB: `statistics-*.log` 및 [런북](../../operations/STATISTICS_PROJECTION_RUNBOOK.md).
- 팀 집중·격리 DB: `team-auxiliary-*.log` 및 [런북](../../operations/TEAM_BALANCE_AUXILIARY_DATA_RUNBOOK.md). 마지막 team-tools PG 3/3은 PUBLISHED→VOIDED→PUBLISHED 수렴과 원본 참가자 보존 포함.
- [파티 QA](../kakao-party-overview-v1.0.0-2026-09-22/README.md), [알림 QA](../site-notices-v1.0.0-2026-09-22/README.md), [저장소 QA](storage-probe/README.md).
- `production-backup-restore.json`: 운영 read-only snapshot 백업의 실제 복원 PASS. 184개 테이블 행 수, 논리 컬럼, 886개 제약, migration head 일치. 원본 DB 변경 없음. 제공자 PITR은 미검증.
- `db-preflight.json`: 실제 통계 PENDING 4건/최대 시도 0, 마지막 계산 2026-09-07, daily-close 성공 기록 확인. Riot 연결 92건은 DISCONNECTED이고 sync job 없음.
- `job-secret-config.json`: 기존 서명 작업 전용 운영 secret 신규 설정. 비밀 원문은 비공개 파일과 제공자에만 보관.
- `blob-provider-smoke.json`: 로컬 개발 OIDC 권한으로 운영 Blob에 접근할 수 없어 실패한 초기 기록. 앱의 운영 Blob 장애로 단정하지 않는다. 배포 후보 runtime의 별도 결과로 검증한다.
- 초기 `check.log`, `check-verified.log`, `full-qa.log`, `full-qa-final.log`, `full-qa-verified.log`에는 수정 전 실패 근거를 남긴다. 전체 DB에서 새 fixture와 충돌한 전역 개수 가정은 해당 테스트 주체로 범위를 제한했고, 같은 번호의 진행 중 파티와 초안이 공존할 때 종료 대상 선택은 실제 코드를 수정했다.
- `secrets.log`: 기존 전체 Git 이력 검사 PASS. `secrets-final-tree.log`: 신규 파일을 포함한 최종 작업 트리 검사 PASS. `deployment-inputs-final.json`: 제공자 CLI의 배포 입력에서 `.private`·`.tmp`·실제 환경 파일 제외 확인.
- `full-qa-complete.log`: 격리 PostgreSQL fresh·upgrade·재실행과 전체 DB 계약 139 PASS/0 fail/0 skip, 이어 105페이지·339개 desktop/tablet/mobile 캡처 PASS/issue 0. 운영 데이터·자격증명은 사용하거나 저장하지 않음. 전체 화면 결과·339개 SHA-256은 `browser/`, 대표 변경 화면 8개도 같은 폴더에 보관. 전체 PNG 원본은 `.tmp/readiness-qa-complete/screenshots/`에 유지한다.
- `auth-http.log`: 로그인·TOTP·세션·역할·로그아웃·production fixture 차단 HTTP 검사 PASS.
- `github-ci.json`: 동일 source의 main push에 대한 GitHub `V2 CI` success. 로컬 검사와 별도로 확인했다.
- `runtime-logs.json`: 운영 전환 뒤 검사 요청·통계 예약·저장소 진단 11건 모두 HTTP200, error/fatal 0. 카카오 고정 구조 로그 존재 확인. 이는 이 조회 시간 범위의 근거이며 장기 무오류를 보장하지 않는다.
- `db-migration.json`: 0041→0044, journal 42→45, 신규 테이블 2개/nullable 컬럼 2개, invalid constraint 0, 재실행 no-op. 업무 데이터 일괄 수정 없음.
- `blob-candidate-smoke.json`: 후보 runtime에서 `VERCEL_BLOB_PRIVATE` HTTP200, 업로드·내용검사·삭제·삭제확인 각각 1. 진단용 새 이미지 한 개만 사용했다.

## 미확인 외부 범위

1. MessengerBot 앱 0.7.29a는 사용자 응답으로 확인했다. 현재 휴대폰 봇 코드의 `/봇버전`, companion 설치·등록, 절전·재시작·실카카오 송수신은 미확인이다. 서버/설치본 기본 OFF를 유지한다.
2. Riot RSO client/state/encryption 설정과 실계정 승인·동의가 없어 기능 비활성 상태다. 요약 수집은 합성 gateway/PG 검증이며 실제 계정 수집 완료로 보지 않는다.
3. 실제 Android/TalkBack, 제공자 경보 수신, 제공자 PITR/장애 전환은 미확인이다.

## 배포·복구

[운영 절차](../../operations/OPERATIONAL_READINESS_RUNBOOK.md)를 따른다. 0042~0044는 기존 앱과 호환되는 추가 변경이다. 기존 READY 배포를 보존하고 새 후보 검사 후 alias를 전환한다. 운영 명단·회원·권한을 테스트 목적으로 변경하거나 실제 메시지를 발송하지 않는다.

## 다음 권고

1. 0.7.29a 실제 기기에서 companion 세션·타이머·재시작·중복 방지 확인 후 알림을 활성화한다.
2. 승인된 Riot RSO 자격과 동의된 실계정으로 연결→요약→팀 입력까지 확인한다.
3. 통계 지연·FAILED·저장소 probe 실패의 제공자 경보를 연결하고 실제 수신을 시험한다.
4. 실제 Android/TalkBack 및 운영자 작업 흐름을 점검한다.
5. 논리 복원 근거를 바탕으로 제공자 PITR·장애 전환 훈련 범위를 확정한다.

## 최종 운영 근거

- `deployment-production.json`: main Git source·운영 alias·READY·두 cron 설정. `live-production.json`: health와 허용된 읽기만 확인. 현재 목록 0건이므로 파티/내전 상세 실조회는 2종 모두 생략했다.
- `db-after.json`·`statistics-cron-audit.json`: 06:55 예약 작업 HTTP200, 기존 PENDING 4건→DELIVERED·receipt 4건의 원본 일치. CREATED 3건·AMENDED 1건 모두 old/new season이 없어 공개 시즌 재계산은 불필요했다. 따라서 READY 계산 시각과 projection run 수가 유지되는 것은 정상이다. 실제 공개 경기의 재계산·무효화·복구는 격리 DB에서 확인했다.
- `blob-production-smoke.json`: 실제 운영 주소에서도 저장소 네 단계 PASS. 서버 알림 feature flag는 OFF, companion 미설치. 실계정 Riot·실카카오 송수신·제공자 경보 수신/PITR은 완료로 보고하지 않는다.
