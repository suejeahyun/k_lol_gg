# 격리 UI MMR 409 — 공유 fixture 상태 오염

분류: **시험 환경/fixture 오류**. 실제 운영의 MMR 전환 및 후속 cron 성공과 다른 환경이다. 운영 환경 파일·DB·인증을 사용하거나 현재 격리 클러스터의 데이터를 수정하지 않고 원인을 확인했다.

## 관측과 원인

최종 UI용 loopback origin `http://127.0.0.1:64377`, disposable PostgreSQL `127.0.0.1:64185`, 경로 `.tmp/postgres-tests/klol-v2-pg-sQM0k9`를 runner와 pid metadata로 확인했다.

실제 재계산 요청 때 **2026-10-08 01:06:34.566 KST** PostgreSQL이 보고한 제약은 `mmr_projection_runs_generation_uidx`, 중복 값은 **result_generation=2**였다. 명령 영수증의 멱등 키 제약이 아니다. 이어 읽은 공개 로컬 요약은 generation 1 / V1_INTERNAL_MMR_1 / 2회차·2게임 / 수동 조정 1 / 대기 0이었다. 집계는 `isolated-mmr-fixture-diagnostic.json`에 보관했다.

소스의 순차 관계가 이 오류와 일치한다.

1. `mmr-projection.contract.test.ts`가 정상 BOOTSTRAP·재계산·수동 조정으로 generation 1~4를 게시하고 GLOBAL=4와 과거 원장을 남긴다.
2. 뒤의 `destruction-competition.contract.test.ts`는 자동 실력 수집 검증을 위해 GLOBAL을 generation 1로 덮고 끝에서 V1 공식으로 바꿨다. 기존 finally는 사이트 설정만 복원했다.
3. 같은 DB를 이어 사용하는 브라우저 harness에서 재계산은 GLOBAL+1인 generation 2를 다시 게시하려다 이미 존재하는 실행의 unique 제약에 걸린다.
4. repository의 기존 모든 PostgreSQL 23505→IDEMPOTENCY_MISMATCH 매핑으로 UI에는 새 키를 쓰라는 안내가 나타났다. 이 오류 분류는 원인을 가렸지만 generation 역행의 원인은 아니다.

현재 harness의 랜덤 DB 비밀번호는 runner process memory에만 있고 bootstrap 파일은 삭제되며 ready JSON에는 연결값이 없다. 인증 추출이나 DB 설정 변경을 하지 않았다. 따라서 **직접 SQL로 max generation·실행·영수증을 다시 조회하지 않았다.** PostgreSQL이 남긴 정확한 충돌 제약·값과 공개 요약, 앞선 계약의 generation 4 assertions를 근거로 삼았으며 이를 직접 SELECT 결과로 표시하지 않는다.

## 최소 수정

`tests/database/destruction-competition.contract.test.ts`의 fixture만 수정했다.

- 임시 MMR 덮기 직전에 GLOBAL **전체 row**를 보관한다.
- finally의 transaction에서 이 시험의 새 player + generation 1 profile만 제거한다. 기존 profile·실행·영수증·수동 조정 원장은 삭제하지 않는다.
- 기존 GLOBAL이 있었으면 전체 row를 복원하고, 없었으면 시험이 만든 GLOBAL만 제거한다.
- 복원 후 전체 row가 이전과 동일한지, 시험 profile이 남지 않는지, GLOBAL generation이 최신 projection run generation과 같은지 검사한다.
- cleanup에서 실패해도 pool을 종료한다.

23505 매핑은 이번 재현 원인에 대한 해결책이 아니어서 제품 repository는 수정하지 않았다. 정상 제품의 잠금·revision·원자적 게시 경로가 generation을 뒤로 변경했다는 증거는 없으며, 이 사건은 시험이 GLOBAL을 직접 덮어 쓴 경우다. 오류 분류 일반화를 바꾸는 별도 제품 변경은 포함하지 않았다.

## 검증 상태

focused ESLint는 exit 0 / 경고 0, diff whitespace 검사는 통과했다. 기존 클러스터 접근과 병렬 DB 기동은 수행하지 않았다. `V2_DB_CONTRACT_SCOPE=destruction`이 runner에서 지원되는 것은 확인했으나 이 scope만으로는 앞선 generation 4 보존을 재현하지 못하므로 **root의 새 순차 전체 DB 실행**에 위 회귀를 포함한다.

최종 통합 타입·전체 DB·새 UI harness 결과는 root의 해당 실행 로그로 연결해야 한다. 이 문서는 아직 실행하지 않은 후속 결과를 통과로 간주하지 않는다.
