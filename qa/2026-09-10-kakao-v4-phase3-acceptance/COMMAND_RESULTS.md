# Kakao V4 Phase 3 acceptance baseline

## 1. 핵심 결론

- 기준 소스 `288d5a50c5236239613783ac2c9e9a667fdf9264`에서 Phase 3 자동 acceptance 계약을 추가했다.
- 기존 Phase 2 회귀 게이트는 **116 PASS / 0 FAIL**이다.
- 신규 Phase 3 서버 계약은 **2 PASS / 31 FAIL**, 클라이언트 단일 전송 계약은 **21 PASS / 0 FAIL**이다.
- 따라서 현재 소스는 Phase 2 회귀를 유지하지만 Phase 3 출시 기준은 충족하지 않는다. 신규 실패는 현재 의도적 501과 V1 응답 불일치를 가시화하는 출시 게이트다.

## 2. 확인된 사실과 미확인 사항

### 확인된 사실

- `FEATURES INHOUSE`, `SCRIM` 전체 양식, `FEATURES OPERATIONS` 명령은 classifier에서 인식되지만 대부분 canonical command로 변환되지 않는다. dispatcher가 연결된 실제 V4 경로에서는 `NOT_IMPLEMENTED`가 HTTP 501 `KAKAO_V4_COMMAND_ROUTER_NOT_ENABLED`로 변환된다.
- `스크림구인`은 501이 아니라 로컬 응답을 반환하지만 V1의 KST 운영일 대신 `운영일: 작성일`을 반환해 exact parity에 실패한다.
- 동일 `eventId`와 동일 본문의 replay 기반 계약, 동일 `eventId`의 본문 충돌 HTTP 409 `REPLAY_CONFLICT`, authorization 입력에서 room/sender role을 사용하지 않는 계약은 동작한다.
- Phase 3 대상 21개 대표 입력은 각 MessengerBot V4 entry에서 client-to-server `send`를 정확히 한 번 호출한다.
- 테스트·QA 문서 외 제품 코드, DB, secret, 배포 설정은 변경하지 않았다.

### 미확인 사항

- Android + MessengerBot R 실기기에서의 줄바꿈, 복사/붙여넣기, 재시도, 실제 카카오 callback 중복 동작은 실행 환경이 없어 확인하지 못했다.
- 실제 운영 DB에서 단일 활성 멸망전 자동 판별의 0건/2건 이상 응답과 트랜잭션 원자성은 확인하지 않았다.
- 실제 서버 로그의 command당 downstream mutation 1회와 운영 URL 응답은 배포하지 않았으므로 확인하지 않았다.

## 3. 우선순위별 문제 목록

### QA-P3-01 — FEATURES INHOUSE 경로 미구현

- 증상 또는 발견 내용: 종목 선택, 협곡/칼바람/증바람 생성 양식, 현황, 상세, 전체 snapshot이 자동 acceptance에서 실패한다. 대표 요청은 현재 501이다.
- 기대 동작: V1과 byte-for-byte 동일한 응답을 반환하고, 전체 양식은 누락 삭제·0명·A→B→A를 각각 authoritative revision으로 반영한다.
- 재현 조건: `npx tsx --test tests/kakao-v4-phase3-acceptance.test.ts` 실행 후 `P3-I01`~`P3-I08` 확인.
- 영향받는 사용자: FEATURES 봇을 사용하는 모든 일반 사용자.
- 영향 범위: 내전 모집 생성, 조회, 상세 편집, 참가자 snapshot 동기화.
- 확인 근거: `P3-I01`~`P3-I08` 8 FAIL. canonicalization 결과가 `null`이며 서비스 결과가 `NOT_IMPLEMENTED`다.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: 제품 미반영, acceptance만 추가.
- 제안하는 해결 방법: INHOUSE command canonicalization과 season/inhouse dispatcher adapter를 구현하고 V1 formatter를 fixture 기준으로 고정한다.
- 구현 난이도: 높음.
- 예상 효과: Phase 3 내전 핵심 흐름 복구와 V41 대체 가능성 확보.
- 부작용 및 위험: ARAM/증바람을 시즌 협곡 명단에 잘못 기록하거나, 빈 snapshot을 무시하면 기존 참가자가 남을 수 있다.
- 검증 방법: `P3-I01`~`P3-I08`, 동일 event replay, 실기기 A→B→A→0명 체크리스트를 모두 PASS로 전환한다.
- 성공 여부를 판단할 KPI: INHOUSE 501 비율 0%, V1 reply mismatch 0건, snapshot 1건당 mutation 1회, snapshot 이후 서버 명단 불일치 0건.

### QA-P3-02 — SCRIM 전체 양식 및 활성 대회 실패 계약 미구현

- 증상 또는 발견 내용: 신규·수정 전체 양식은 501이고, 활성 대회 0건/다건 실패가 `INVALID_FORM`으로 노출되지 않는다. 초기 양식의 운영일도 V1과 다르다.
- 기대 동작: KST 운영일이 포함된 V1 초기 양식, 신규/수정 각각 단일 mutation, 활성 대회 판별 불가 시 HTTP 400 `INVALID_FORM`.
- 재현 조건: 동일 자동 명령의 `P3-S01`~`P3-S05` 확인.
- 영향받는 사용자: RECRUIT 봇으로 멸망전 스크림을 등록·수정하는 일반 사용자.
- 영향 범위: 스크림 생성/수정 전체 양식과 멸망전 binding.
- 확인 근거: `P3-S01`은 `운영일: 작성일` 불일치, `P3-S02`~`P3-S05`는 501 또는 기대 오류 미발생으로 FAIL.
- 확신 수준: 확인. 단, 실제 DB의 활성 대회 데이터 상태는 미확인.
- 심각도: P1.
- 현재 상태: 제품 미반영, acceptance만 추가.
- 제안하는 해결 방법: SCRIM snapshot parser/canonicalizer를 연결하고, 신규일 때 활성 대회를 정확히 1건으로 판별하는 port를 추가한다. 수정은 기존 tournament binding을 보존한다.
- 구현 난이도: 높음.
- 예상 효과: 스크림 신규·수정의 V4 전환과 잘못된 대회 연결 방지.
- 부작용 및 위험: 날짜/시간 KST 변환, 자동배정 번호 경쟁, 기존 번호 수정 시 다른 대회로 재연결되는 위험.
- 검증 방법: `P3-S01`~`P3-S05`, 동시 생성, 0건/1건/2건 활성 대회 fixture, 실제 DB read-only 검증을 수행한다.
- 성공 여부를 판단할 KPI: SCRIM 501 비율 0%, 신규/수정 성공률, 잘못된 tournament binding 0건, command당 mutation 1회.

### QA-P3-03 — FEATURES OPERATIONS V1 경로 미구현

- 증상 또는 발견 내용: 운영 양식 4종 정상/누락, 등록센터·내전등록·경고등록·인증·경고현황·결과현황·사진취소·예약공지 응답이 501이다.
- 기대 동작: 정상 양식은 server reply를 정확히 한 번 전달하고, 필수값 누락은 누락 필드를 V1 순서로 안내하면서 mutation을 호출하지 않는다. 관리 안내 명령은 V1 exact reply를 반환한다.
- 재현 조건: `P3-O01`~`P3-O08`, `P3-M01`~`P3-M08` 확인.
- 영향받는 사용자: FEATURES 봇을 사용하는 모든 일반 사용자. 웹 관리자 작업 자체는 링크 이동 후 별도 권한 검사를 받는다.
- 영향 범위: 운영 접수 양식, 결과/경고/사진 관련 안내, 공지 미리보기.
- 확인 근거: 해당 16개 acceptance 모두 현재 FAIL.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: 제품 미반영, acceptance만 추가.
- 제안하는 해결 방법: operation form parser와 operation/notice port를 canonical dispatcher에 연결하고, 정적 안내는 V1 fixture를 단일 source of truth로 사용한다.
- 구현 난이도: 중간~높음.
- 예상 효과: 기존 V41 운영 명령의 V4 전환 및 누락 양식의 안전한 차단.
- 부작용 및 위험: `사진취소`의 V1 공개 별칭과 내부 `V2사진취소`를 혼합하면 세션 삭제 범위가 달라질 수 있다. 예약공지는 미리보기만 제공하고 자동 발송으로 과장하지 않아야 한다.
- 검증 방법: `P3-O*`, `P3-M*`, mutation call count, 봇 echo 무시, 실기기 링크/줄바꿈 확인.
- 성공 여부를 판단할 KPI: OPERATIONS 501 비율 0%, 필수값 누락의 오접수 0건, reply mismatch 0건, operation form 중복 접수율 0%.

### QA-P3-04 — Phase 3 성공 replay를 검증할 구현 경로 없음

- 증상 또는 발견 내용: 충돌 409는 PASS지만 Phase 3 mutation 자체가 501이라 성공 결과의 동일 event replay는 FAIL이다.
- 기대 동작: 첫 요청만 dispatch하고 동일 eventId+동일 본문은 같은 reply를 `replayed=true`로 반환한다. 동일 eventId+다른 본문은 409 `REPLAY_CONFLICT`다.
- 재현 조건: `P3-R01` FAIL, `P3-R02` PASS.
- 영향받는 사용자: 느린 네트워크나 MessengerBot 재시도로 중복 callback이 발생한 사용자.
- 영향 범위: 내전 snapshot과 운영 양식 등 모든 Phase 3 mutation.
- 확인 근거: 자동 test output.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: 공통 receipt/409 기반은 반영됐으나 Phase 3 성공 경로는 미반영.
- 제안하는 해결 방법: Phase 3 dispatcher를 기존 service receipt 경계 안에서 호출하고 별도 eventId를 생성하지 않는다.
- 구현 난이도: 중간.
- 예상 효과: 재시도 시 중복 명단/접수 방지.
- 부작용 및 위험: process-local receipt만 의존하면 재기동/다중 인스턴스에서 중복 방지가 약해질 수 있다.
- 검증 방법: `P3-R01`, `P3-R02`, DB durable idempotency 테스트, 재기동/동시 요청 테스트.
- 성공 여부를 판단할 KPI: 동일 event duplicate mutation 0건, conflict 409 정확도 100%, replay 응답 불일치 0건.

## 4. 개선안과 예상 효과

1. INHOUSE canonical/dispatcher를 먼저 연결해 P3-I와 P3-R01을 함께 해소한다.
2. SCRIM 신규의 활성 대회 0/1/2건 계약과 기존 번호 binding 보존을 port 수준에서 명시한다.
3. 운영 양식은 V1 parser의 필드명·누락 순서·server reply pass-through를 그대로 사용한다.
4. 정적 관리 안내와 예약공지 formatter는 fixture/golden을 공유해 문구 drift를 막는다.
5. process-local receipt 외에 DB idempotency 결과를 end-to-end로 확인해 다중 인스턴스 위험을 제거한다.

예상 효과는 Phase 3 대상의 501 제거, 중복 mutation 방지, V1 사용자의 메시지/양식 호환성 유지다.

## 5. 테스트 또는 검증 결과

| 구분 | 명령 | 결과 |
|---|---|---:|
| Phase 2 회귀 게이트 | 아래 8개 기존 suite | 116 PASS / 0 FAIL |
| Phase 3 서버 acceptance | `npx tsx --test tests/kakao-v4-phase3-acceptance.test.ts` | 2 PASS / 31 FAIL |
| Phase 3 client single-send | `node --test tests/kakao-v4-phase3-client-acceptance.test.mjs` | 21 PASS / 0 FAIL |
| 정적 검사 | `npx eslint ...` | PASS |
| 타입 검사 | `npx tsc --noEmit` | PASS |
| 실기기 | Android/MessengerBot R 환경 없음 | BLOCKED |

Phase 2 116개 회귀 명령:

```text
node --test tests/kakao-v4-artifact-acceptance.test.mjs tests/kakao-v4-client-acceptance.test.mjs tests/kakao-v40-exact-reply-parity.test.mjs tests/kakao-v40-scrim-exact-parity.golden.test.mjs tests/kakao-v40-misc-command-parity.test.mjs tests/kakao-v41-v1-inhouse-golden.test.mjs tests/kakao-v41-v1-compat.test.mjs tests/kakao-v41-v1-router-integration.test.mjs
npx tsx --test tests/kakao-v4-server-acceptance.test.ts tests/kakao-v4-command-classifier.test.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-dispatcher.test.ts
```

## 6. 소스 반영 여부

- 테스트 소스와 QA 문서만 반영했다.
- 제품 소스는 변경하지 않았다.

## 7. 빌드 성공 여부

- **NOT TESTED**. 제품 코드와 빌드 산출물을 변경하지 않는 QA 전용 작업이므로 `npm run build`는 실행하지 않았다.
- TypeScript typecheck와 대상 ESLint는 PASS다.

## 8. 운영 반영 여부

- **미반영**. push, deploy, 운영 DB, secret 변경을 수행하지 않았다.

## 9. 남아 있는 위험

- Phase 3 대상 31개 서버 계약이 실패하므로 현재 V4로 V41을 대체하면 주요 흐름이 차단된다.
- 활성 대회 판별과 authoritative deletion은 실제 DB fixture가 없어 제품 구현 후 DB 계약 테스트가 추가로 필요하다.
- 실기기에서 callback replay와 줄바꿈 보존이 확인되지 않았다.
- process-local receipt의 재기동/다중 인스턴스 내구성은 이 계약만으로 보장되지 않는다.

## 10. 다음 패치 추천

1. FEATURES INHOUSE create/status/detail/snapshot canonicalization 및 dispatcher 연결.
2. SCRIM full-form parser, active tournament 0/1/2건 판별, 기존 binding 보존.
3. OPERATIONS 4종 parser/port와 누락 필드 exact reply 연결.
4. 관리 안내 7종과 예약공지 V1 formatter 연결.
5. Phase 3 mutation의 durable idempotency와 실기기 retry 검증.

## 11. 디스코드 공지

- `DISCORD_NOTICE.md`에 복사 가능한 공지를 제공한다.

## 12. QA 증거 위치

- 자동 acceptance: `tests/kakao-v4-phase3-acceptance.test.ts`
- client single-send: `tests/kakao-v4-phase3-client-acceptance.test.mjs`
- 상세 매트릭스/501 범위: `qa/2026-09-10-kakao-v4-phase3-acceptance/ACCEPTANCE_MATRIX.md`
- 실기기 재검증: `qa/2026-09-10-kakao-v4-phase3-acceptance/REAL_DEVICE_CHECKLIST.md`
- 공지: `qa/2026-09-10-kakao-v4-phase3-acceptance/DISCORD_NOTICE.md`
