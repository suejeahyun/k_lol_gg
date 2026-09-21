# 경기 변경 통계 예약 작업

## 구현과 호출 경계

`GET /api/cron/statistics-projection`은 기존 `MATCH_CHANGED` outbox와 통계 소비 엔진을 사용한다. 공개 조회는 쓰기를 수행하지 않고, SUPER_ADMIN의 revision·멱등성 기반 수동 재계산도 유지한다. 이 문서 자체는 운영 활성화나 현재 운영 검증의 근거가 아니다. 배포 SHA·예약 설정·실행 결과는 해당 릴리스 QA에 따로 남긴다.

- 기존 `CRON_SECRET`의 정확한 Bearer 인증을 DB 연결 전에 확인한다. 32자 미만·미설정·다른 method·다른 경로·query string은 거부한다. 관리자 세션이나 사용자 입력으로 처리 범위를 지정할 수 없다.
- 호출당 최대 10개, 20초 동안만 다음 이벤트를 claim한다. 진행 중인 transaction은 마친다. Vercel 함수 최대 실행 시간은 60초이고, 각 claim/apply transaction의 statement timeout은 10초·lock timeout은 2초다. 20초는 진행 중인 transaction을 강제로 취소하는 제한이 아니다.
- DB의 `FOR UPDATE SKIP LOCKED`, 60초 lease, 원본 digest·revision·scope 확인과 receipt로 동시 호출 및 중복 처리를 보호한다. 작업이 중단된 lease는 후속 호출이 회수한다.
- `AMENDED`의 이전·새 시즌, `VOIDED`의 이전 시즌, `RESTORED`의 새 시즌을 실제 현재 PUBLISHED 경기로 다시 계산한다. 시즌 잠금은 정해진 순서대로 획득한다.
- 첫 실패에서 해당 batch를 중단한다. FAILED 이벤트의 다음 시도는 30초부터 지수 증가하여 최대 15분 뒤 가능하다. 다음 예약 호출이 재시도하며, 실패한 transaction은 마지막 READY 집계를 바꾸지 않는다.
- DB 오류 원문·SQL·접속값·회원명은 저장하거나 응답하지 않는다. `last_error_code`에는 고정 도메인 코드, 재시도 가능한 SQLSTATE 분류 또는 일반 실패 코드만 남긴다.

## 운영 활성화와 확인

1. 배포 전 운영 outbox의 상태별 수, 가장 오래된 미처리 시각, READY generation·최근 projection run을 개인정보 없이 기록한다.
2. 현재 코드와 DB migration head를 확인하고 정상 백업·복구 근거를 확보한다. 이 연결은 새 migration을 요구하지 않는다.
3. Production의 `CRON_SECRET` 존재·형식만 확인한다. 비밀 원문을 QA에 기록하지 않는다. 같은 키를 Preview나 외부 호출자에게 복사하지 않는다.
4. `vercel.json`에 새 경로의 예약을 등록한다. 제안 주기는 5분(`*/5 * * * *`)이며 실제 제공자 플랜의 허용 주기와 함수 실행 시간을 확인한다. 기존 카카오 종료 예약은 유지한다.
5. 확정한 source SHA를 배포하고 인증 없는 호출이 401인지, 인증된 빈큐 호출이 200·`IDLE`인지 확인한다. backlog가 있으면 승인된 갱신 범위에서 처리 전후를 대조한다.
6. `DELIVERED`·receipt·projection run과 READY 집계, 공개 랭킹·플레이어 통계를 원본 PUBLISHED 경기와 대조한다. 처리 전후 운영 경기·회원 원본을 변경하지 않는다.
7. 제공자 예약 실행 로그와 다음 실행을 확인한다. 503, FAILED 증가, oldest 미처리 시간 증가를 경보 대상으로 연결한다. 예약 구성만으로 실제 실행 완료를 선언하지 않는다.

## 관측과 재시도

응답은 `job`, `processed`, `applied`, `replayed`, `failed`, `stopped` 숫자·고정 문자열만 제공한다. `IDLE`은 빈큐, `LIMIT`·`TIME_BUDGET`은 다음 예약에 이어서 처리할 정상 종료다. 실패는 HTTP 503과 `Retry-After: 60`을 반환한다. 실제 다음 claim은 이벤트별 `available_at`도 만족해야 한다.

기존 관리자 통계 상태에서 pending/failed 수를 확인하고, `competition.match_recalculation_outbox`, `match_projection_receipts`, `statistics_projection_runs`로 적용 이력을 연결한다. 원문 데이터·비밀값이 포함된 DB 예외를 경보에 전달하지 않는다. 같은 오류가 반복되면 자동 retry만 기다리지 말고 고정 오류코드·outbox 상태와 원본/집계 정합성을 점검한다.

문제가 있으면 새 예약을 중지하고 원인을 수정한다. outbox·receipt·통계 데이터를 임의 삭제하거나 FAILED를 직접 DELIVERED로 바꾸지 않는다. 기존 SUPER_ADMIN 수동 재계산을 사용하는 경우 현재 revision 확인과 영향 검토를 유지한다.

## 재현 가능한 비운영 검증

- `node node_modules/tsx/dist/cli.mjs --test tests/statistics-projection-cron.test.ts tests/statistics-projection-service.test.ts tests/statistics-connection.test.ts`
- PowerShell: `$env:V2_DB_CONTRACT_SCOPE='statistics'; node node_modules/tsx/dist/cli.mjs scripts/test-db/run-data-contracts.ts`

격리 PostgreSQL 계약은 기존 publish·시즌 이동·receipt replay에 더해 실제 HTTP handler를 통한 실패/backoff/재시도, void/restore 수렴, 동시 호출의 1회 적용, 중단된 lease 회수를 검사한다. 실제 운영 실행·실제 제공자 예약 검증과 구분한다.
