# Kakao V4 acceptance 자동 실행 결과

실행일: 2026-09-10 KST

기준 commit: `42b77971851d3b94fe4c0cb0879100ff19f1d791`

## 요약

| 묶음 | PASS | FAIL | 합계 |
| --- | ---: | ---: | ---: |
| artifact acceptance | 5 | 0 | 5 |
| client acceptance | 3 | 9 | 12 |
| server acceptance | 4 | 11 | 15 |
| 신규 acceptance 합계 | 12 | 20 | 32 |
| 기존 V1 골든 회귀 | 57 | 0 | 57 |

## 신규 acceptance 상세

| ID | 결과 | 확인 내용 또는 실제 실패 |
| --- | --- | --- |
| A01 | PASS | RECRUIT/FEATURES 단일 파일, 40,000자 이하, 199줄, ES5 parse |
| A02 | PASS | 두 파일 Rhino 정적 경고 후보 0 |
| A03 | PASS | 정적 profile ID가 각 파일에 1개 |
| A04 | PASS | response body의 room/channel/group read 0, 금지 header 전송 0 |
| A05 | PASS | text timeout 5,000ms |
| C01 | PASS | callback room/channel 값을 바꿔도 정적 profile 전송 |
| C02 | FAIL | RECRUIT에서 FEATURES 명령 server call actual 4, expected 0 |
| C03 | FAIL | FEATURES에서 RECRUIT 명령 server call actual 4, expected 0 |
| C04 | FAIL | 부정 slash/URL 6개가 client transport로 전달됨 |
| C05 | PASS | 무 logId 호출 3회의 event ID가 boot counter 1·2·3으로 서로 다름 |
| C06 | FAIL | network retry 경로가 없어 동일 event ID 재사용을 실행할 수 없음 |
| C07 | PASS | 스크림 명령의 client send 구조는 1회. 서버 성공은 S06 FAIL |
| C08:WRONG_PROFILE | FAIL | client 분기 없음 |
| C08:INVALID_SIGNATURE | FAIL | client 분기 없음 |
| C08:REPLAY_CONFLICT | FAIL | client 분기 없음 |
| C08:SERVER_UNAVAILABLE | FAIL | client 분기 없음 |
| C08:INVALID_FORM | FAIL | client 분기 없음 |
| S01 | PASS | V1 fixture 전체 alias의 slash 0/1 canonical 동등 |
| S02 | FAIL | URL·중간 slash를 canonical 단계에서 null로 거부하지 않음 |
| S03 | FAIL | 교차 사용자 모집 3단계 actual `NOT_IMPLEMENTED` |
| S04 | FAIL | A→B→A→ZERO 4단계 actual `NOT_IMPLEMENTED` |
| S05 | FAIL | 랭킹·전적·최근 actual `NOT_IMPLEMENTED` |
| S06 | FAIL | 스크림 actual `NOT_IMPLEMENTED` |
| S07 | FAIL | mutation command actual `NOT_IMPLEMENTED`; mutation 1회 적용을 입증하지 못함 |
| S08 | FAIL | HTTP 409이나 public code actual `IDEMPOTENCY_MISMATCH`, expected `REPLAY_CONFLICT` |
| S09:NORMAL | PASS | `V4상태` 정상 reply |
| S09:WRONG_PROFILE | FAIL | public code 부재 |
| S09:INVALID_SIGNATURE | PASS | HTTP 401, exact public code 확인 |
| S09:REPLAY_CONFLICT | FAIL | actual `IDEMPOTENCY_MISMATCH` |
| S09:SERVER_UNAVAILABLE | FAIL | actual `KAKAO_V4_UNAVAILABLE` |
| S09:INVALID_FORM | FAIL | public code 부재 |
| S10 | PASS | V1 골든 회귀 inventory 6개 존재 |

## 실행 명령

```powershell
node --test tests/kakao-v4-artifact-acceptance.test.mjs
node --test tests/kakao-v4-client-acceptance.test.mjs
npx tsx --test tests/kakao-v4-server-acceptance.test.ts
```

첫 명령은 exit 0, 나머지 두 명령은 의도된 수용 실패로 exit 1이다.

기존 V1 골든 실행:

```powershell
node --test tests/kakao-v40-exact-reply-parity.test.mjs tests/kakao-v40-scrim-exact-parity.golden.test.mjs tests/kakao-v40-misc-command-parity.test.mjs tests/kakao-v41-v1-inhouse-golden.test.mjs tests/kakao-v41-v1-compat.test.mjs tests/kakao-v41-v1-router-integration.test.mjs
```

결과: 57 PASS, 0 FAIL, exit 0.

추가 정적 검사:

```powershell
npm run typecheck
npx eslint tests/kakao-v4-artifact-acceptance.test.mjs tests/kakao-v4-client-acceptance.test.mjs tests/kakao-v4-server-acceptance.test.ts
```

결과: TypeScript 오류 0, ESLint 오류·경고 0.

## artifact 측정

| profile | version | LF 문자 | CRLF 문자 | 줄 수 | Rhino 후보 | public SHA-256 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| RECRUIT | `KLOL_KAKAO_BOT_V4_RECRUIT_2026_09_10_R1` | 7,447 | 7,645 | 199 | 0 | `a5e6d095d5d4c2a8ac207f04124ded1724afdd528f52ed88ded35e07675b059e` |
| FEATURES | `KLOL_KAKAO_BOT_V4_FEATURES_2026_09_10_R1` | 7,450 | 7,648 | 199 | 0 | `1b0c99af40d409dd8c32f25bf0911de0c4a81b9bc77dd68a4196584c37bac38d` |

SHA-256은 `EVIDENCE_STRUCTURE.md`의 실제 실행 폴더 manifest에 기록한다. 공개 Git artifact의 hash만 허용하며 private 설정 포함 파일의 원문·secret은 QA 문서에 넣지 않는다.

## 해석 제한

- A01/A02는 실제 MessengerBot R 컴파일이 아니다.
- C07은 client 호출 수만 확인하며 server가 501이므로 스크림 기능 PASS가 아니다.
- S10은 inventory 확인이고, 실제 57개 골든 실행 결과를 별도 명령으로 보완했다.
- 실기기와 staging API는 실행하지 않았다.
