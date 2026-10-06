# MMR 공식 전환 영향 확인 — 2026-10-06

## 실제 읽기 전용 미리보기

2026-10-06 08:48 KST 운영 DB의 `REPEATABLE READ READ ONLY` 스냅샷으로 현재 repository의 `getSummary()`와 원장 로더 `loadLedger`를 실행하고, 기존 순수 계산기 `rebuildMmrProjection`으로 다음 generation을 메모리에서 계산했다. 기존 private 로더 함수 본문을 그대로 읽어 사용했으며 제품 소스나 계산식을 수정하지 않았다. 읽기 전용 설정을 확인했고 `ROLLBACK`으로 종료했다. 동일 스냅샷의 전후 summary가 일치하며 같은 원장의 순수 재생 결과도 일치했다.

연결은 앞선 운영 storage-probe runId 대조로 검증된 기존 바인딩을 사용했다. 접속값, 이름, 계정, 플레이어별 원장·점수는 QA에 저장하지 않았다. 첫 연결 시 pooler가 startup `options`를 `08P01`로 거부했다. 이를 제거하고 연결 직후 읽기 전용 transaction을 시작하여 성공했으며, 실패한 연결에서는 원장을 읽거나 변경하지 않았다.

| 항목 | 현재 V1 | V2 미리보기 |
| --- | ---: | ---: |
| generation | 1 | 2 |
| 경기 회차 | 42 | 47 |
| 게임 | 91 | 104 |
| 전체 프로필 | 81 | 93 |
| 공개 활성 프로필 | 80 | 92 |
| 수동 조정 원장 | 0 | 0 |

기존 81명 중 65명의 종합 점수가 바뀐다. 25명 상승, 40명 하락, 16명 동일이며 차이는 **-10.17~+7.39점**이다. 신규 프로필은 12명, 사라지는 기존 프로필은 0명이다. 공개 활성 기존 80명 중 78명의 순위가 바뀌며 최대 상승 32위·하락 48위다. 순위 차이는 신규 진입 효과도 포함한다. 이 비교는 **공식 변경과 현재까지 미반영된 경기 원장 반영을 합친 영향**이며 공식만의 독립적인 영향 수치는 아니다.

기존 17명의 종합 표본이 늘어난다(최대 10). 포지션 표본은 -58~+3으로 변한다. V1 이관은 각 포지션의 표본에 전체 `matchesAnalyzed`를 복사했지만, V2는 실제 해당 포지션 게임 수를 센다. 따라서 포지션 표본 감소는 원본 경기 삭제를 뜻하지 않는다. 포지션별 점수·표본 변화 및 신뢰도 변화의 합계는 [미리보기 JSON](./mmr-transition-impact.json)에 남겼다.

## 실행 권한과 결정 범위

공식 전환이 포함된 것으로 사용자가 명시한 전체 진행 지시가 있다면 같은 허가를 다시 요청할 필요는 없다. 광범위한 개선 요청과 별개로 기존 점수·순위가 바뀌는 구체적 범위는 위 수치대로 알려야 한다. 실제 쓰기 실행은 **유효한 SUPER_ADMIN의 ADMIN-purpose 로그인**이 필요하다. 계정은 APPROVED 상태여야 하고 비밀번호 강제 변경 상태가 아니어야 하며, 서버가 account/session/authVersion/revocation/expiry를 transaction에서 재검증한다. 현재 TOTP는 선택 사항이다. 일반 ACCOUNT 로그인, 운영 DB 접속 자격, 위조 세션으로 이 경계를 대신하지 않는다.

운영 UI는 `/admin/balance-ai`의 전체 원장 재계산 → 공식 전환 확인을 사용한다. 실제 API는 `/api/admin/balance-ai/recalculate`이며 현재 generation `If-Match`, 멱등 키, 같은 출처 검사와 감사 기록을 유지한다. 이 조사에서는 이 mutation을 호출하지 않았다.

## 보존·복구와 완료 조건

성공 시 generation 2의 점수·포지션·경기 이벤트·소비 영수증·감사 기록과 GLOBAL 상태 교체가 한 transaction으로 반영된다. 기존 generation 1 프로필은 삭제하지 않는다. 원본 경기·회원·수동 조정도 변경하지 않는다.

기존 generation을 선택해 복귀하는 UI/API는 없다. **Vercel 배포 롤백만으로 게시 점수가 V1로 돌아가지는 않는다.** 문제 시 예약 작업을 멈추고 원인을 확인한 뒤 검증된 forward-fix 재계산 또는 사전 DB backup/PITR 복구 범위를 결정해야 한다. 이번 조사만으로 현재 운영 backup/PITR 복구가 검증되었다고 주장하지 않는다. 구 generation 테이블이 남는다는 사실만으로 즉석 pointer 수동 변경을 승인하지 않는다.

실행 직전 현재 generation과 원장 변화를 다시 확인하고, 지연된 결정이면 미리보기를 갱신한다. 실행 후 V2 공식·47회/104게임(원장이 그대로인 경우)·프로필 및 공개 순위를 대조하고, 미소비 13건의 영수증과 후속 예약의 `IDLE` 또는 새 변경의 `REBUILT`를 확인해야 최신 MMR 반영 완료로 판단할 수 있다. 실제 운영 전환 및 후속 cron 확인은 이 읽기 전용 미리보기의 완료 항목이 아니다.

재현 도구: `npx tsx qa/mmr-transition-impact-readonly.ts <검증된 기존 env 파일 경로> [합계 JSON 출력 경로]`. 도구는 제품의 기존 읽기 매핑과 순수 계산기를 사용하며 DB 쓰기 함수는 호출하지 않는다.

## 격리 회귀 검증

`V2_DB_CONTRACT_SCOPE=mmr npm run test:db`는 2026-10-06 실행에서 통과했고 일회성 PostgreSQL 18 cluster를 정지·정리했다. 실제 DB와 HTTP handler를 사용하는 기존 계약은 원장 재생, 동시 갱신 한 번 적용, 잠금 시간 초과 503, 구 공식의 빈 큐/대기 큐 409 및 상태·영수증 보존, SUPER_ADMIN의 명시적 전환과 멱등 재실행, 전환 후 cron IDLE, ADMIN 변경 거부, 이전 generation 보존을 검증한다. [실행 로그](./mmr-isolated-db.log)

새 읽기 전용 미리보기 도구의 ESLint와 `git diff --check`도 통과했다. 운영 공식 전환 자체를 실행한 결과로 해석하지 않는다.

## 전환 전 실제 논리 백업·복원

2026-10-06 08:58:42 KST의 운영 읽기 전용 스냅샷을 `pg_dump -Fc --no-owner --no-privileges --snapshot`으로 백업했다. 비공개 archive는 `.private/recovery/mmr-before-transition-994cb45b-70e1-46db-a6a0-89f0ac2ea7ff/production-before.dump`에 보존한다. 크기는 130,745,264 bytes, SHA-256은 `c90c9ee465ffc58bf0f0e0eb3e2ac229db8d92765ce83823cc488644a17a52a2`다. 백업은 164.504초, 별도 loopback PostgreSQL 18 복원은 35.316초가 걸렸다. 이 시간은 전체 장애 복구 RTO가 아니다.

192개 전체 테이블 행 수, 논리 컬럼, 922개 제약조건(원본 CHECK 24개를 복원 서버에서 재파싱), 유효한 FK·제약, migration 0047 head, MMR generation 1 상태가 일치했다. 추가 MMR 내용 비교에서는 운영 GMT와 복원 Asia/Seoul의 timestamp JSON 표현이 달라 초기 해시가 달랐다. 양쪽 읽기 전용 transaction을 UTC로 맞춰 9개 MMR 테이블의 **모든 JSON 행을 직접 비교**한 결과 완전히 일치했다. 비교 시 운영은 여전히 V1 generation 1이었으며 점수 전환을 하지 않았다. 로컬 cluster는 정지했다. [최종 결과](./mmr-before-transition-backup-final.json)

초기 [migration head 실패 기록](./mmr-before-transition-backup.json)은 별도로 보존한다. Windows CRLF 파일 해시를 사용한 QA 실행기 문제였고, 운영 head가 Git LF 원문의 hash와 일치함을 확인했다. 첫 archive 생성 후 Windows `pg_ctl`의 출력 파이프 대기가 발견되어 실행기를 기존 절차와 같은 `stdio: ignore`로 수정하고 새 스냅샷으로 전체 검증했다. 정규화 비교를 재시작할 때 격리 포트 누락으로 로컬 시작이 한 번 거부된 기록도 최종 JSON에 남겼다. 어느 경우도 운영 원장을 수정하지 않았다.

최종 JSON의 `priorCanonicalAttemptFailure`는 이 과거 로컬 재시작 시도의 중간 진단이다. 현재 실패 필드인 `canonicalFailure`로 남기지 않았으며, 이후 정확한 격리 포트에서 비교한 `status: PASS`·`mmrContentsMatch: true`가 최종 판정이다.

이 결과로 **현재 운영 논리 archive가 실제 로컬 DB로 복원됨**은 확인했다. Provider PITR, Blob 원본 파일, 비밀키 escrow, 실제 운영 장애 전환은 검증하지 않았다. 실제 전체 DB 복구 시 이 스냅샷 이후 다른 회원·경기·연동 쓰기의 손실 범위를 먼저 산정해야 한다. 앱 배포 롤백만으로 MMR 점수가 복구되지는 않는다.
