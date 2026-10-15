# 팀 초안 조회·운영일 경계 검증

기준 소스는 `25516af8876467dee6f4a0994ce7fed5fd784df7`이다. 실제 운영 DB에 접속하거나 운영 자료를 변경하지 않았다. 스키마와 migration `0049_stable-recruit-codes`는 변경하지 않았다.

## 수정 전 재현

실제 repository를 import한 합성 query executor로 두 문제를 재현했다. 이 단계는 DB 응답 순서를 모델링한 검사이며 PostgreSQL 동시성 검증으로 세지 않는다.

- 초안 기본 정보 조회 뒤 재평가가 커밋되면, revision/평가 회차 1과 이전 후보 점수 50에 새 참가자 점수 90이 함께 반환됐다. 참가자 스냅샷은 재평가 때 교체되지만 후보 이력은 이전 회차를 보존하기 때문이다.
- 2026-10-16 01:00 KST의 운영일은 2026-10-15인데 `days=1` 신청자 조회의 최소 날짜는 2026-10-16이었다. 기본 화면의 `days=3`도 가장 오래된 포함 날짜를 6시간 먼저 제외했다.

## 구현

`PostgresTeamBalanceRepository.getDraft`에 기존 팀 점수 조회와 같은 `repeatable read`, `read only` 트랜잭션을 사용했다. 기본 정보·소유자 확인·참가자·후보를 같은 스냅샷에서 읽는다. 한 연결의 두 쿼리는 순서대로 실행한다. 현재 runtime 호출자는 DB 인스턴스로 repository를 만들며, 기존 트랜잭션을 전달해 중첩하는 호출은 없다.

신청자 날짜 하한은 기존 `recruitingOperatingDateKey`로 구한 운영일에서 요청 일수를 계산한다. 06시 정책 자체와 모집·신청 저장 정책은 그대로다.

## 최종 검증

```powershell
$env:V2_DB_CONTRACT_SCOPE='team-tools'
$env:PG_BIN_DIR='C:/Program Files/PostgreSQL/18/bin'
npm run test:db
```

최종 격리 PostgreSQL 18 검사 **8/8 PASS**: 초안 계약 6개, 팀 점수 계약 2개. 로컬 cluster 종료와 임시 경로 정리까지 확인했다. 초기 구현도 8/8을 통과했으며, 신규 읽기를 순차 실행으로 정리한 뒤 최종 코드를 다시 검증했다. 두 실행을 별도 검사 16개로 계산하지 않는다.

새 DB 회귀는 다음 동작을 확인한다.

- 실제 SQL의 첫 초안 SELECT 직후, 별도 연결에서 실제 `TeamBalanceService.reevaluateDraft`를 실행하고 커밋한다. SQL을 가짜 응답으로 바꾸지 않으며, 테스트 wrapper는 커밋 시점만 고정한다.
- 첫 GET은 revision 0·평가 회차 1·rating generation 1·참가자/후보 점수 50을 일관되게 반환한다. 다음 GET은 revision 1·평가 회차 2·generation 2·점수 90을 반환한다.
- PostgreSQL의 `transaction_isolation=repeatable read`, `transaction_read_only=on`을 직접 확인하고, 다른 소유자 거절과 없는 초안의 null 응답을 확인한다.
- 실제 신청 행을 조회해 자정 이전, 자정, 05:59:59까지 `days=1`/`days=3` 범위가 유지되고 06:00에만 하한이 바뀌는 것을 확인한다.
- 기존 소유자/관리자 권한, 멱등성, 공정성 위반 rollback, 과거 JSON 보존, 저장·재평가·보관 수명주기 검사도 통과한다.

담당 파일 ESLint 오류/경고 0, `git diff --check` PASS. 테스트 wrapper 최초 타입 검사에서 `unknown` 반환 타입과 UUID 문자열 배열의 타입 오류가 발견돼 명시적 타입으로 수정했다. 최종 통합 타입·단위·계약·build 결과는 전체 점검 기록을 따른다.

기존 팀 점수 테스트의 병렬 provider 조회에서 node-postgres의 같은 연결 동시 쿼리 deprecation 안내가 남는다. 이번 수정의 `getDraft`는 순차 조회하며 이 안내를 해결했다고 기록하지 않는다. 별도 `npm audit --omit=dev --json`은 운영 의존성 취약점 0건이었다.
