# Kakao V4 Phase 4 acceptance matrix

## 자동화 매트릭스

| ID | 계약 | 실행 단위 | Baseline | 근거 |
|---|---|---:|---:|---|
| P4-S01 | V1 PUBLIC alias actual profile, plain/slash parity, 501 0건 | 186 | FAIL | 178 충족, 웹도우미 4 alias×2가 501 |
| P4-S02 | 반대 profile 403 `WRONG_PROFILE` | 89 | PASS | 89/89 |
| P4-S03 | authorization에 room/sender role/allowlist 미사용 | 2 | PASS | installation/profile/key만 전달 |
| P4-S04 | unknown 무전송 또는 `INVALID_FORM` | 3 | FAIL | 3/3 `ROUTER_NOT_ENABLED` |
| P4-S05 | 사진상태의 보수적 사이트 안내 | 1 | FAIL | 501 |
| P4-S06~S07 | 내전 확인/미리보기 취소 no-mutation 폐기 안내 | 2 | FAIL | 2/2 501 |
| P4-C01~C03 | bot version 2종, RECRUIT 도움말 client-only | 6 plain/slash | PASS | 0 send, 내용 일치 |
| P4-C04 | FEATURES 도움말 client-only V1 내용 | 2 | FAIL | 0 send이나 문구 불일치 |
| P4-C05~C06 | 구인도움말/웹도우미 client-only | 4 | FAIL | 각각 send 1회 |
| P4-C07 | 모든 PUBLIC alias phone send ≤1 | 186 | PASS | 186/186 |
| P4-C08 | malformed/URL/중간 slash 무전송 | 22 | PASS | 22/22 |
| P4-I01~I09 | INTERNAL/raw V2 public transport 차단 | 18 | FAIL | 18/18 send 1회 |
| P4-A01 | 생성물 동기화, <40k, ES5, Rhino, timeout | 봇 2종 | PASS | RECRUIT 8,700자, FEATURES 8,829자 |

## PUBLIC alias profile 기준

| Fixture domain/action | 실제 허용 profile | alias 수 | Baseline |
|---|---|---:|---|
| HELP / GENERAL_HELP | RECRUIT, FEATURES | 2 | PASS, 별도 FEATURES 내용 FAIL |
| HELP / RECRUIT_HELP | RECRUIT | 3 | PASS, 별도 client-only FAIL |
| HELP / RECRUIT_WEB_HELP | RECRUIT | 4 | FAIL: 501 |
| PARTY 전체 | RECRUIT | 28 | PASS |
| INHOUSE 전체 | FEATURES | 15 | PASS |
| SCRIM 전체 | RECRUIT | 23 | PASS |
| PLAYER 전체 | FEATURES | 3 | PASS |
| REGISTRATION 전체 | FEATURES | 13 | PASS |
| 합계 | 실제 profile 조합 93개 | fixture alias 91개 | plain/slash 186회 |

## LOCAL client-only 계약

| 명령 | Profile | 기대 내용 | Baseline |
|---|---|---|---|
| 봇버전 | RECRUIT/FEATURES | profile·버전·익명 installation ID | PASS |
| 도움말 | RECRUIT | V1 recruitHelp exact | PASS |
| 도움말 | FEATURES | V1 generalHelp exact | FAIL |
| 구인도움말 | RECRUIT | V1 recruitHelp exact, 0 send | FAIL |
| 구인웹도우미 | RECRUIT | V1 recruitWebHelp exact, 0 send | FAIL |

## INTERNAL/raw V2 차단 목록

`V2도움말`, `V2진단`, `V2연동확인`, `연동확인`, `V2모집 JSON`, `V2시즌 JSON`, `V2양식 JSON`, `V2사진세션 UUID`, `V2사진취소`를 plain/slash로 실행한다. 현재 18건 모두 public transport 진입으로 FAIL이다.

## 산출물 품질

| 산출물 | 문자 수 | ES5 parse | Rhino 후보 | timeout | 동기화 |
|---|---:|---:|---:|---:|---:|
| RECRUIT MessengerBot R | 8,700 | PASS | 0 | 5,000ms | PASS |
| FEATURES MessengerBot R | 8,829 | PASS | 0 | 5,000ms | PASS |

## 회귀 명령

Phase 2 — 116개:

```text
node --test tests/kakao-v4-artifact-acceptance.test.mjs tests/kakao-v4-client-acceptance.test.mjs tests/kakao-v40-exact-reply-parity.test.mjs tests/kakao-v40-scrim-exact-parity.golden.test.mjs tests/kakao-v40-misc-command-parity.test.mjs tests/kakao-v41-v1-inhouse-golden.test.mjs tests/kakao-v41-v1-compat.test.mjs tests/kakao-v41-v1-router-integration.test.mjs
npx tsx --test tests/kakao-v4-server-acceptance.test.ts tests/kakao-v4-command-classifier.test.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-dispatcher.test.ts
```

Phase 3 — 70개:

```text
node --test tests/kakao-v4-phase3-client-acceptance.test.mjs
npx tsx --test tests/kakao-v4-phase3-acceptance.test.ts tests/kakao-v4-phase3-inhouse-scrim.test.ts tests/kakao-v4-phase3-operations.test.ts
```

V1 fixture — 12개:

```text
node --test tests/kakao-v4-v1-compatibility-contract.test.mjs
```

Phase 4 baseline:

```text
npx tsx --test tests/kakao-v4-phase4-public-alias-acceptance.test.ts
node --test tests/kakao-v4-phase4-client-closure.test.mjs
```

## 환경 판정

| 환경 | 판정 |
|---|---|
| Windows Node/TypeScript VM | PASS/FAIL 위 매트릭스 참조 |
| Android + MessengerBot R | BLOCKED |
| 운영 API/DB | NOT TESTED |
| 웹 화면 크기·WCAG 2.2 AA | NOT APPLICABLE — bot protocol QA이며 웹 UI 변경 없음 |

## 출시 판정과 KPI

- 출시 차단: P4-S01, S04~S07, C04~C06, I01~I09.
- 출시 후 개선: 없음. 모두 Phase 4 명시 계약이다.
- 목표 KPI: PUBLIC 501 0%, PUBLIC slash mismatch 0건, wrong-profile 403 정확도 100%, INTERNAL transport 0건, command당 client send 최대 1회 100%, Rhino 후보 0, bot size 40k 미만.
- 운영 이벤트에는 command category/profile/result code/send attempt/replayed만 저장하고 원문·표시명·secret은 저장하지 않는다.
