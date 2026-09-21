# admin-operational-health@1.0.0 로컬 검증

- 기준: `c2d0dcbd` 이후 공동 작업 중인 source, 2026-09-22.
- 범위: 기존 `/admin` 상태 카드 5개, 고정 DTO·readonly DB 집계·판정·전용 계약 테스트. 신규 route/migration 없음.
- 배포/운영 DB/외부 API/휴대폰: 이 증거에서는 실행·확인하지 않음. Git tag/배포 ID는 통합 릴리스 담당이 확정한다.

## 실행 결과

| 검사 | 결과 |
|---|---|
| `npx tsx --test tests/operational-health.test.ts` | 3 PASS: KST 일일 경계와 여유, queue 임계값, 비활성/합성/증거 없음/실제 probe 실패 구분 |
| `node --test tests/operational-health-boundary.test.mjs` | 1 PASS: ADMIN 인가가 조회보다 먼저, 서버 렌더링, public health/settings 분리, polling·쓰기 없음, 미확인 문구 |
| `V2_DB_CONTRACT_SCOPE=operations npx tsx scripts/test-db/run-data-contracts.ts` | 3 PASS: 기존 operations + storage-probe + 신규 operational-health. PostgreSQL 18 일회성 cluster 종료·경로 삭제 확인 |
| 변경 파일 ESLint | PASS |
| `npx tsc --noEmit --incremental false` | 초기 PASS. 마지막 재실행은 동시 작성 중인 Riot probe 테스트 2곳의 POST literal 오류로 실패하여 담당자에게 전달. 운영 진단 파일 오류 없음, 통합 재검사 필요 |
| `git diff --check` | PASS (Windows CRLF 안내 외 오류 없음) |

DB 계약은 합성 회원·Riot link·통계 이벤트·maintenance·현재/다른 알림 대상을 넣고 실제 SQL을 실행한다. 현재 scope/target만 집계, 다른 principal 인증 시각 제외, 최근 24시간 Riot FAILED/PARTIAL, 최신 probe, 개인정보와 자유 형식 필드 배제를 검사한다. query 기록은 파라미터를 저장하지 않고 read-only 트랜잭션과 고정 쿼리 수만 검사한다. 합성 fixture는 테스트 종료 시 삭제한다.

첫 DB 실행에서 raw aggregate timestamp가 Drizzle 컬럼의 Date 매핑과 달리 문자열인 문제를 재현했다. 명시적으로 ISO 변환한 뒤 동일 scope 재실행이 통과했다. 통과 당시 pg의 동일 connection 병렬 query 경고가 있어 이후 8개 SELECT는 순차 실행으로 정리했다. 이 순차 실행 정리는 통합 DB 검사에서 다시 확인해야 한다.

## 남은 확인

- 통합 build·전체 검사와 운영자 화면 실제 ADMIN/USER HTTP 경계, 390px/desktop 시각 QA.
- 실제 운영 기록은 배포 후 화면에서 확인. 통계 빈 queue cron heartbeat, Riot API 등급/전적 API권한/RSO 승인, 카카오 실기기 수신은 이 진단만으로 확인하지 않음.
- 운영자 화면 확인 기준이며 Discord/email 등 외부 경보 연결 없음.

## 통합 검증 확정

source `c3442ace1e04054ada05f1f6842f4699b45a0bb6`로 타입 오류를 수정한 뒤 전체 check·빌드, PG 142건(순차 조회 포함), 인증 HTTP, 105페이지·339화면 검사를 통과했다. 관리자 데스크톱·390px 대표 캡처를 눈으로 확인했고 운영 배포 `dpl_BdpAWrcHPKAchNU9K644dHfajNxu`를 08:41 KST 검증했다. 실제 운영 계정 로그인으로 열어 본 기록과 합성 화면 검사는 구분한다. [최종 통합 QA](../integrations-activation-v1.0.0-2026-09-22/README.md)를 따른다.

## 한국어 패치 공지

운영자 대시보드에서 경기 통계 대기·실패, 카카오 일일 마감, 이미지 저장소 검사, Riot 연동과 API 진단, 사이트 충원 카카오 알림 상태를 함께 확인할 수 있도록 준비했습니다. 기록이 없거나 실제 확인이 필요한 항목은 따로 안내합니다. 화면 새로고침으로 갱신되며 외부 알림이나 자동 재시도를 실행하지 않습니다. 현재는 소스·로컬 검증 단계입니다.

## 다음 확인 권장

1. 배포 후 실제 ADMIN 권한으로 5개 카드의 현재 기록과 접근 거부 경계를 확인한다.
2. Riot API probe와 사이트 알림 실기기 증거를 각각 확보하며 상태 조회 수락과 메시지 수신을 구분한다.
3. 통계 빈 queue cron 호출 자체를 운영상 추적해야 한다면 별도 heartbeat 보존 계약을 먼저 정한다.
