# V2 데이터베이스 복구·전환 준비 런북

이 문서는 **운영 배포 절차가 아니라**, 운영 자격증명 없이 실행하는 로컬 복구 드릴과 운영 전 확인 항목을 분리한다. 로컬 드릴 통과만으로 production 복구 준비 완료나 V1→V2 전환 가능을 선언하지 않는다.

## 자동 격리 드릴

```powershell
npm run verify:recovery
```

드릴은 다음 안전장치를 강제한다.

- `NODE_ENV=test`, `V2_DB_TEST_MODE=true`, loopback host, `klol_v2_test_` DB 이름이 아니면 즉시 중단한다.
- PostgreSQL 18 임시 cluster와 합성 데이터만 사용한다. `DATABASE_URL`·운영 데이터·Vercel·Blob에는 접근하지 않는다.
- `pg_dump -Fc --no-owner --no-privileges` archive를 만들고 SHA-256과 migration head를 계산한다.
- 별도 빈 DB에 `pg_restore --single-transaction --exit-on-error`로 복원한다.
- 전체 사용자 schema fingerprint, 모든 테이블 row count, 합성 계정↔플레이어 관계, 검증된 FK, migration journal을 원본과 대조한다.
- 복원 DB에 migration을 두 번 재적용해 no-op인지 확인한다.
- DDL과 DML 뒤 의도적 unique 오류를 일으켜 transaction rollback 후 column과 데이터가 모두 원상태인지 확인한다.
- SUPER+TOTP transaction 재확인, 보존기간 경계, idempotent replay, receipt·audit·outbox를 포함한 audit/rate-limit cleanup 계약을 확인한다.
- 종료할 때 임시 DB와 정지된 임시 cluster 경로만 제거한다.

`PG_BIN_DIR`를 지정하면 그 경로의 PostgreSQL 18 `initdb`, `pg_ctl`, `pg_dump`, `pg_restore`를 사용한다. 출력되는 JSON은 비밀값 없이 archive 크기·checksum·migration head·대조 결과만 담는다. CI에서는 이 JSON과 TAP 출력을 job artifact로 보존한다.

## 확인됨과 미확인

### 로컬에서 확인되는 항목

- 빈 PostgreSQL 18에 전체 journal migration 설치 및 반복 적용
- custom-format logical archive 생성과 별도 DB 복원
- schema·row count·핵심 관계·FK·migration head 일치
- 실패한 transactional migration의 DDL/DML rollback
- 만료 세션/rate bucket 정리, 관리자 audit/rate-limit 정리의 범위·권한·멱등성·원자성
- private asset의 `STAGED → DELETE_PENDING` crash recovery와 bounded retry 계약 (`tests/private-asset-core.test.ts`)

### 운영 전까지 미확인인 항목

- provider PITR가 실제 선택 시점으로 복원되는지와 요금제별 보존기간
- production 크기·익명화 데이터에서의 dump/restore 시간, RPO/RTO
- V1 79개 모델의 실제 export→V2 import count/hash/relation reconciliation
- Blob object archive/복원과 DB row의 object checksum 대조
- TOTP keyring·session signing key의 별도 escrow 복구
- Vercel 환경변수, DNS/alias, V1 read-only 전환과 blue-black 복귀 리허설
- cleanup job scheduler, 실패 알림, WAF/관측 설정의 실제 운영 연결

따라서 현재 판정은 **로컬 PostgreSQL 논리 복구와 cleanup 구현은 확인됨**, **운영 복구 및 전환 준비 완료는 미확인**이다.

## 운영 전 실행 순서

1. V1을 read-only로 만들기 전 backup ID, migration head, 앱 commit SHA, provider PITR 시점을 기록한다.
2. 운영 데이터 대신 최신 익명화 rehearsal 복제본에서 V1 export→V2 import를 실행한다.
3. 모델별 row count, unique/FK, legacy ID mapping, 핵심 상태 합계를 100% 대조한다.
4. 별도 격리 환경에서 provider PITR와 logical archive를 각각 복원하고 핵심 로그인·TOTP·플레이어·경기 smoke를 수행한다.
5. 실제 측정한 RPO/RTO와 실패 지점을 기록한다. 목표를 넘으면 전환하지 않는다.
6. V2 검증 실패를 가정해 V1 blue-black 별칭으로 되돌리는 리허설을 수행한다.
7. 모든 증거와 담당자 확인 뒤에만 production 전환을 별도 승인한다.

하향 migration은 제공하지 않는다. 실패한 미적용 migration은 transaction rollback하고, 이미 적용된 데이터 변경은 검증된 archive/PITR 복원 또는 forward-fix로 복구한다. 수동 `DROP`/`TRUNCATE`를 rollback 절차로 사용하지 않는다.
