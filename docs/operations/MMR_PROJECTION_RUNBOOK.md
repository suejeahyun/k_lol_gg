# MMR 경기 반영 예약 작업

`GET /api/cron/mmr-projection`은 기존 MMR 서비스의 `catchUp()`을 호출한다. `vercel.json`의 주기는 5분이다. 공개 랭킹 조회는 쓰기를 실행하지 않는다. 시즌 통계와 별도 영수증을 사용하므로 기존 통계 outbox 소비와 경쟁하지 않는다.

## 실행과 보호

- 기존 `CRON_SECRET`의 정확한 Bearer 인증을 DB 연결 전에 검사한다. 경로·GET·query 없음도 확인한다. 비밀 원문을 기록하지 않는다.
- 전역 transaction 잠금 안에서 공식 버전과 미소비 경기 이벤트를 확인한다. 현재 공개 원장 전체를 재계산하고 새 generation·영수증을 원자적으로 게시한다.
- 이벤트가 없으면 `IDLE`, 반영하면 `REBUILT`를 반환한다. 응답에는 고정 상태·generation·소비 건수만 포함한다.
- 함수 최대 실행 시간 60초, SQL statement timeout 10초, lock timeout 2초다. 실패는 원문을 숨긴 HTTP 503과 `Retry-After: 60`으로 응답한다. 다음 예약이 다시 시도하며 실패 transaction은 마지막 집계를 유지한다.

## 기존 공식에서 전환

게시된 공식이 현재 코드 공식과 다르면 자동 작업은 HTTP 409 `MMR_FORMULA_TRANSITION_REQUIRED`로 멈춘다. 대기 이벤트가 없어도 이 상태를 정상 `IDLE`로 표시하지 않는다.

1. 현재 generation·공식·집계 경기 수와 새 계산의 영향 범위를 읽기 전용으로 확인한다.
2. 기존 점수가 변하는 공식 전환에 대한 운영자 확인을 받는다.
3. 최고 관리자가 `/admin/balance-ai`에서 **전체 원장 재계산**을 실행한다. 기존 인증·revision·멱등성·감사 경계를 사용한다. 직접 DB 수정이나 세션 위조로 대신하지 않는다.
4. 새 공식·집계 경기 수·공개 랭킹을 대조한다. 후속 cron에서 `IDLE` 또는 새 경기의 `REBUILT`를 확인한다.

예약 배포와 기존 점수 전환 완료는 별개다. 배포만으로 실제 최신 MMR 반영을 선언하지 않는다. 기존 generation은 보존되며 문제 발생 시 예약을 중단하고 원인을 확인한다. 영수증·점수 테이블을 임의 삭제하지 않는다.

## 검증

- `node node_modules/tsx/dist/cli.mjs --test tests/mmr-projection-cron.test.ts`
- PowerShell: `$env:V2_DB_CONTRACT_SCOPE='mmr'; npm run test:db`

격리 DB 검증에는 실제 HTTP handler, 잠금 시간 초과, 동시 호출의 1회 적용, 과거 경기 수정에 따른 후속 경기 재계산, 기존 공식 차단 시 데이터 보존, 명시적 최고 관리자 전환 후 자동 갱신 재개를 포함한다. 운영 배포 SHA·cron 구성·실제 실행 결과는 릴리스 QA에 따로 기록한다.
