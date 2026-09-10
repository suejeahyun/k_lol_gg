# Kakao V4 Phase 4 acceptance baseline

## 1. 핵심 결론

- 기준 소스 `924ebd187c0064274a403414881fbf7cd4a3b362`에 Phase 4 자동 acceptance 계약을 추가했다.
- 신규 Phase 4 계약은 **8 PASS / 17 FAIL**이다. 현재 제품은 Phase 4 출시 기준을 충족하지 않는다.
- 기존 Phase 2 **116/116 PASS**, Phase 3 **70/70 PASS**, V1 fixture contract **12/12 PASS**를 유지한다.
- 최종 휴대폰 봇 2종은 40k 미만, ES5 parse, Rhino warning 후보 0, timeout 5초 이하, 생성물 동기화 조건을 통과했다.

## 2. 확인된 사실과 미확인 사항

### 확인된 사실

- V1 fixture PUBLIC alias 91개를 실제 허용 profile로 plain/slash 실행한 186건 중 178건은 성공했다.
- `구인도우미`, `구인웹도우미`, `구인매뉴얼`, `명령어페이지`의 plain/slash 8건은 `NOT_IMPLEMENTED`이며 실제 HTTP 경로에서는 501 `KAKAO_V4_COMMAND_ROUTER_NOT_ENABLED`다.
- 단일 profile PUBLIC alias 89개는 반대 profile에서 모두 HTTP 403 `WRONG_PROFILE`로 정규화된다.
- 임의 unknown 3종은 `INVALID_FORM`이 아니라 501 경로에 남아 있다.
- malformed slash/URL/중간 slash 22건은 휴대폰에서 서버 전송 없이 무시된다.
- 로컬 `봇버전` 2개 profile과 RECRUIT `도움말`은 client-only로 정상 동작한다.
- FEATURES `도움말`은 V1 일반 도움말 대신 오래된 “라우터 연결 후 제공” 문구를 표시한다.
- RECRUIT `구인도움말`, `구인웹도우미`는 client-only가 아니라 서버로 1회 전송된다.
- INTERNAL/raw V2 대표 9종은 plain/slash 모두 public V4 transport에 진입한다. 현재 canonical dispatcher는 이를 mutation으로 연결하지 않지만 client boundary 계약에는 실패한다.
- `사진상태`, `내전미리보기취소`, `내전확인 CODE`는 현재 501이다.
- authorization port 입력에는 room, sender, role, member, allowlist가 없다. 휴대폰 callback의 room/channel도 전송되지 않는다. 익명 senderId는 envelope 식별자로만 유지된다.

### 미확인 사항

- Android/MessengerBot R 실기기에서 Rhino compile, 응답 줄바꿈, 실제 timeout/retry를 실행하지 못했다.
- 운영 API, 운영 DB, 실제 카카오 방 로그를 확인하지 않았다.
- 제품 구현 후 unknown/INTERNAL 명령의 운영 로그 비노출 여부는 미확인이다.

## 3. 우선순위별 문제 목록

### QA-P4-01 — PUBLIC 웹도우미 alias와 unknown이 501에 남음

- 증상 또는 발견 내용: 웹도우미 alias 4개가 plain/slash 모두 501이고 unknown 3종도 501이다.
- 기대 동작: 모든 V1 PUBLIC alias의 501/ROUTER_NOT_ENABLED 0건. unknown은 휴대폰 무전송 또는 HTTP 400 `INVALID_FORM`.
- 재현 조건: `P4-S01`, `P4-S04` 실행.
- 영향받는 사용자: RECRUIT 봇 도움말 사용자와 오타/미지원 명령 사용자.
- 영향 범위: 186 PUBLIC 실행 중 8건과 unknown 처리.
- 확인 근거: 자동 acceptance 실패 목록.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: 제품 미반영, QA 계약만 추가.
- 제안하는 해결 방법: 웹도우미 alias를 client local exact reply로 닫고 server unknown을 `INVALID_FORM`으로 정규화한다.
- 구현 난이도: 낮음~중간.
- 예상 효과: V1 공개 명령의 501 제거와 예측 가능한 오류 복구.
- 부작용 및 위험: unknown을 모두 응답하면 일반 대화에 봇이 반응할 수 있으므로 휴대폰 allowlist 우선 차단이 필요하다.
- 검증 방법: `P4-S01`, `P4-S04`, `P4-C06` PASS 및 실기기 일반 대화 무응답 확인.
- 성공 KPI: PUBLIC 501율 0%, unknown 501율 0%, 일반 대화 오탐 응답률 0%.

### QA-P4-02 — INTERNAL/raw V2가 public transport에 진입

- 증상 또는 발견 내용: V2 도움말·진단·연동·raw 모집/시즌/양식/사진 명령 9종의 plain/slash 18건이 모두 HTTP send를 수행한다.
- 기대 동작: INTERNAL/raw V2는 public V4 transport에 진입하지 않는다.
- 재현 조건: `P4-I01`~`P4-I09`.
- 영향받는 사용자: 일반 카카오 방 사용자와 운영자.
- 영향 범위: V4 휴대폰 entry의 사전 라우팅 경계.
- 확인 근거: 각 케이스 `send=1`.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: 서버 canonical mutation은 fail-closed이나 client 전송 차단은 미반영.
- 제안하는 해결 방법: 두 entry의 공통 명시적 INTERNAL prefix/명령 denylist를 local 처리 전에 적용한다.
- 구현 난이도: 낮음.
- 예상 효과: 공개 endpoint 노출·불필요 요청·혼동 감소.
- 부작용 및 위험: `V4상태`, `V4계약확인`, `봇버전`까지 과도하게 차단하지 않도록 V2 목록을 명시해야 한다.
- 검증 방법: P4-I 전부 0 send, V4 상태/계약 smoke 유지.
- 성공 KPI: INTERNAL public send 0건, 공개 endpoint의 raw V2 category 0건.

### QA-P4-03 — client-only 도움말 계약 불완전

- 증상 또는 발견 내용: FEATURES 도움말 내용이 V1과 다르고 RECRUIT 구인도움말/웹도우미가 서버를 호출한다.
- 기대 동작: 봇버전·도움말·구인도움말·구인웹도우미는 client-only 0 send이며 V1 fixture 내용을 반환한다.
- 재현 조건: `P4-C04`~`P4-C06`.
- 영향받는 사용자: 두 봇의 도움말 사용자.
- 영향 범위: 로컬 정적 명령과 장애 시 사용 가능한 안내.
- 확인 근거: exact reply diff와 send count.
- 확신 수준: 확인.
- 심각도: P2.
- 현재 상태: 봇버전과 RECRUIT 도움말만 충족.
- 제안하는 해결 방법: shared localReply에 profile별 V1 exact constants와 recruit help/web alias를 추가한다.
- 구현 난이도: 낮음.
- 예상 효과: 서버 장애 중에도 정확한 명령 안내 제공, 요청량 감소.
- 부작용 및 위험: fixture와 휴대폰 상수의 문구 drift.
- 검증 방법: P4-C01~C06 exact match, 생성물 동기화 검증.
- 성공 KPI: local help server send 0%, exact reply mismatch 0건.

### QA-P4-04 — 사진상태와 내전 미리보기 폐기 안내 미구현

- 증상 또는 발견 내용: 세 명령 모두 501이다.
- 기대 동작: 사진상태는 실제 세션이 있다고 단정하지 않고 사이트 확인 링크를 제공한다. 확인/취소는 mutation 없이 “사이트에 반영하지 않음”을 명시한다.
- 재현 조건: `P4-S05`~`P4-S07`.
- 영향받는 사용자: 사진 제출 또는 구형 내전 미리보기 명령을 사용하는 사용자.
- 영향 범위: 안전한 상태 안내와 V41 잔여 명령 폐기.
- 확인 근거: 서비스 결과 `NOT_IMPLEMENTED`.
- 확신 수준: 확인.
- 심각도: P2.
- 현재 상태: 제품 미반영.
- 제안하는 해결 방법: server mutation을 호출하지 않는 deterministic local reply로 명시적으로 종료한다.
- 구현 난이도: 낮음.
- 예상 효과: 존재하지 않는 휴대폰 세션을 정상으로 오해하지 않고 구형 확인 흐름의 이중 반영을 방지한다.
- 부작용 및 위험: 실제 세션 조회처럼 보이는 표현 금지, 사진취소 V1 공개 alias와 혼합 금지.
- 검증 방법: P4-S05~S07에서 reply 의미와 dispatcher 0회를 함께 확인한다.
- 성공 KPI: 해당 명령 501율 0%, mutation 0건, 잘못된 세션 정상 안내 0건.

## 4. 개선안과 예상 효과

1. client local help/web constants 및 alias를 V1 fixture와 동기화한다.
2. entry allowlist에서 INTERNAL/raw V2를 전송 전에 차단한다.
3. 공개 unknown은 휴대폰 무전송을 우선하고 서버 직접 요청은 `INVALID_FORM`으로 정규화한다.
4. 사진상태·미리보기 확인/취소를 명시적 무변경 안내로 종료한다.
5. 변경 후 생성 봇 2종을 다시 만들고 Phase 2/3/V1 전체 회귀를 재실행한다.

## 5. 테스트 또는 검증 결과

| 검증 | 결과 |
|---|---:|
| Phase 4 server/public acceptance | 2 PASS / 5 FAIL |
| Phase 4 phone/client closure | 6 PASS / 12 FAIL |
| Phase 4 합계 | 8 PASS / 17 FAIL |
| Phase 2 회귀 | 116 PASS / 0 FAIL |
| Phase 3 회귀 | 70 PASS / 0 FAIL |
| V1 fixture contract | 12 PASS / 0 FAIL |
| 대상 ESLint | PASS |
| TypeScript typecheck | PASS |
| 실기기 | BLOCKED |

세부 실행 명령은 `ACCEPTANCE_MATRIX.md`에 기록했다.

## 6. 소스 반영 여부

- 테스트 소스와 QA 문서만 반영했다.
- 제품 소스와 생성 봇은 변경하지 않았다.

## 7. 빌드 성공 여부

- 애플리케이션 빌드: **NOT TESTED**. QA 전용 범위이며 제품 산출물을 만들지 않았다.
- 현재 생성 봇 동기화/ES5 parse: PASS.

## 8. 운영 반영 여부

- **미반영**. push, deploy, DB, secret 변경 없음.

## 9. 남아 있는 위험

- Phase 4 서버 5개·클라이언트 12개 계약이 실패한다.
- INTERNAL 요청은 mutation까지 도달하지 않지만 public endpoint 트래픽과 로그를 만들 수 있다.
- 실기기 Rhino와 실제 네트워크 retry는 미검증이다.

## 10. 다음 패치 추천

1. local help/web alias exact reply 패치.
2. INTERNAL/raw V2 pre-transport denylist 패치.
3. unknown `INVALID_FORM` 및 일반 대화 무응답 경계 패치.
4. 사진상태·내전확인·미리보기취소 no-mutation 안내 패치.
5. 생성 봇 재생성 후 Phase 2/3/V1/Phase 4 전체 재검증.

## 11. 디스코드 공지

- `DISCORD_NOTICE.md`에 복사 가능한 공지를 제공한다.

## 12. QA 증거 위치

- `tests/kakao-v4-phase4-public-alias-acceptance.test.ts`
- `tests/kakao-v4-phase4-client-closure.test.mjs`
- `qa/2026-09-10-kakao-v4-phase4-acceptance/ACCEPTANCE_MATRIX.md`
- `qa/2026-09-10-kakao-v4-phase4-acceptance/REAL_DEVICE_CHECKLIST.md`
- `qa/2026-09-10-kakao-v4-phase4-acceptance/DISCORD_NOTICE.md`
