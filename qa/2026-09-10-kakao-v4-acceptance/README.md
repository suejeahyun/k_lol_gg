# Kakao V4 독립 QA·실기기 수용 패키지

검증일: 2026-09-10 KST

기준 commit: `42b77971851d3b94fe4c0cb0879100ff19f1d791`

브랜치: `test/kakao-v4-acceptance-20260910`

## 1. 핵심 결론

- 현재 V4 출시는 **차단(HOLD)** 판정이다.
- 새 acceptance 자동 테스트 32개 중 12개 PASS, 20개 FAIL이다. 실패 테스트는 삭제·완화하지 않았다.
- 기존 V1 골든 회귀 57개는 전부 PASS했다. 이는 기존 V1 기준 보존 증거이며 V4 전체 기능 수용을 뜻하지 않는다.
- 두 휴대폰 봇·두 일반 사용자·두 카카오방 실테스트는 실행 환경과 설치본 인계가 없어 전부 `NOT TESTED`다.
- 제품 코드, DB, 운영 설정, 배포는 변경하지 않았다. 이 브랜치에서는 `tests/`와 `qa/`만 변경했다.

## 2. 판정 규칙

| 판정 | 적용 기준 |
| --- | --- |
| PASS | 실제 자동 실행 또는 실기기 증거가 합격 기준을 충족 |
| FAIL | 재현 가능한 기준 위반이 있음 |
| BLOCKED | 필요한 환경·권한·artifact가 없어 실행 불가 |
| NOT TESTED | 실행 증거가 아직 없음 |
| NOT APPLICABLE | 해당 항목에 적용되지 않으며 사유가 있음 |

정적 구조만 확인한 항목은 기능 성공으로 확대 해석하지 않는다. 예를 들어 스크림 client send 1회는 PASS지만 서버가 501이므로 스크림 전체 수용은 FAIL이다.

## 3. 환경과 확인 근거

- Node.js: v24.14.1
- worktree 로컬 의존성: `npm ci --ignore-scripts --no-audit --no-fund`, 652 packages, lockfile 변경 없음
- RECRUIT 최종 파일: LF 7,447자 / CRLF 7,645자 / 199줄
- FEATURES 최종 파일: LF 7,450자 / CRLF 7,648자 / 199줄
- 두 파일 모두 ES5 parse 및 Rhino 정적 warning candidate 0
- 실제 Rhino jar 및 실제 MessengerBot R 컴파일: `NOT TESTED`
- 세부 명령·결과: `AUTOMATED_RESULTS.md`

## 4. 수용 매트릭스

| ID | 우선순위 | 계약 | 자동 결과 | 수동 결과 | 출시 판정 |
| --- | --- | --- | --- | --- | --- |
| G01 | P1 | 읽기 쉬운 ES5 단일 파일, 각 40,000자 이하 | PASS | MessengerBot R compile NOT TESTED | HOLD |
| G02 | P1 | `CODE HAS NO SIDE EFFECTS` 등 Rhino 후보 0 | PASS | 실제 앱 경고 0 NOT TESTED | HOLD |
| G03 | P1 | room/channel/roomName/x-klol-room 의존·전송 0 | PASS | server envelope 확인 NOT TESTED | HOLD |
| G04 | P1 | 정적 RECRUIT/FEATURES, 교차 profile 로컬 무응답 | 정적 profile PASS / 교차 명령 FAIL | NOT TESTED | FAIL |
| G05 | P1 | 선행 slash 0/1 동등, `//`·URL·중간 slash 부정 | 동등 PASS / client·server 부정 FAIL | NOT TESTED | FAIL |
| G06 | P1 | 두 일반 사용자 교차 수정·타 사용자 마감 | FAIL: dispatcher 501 | NOT TESTED | FAIL |
| G07 | P1 | 이름 삭제·0명 snapshot·A→B→A | FAIL: dispatcher 501 | NOT TESTED | FAIL |
| G08 | P1 | 무 logId 독립 명령은 다른 eventId, retry는 같은 eventId | 독립 eventId PASS / retry FAIL | NOT TESTED | FAIL |
| G09 | P1 | 동일 callback mutation 1회, body conflict 409 | mutation FAIL / 409 status PASS / public code FAIL | NOT TESTED | FAIL |
| G10 | P1 | FEATURES 랭킹·전적·최근 성공 | FAIL: 세 명령 모두 501 | NOT TESTED | FAIL |
| G11 | P1 | 오류 6종 정상·구분 | server 정상·INVALID_SIGNATURE PASS / 나머지 및 client taxonomy FAIL | NOT TESTED | FAIL |
| G12 | P1 | text timeout ≤5초, 스크림 왕복 1회 | timeout PASS / client 1회 PASS / server 성공 FAIL | NOT TESTED | FAIL |
| G13 | P1 | 기존 V1 골든 회귀 | PASS: 57/57 | 대표 실기기 회귀 NOT TESTED | HOLD |
| G14 | P1 | 휴대폰 두 봇·두 사용자·두 방 | 자동 대상 아님 | NOT TESTED | HOLD |

G01~G14가 모두 PASS가 되기 전에는 출시 승인으로 바꾸지 않는다.

## 5. 확인된 사실과 미확인 사항

### 확인된 사실

- 두 generated artifact는 40,000자보다 충분히 작고 ES5 정적 검사에서 경고 후보가 없다.
- `response()` 본문은 callback `room`, `channelId`, `isGroupChat`을 읽지 않으며 금지 identity header를 전송하지 않는다.
- 두 entry는 각각 정적 `RECRUIT`, `FEATURES` profile을 전송한다.
- 무 `logId`의 연속 독립 호출은 boot ID + 증가 counter로 서로 다른 event ID를 만든다.
- 현재 client는 profile별 command allowlist가 없어 교차 명령과 잘못된 slash도 서버로 전송한다.
- 현재 client에는 네트워크 재시도 경로가 없다.
- 현재 server application은 `V4상태`, `V4계약확인` 외 명령을 `NOT_IMPLEMENTED`로 분류한다.
- 현재 public conflict code는 요구된 `REPLAY_CONFLICT`가 아니라 `IDEMPOTENCY_MISMATCH`다.
- 요구된 `WRONG_PROFILE`, `REPLAY_CONFLICT`, `SERVER_UNAVAILABLE`, `INVALID_FORM` taxonomy가 현재 client/server 계약에 완성되어 있지 않다.

### 미확인 사항

- 실제 MessengerBot R 저장·재열기·Rhino 컴파일 경고
- 실제 카카오 callback의 event 중복·네트워크 retry 동작
- 두 일반 사용자의 동일 RECRUIT 방 교차 수정·마감
- FEATURES 방의 실제 랭킹·전적·최근 응답
- 실제 5초 timeout 체감과 서버 round-trip 로그
- 운영 또는 staging 배포 상태

## 6. 출시 차단 문제

### P1-01 — 교차 profile 로컬 필터 부재

- 증상 또는 발견 내용: RECRUIT의 FEATURES 명령 4개와 FEATURES의 RECRUIT 명령 4개가 모두 transport로 전달됐다.
- 기대 동작: 잘못된 profile 명령은 로컬 무응답이고 HTTP 요청이 0회여야 한다.
- 재현 조건: C02, C03 실행.
- 영향받는 사용자: RECRUIT/FEATURES 두 방 사용자 전체.
- 영향 범위: 불필요한 서버 요청, 잘못된 방 응답, profile 경계 혼동.
- 확인 근거: 각 테스트 actual call count 4, expected 0.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: FAIL.
- 제안하는 해결 방법: canonical parser 뒤 profile별 allowlist를 적용하고 transport 전에 return한다.
- 구현 난이도: 중.
- 예상 효과: 교차 명령 서버 요청·방 응답 0.
- 부작용 및 위험: 공용 `/봇버전`·도움말까지 차단하지 않도록 공용 명령 집합을 분리해야 한다.
- 검증 방법: C02/C03과 실기기 두 방 교차 명령.
- KPI: 교차 명령 HTTP 0, reply 0.

### P1-02 — slash 부정 입력의 transport 선차단 부재

- 증상 또는 발견 내용: client는 부정 입력 6개를 모두 전송했고 server canonicalizer는 URL을 null로 거부하지 않았다.
- 기대 동작: 0/1 선행 slash만 허용하고 `//`, URL, 문장 중간 slash는 네트워크 전에 무시한다.
- 재현 조건: C04, S02.
- 영향받는 사용자: 일반 채팅이 있는 모든 방.
- 영향 범위: 오탐 응답과 API 부하.
- 확인 근거: client call count 6, URL canonical actual 문자열.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: FAIL.
- 제안하는 해결 방법: client/server 공통 strict command boundary를 구현하고 동일 fixture를 공유한다.
- 구현 난이도: 하.
- 예상 효과: 대화·URL 오인식 방지.
- 부작용 및 위험: 양식 본문 내부 slash까지 거부하지 않도록 첫 줄 command와 authoritative form을 구분해야 한다.
- 검증 방법: C04/S02 및 전체 fixture corpus.
- KPI: 부정 corpus reply·HTTP·mutation 0.

### P1-03 — 실제 V1 dispatcher 미연결

- 증상 또는 발견 내용: 모집 생성·교차 수정·마감, snapshot, FEATURES 조회, 스크림, 중복 mutation이 `NOT_IMPLEMENTED`다.
- 기대 동작: 각 명령이 typed application 경로로 성공하고 revision·응답·멱등 결과가 검증돼야 한다.
- 재현 조건: S03~S07.
- 영향받는 사용자: V4 대상 사용자 전체.
- 영향 범위: 핵심 기능 사용 불가.
- 확인 근거: 기대 `REPLY`, 실제 `NOT_IMPLEMENTED`.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: FAIL.
- 제안하는 해결 방법: V1 contract route를 V4 dispatcher와 기존 모집/통계 application service에 연결한다.
- 구현 난이도: 상.
- 예상 효과: V4 핵심 명령 사용 가능.
- 부작용 및 위험: V1 응답 문구·권한·revision·기존 데이터 계약 회귀 가능.
- 검증 방법: S03~S07, 기존 골든 57개, disposable DB contract.
- KPI: 필수 명령 성공률 100%, 501 응답 0.

### P1-04 — network retry 계약 부재

- 증상 또는 발견 내용: 무 logId 새 호출의 event ID 증가는 정상이나 client transport에 retry 경로가 없다.
- 기대 동작: 한 callback의 네트워크 재시도는 최초 할당한 event ID와 body를 그대로 사용해야 한다.
- 재현 조건: C05 PASS, C06 FAIL.
- 영향받는 사용자: 일시적 네트워크 오류 사용자.
- 영향 범위: 중복 mutation 또는 복구 실패.
- 확인 근거: `send()`에 단일 `.execute()`만 존재.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: FAIL.
- 제안하는 해결 방법: event ID/body/signature 생성 후 bounded retry를 분리하고 동일 payload를 재사용한다.
- 구현 난이도: 중.
- 예상 효과: 안전한 일시 장애 복구.
- 부작용 및 위험: mutation을 무제한 재시도하면 안 되며 retry 가능 오류와 횟수를 제한해야 한다.
- 검증 방법: 첫 연결 실패·두 번째 성공 stub에서 두 요청 event ID/body digest 동일 확인.
- KPI: retry 간 event ID 변경 0, 중복 mutation 0.

### P1-05 — 오류 taxonomy 불일치

- 증상 또는 발견 내용: client는 서버 detail을 일반 실패로 표시하며 요구 코드 전체를 분기하지 않는다. conflict public code도 다르다.
- 기대 동작: 정상, `WRONG_PROFILE`, `INVALID_SIGNATURE`, `REPLAY_CONFLICT`, `SERVER_UNAVAILABLE`, `INVALID_FORM`을 구분한다.
- 재현 조건: C08, S08, S09.
- 영향받는 사용자: 설정·입력·서버 장애를 겪는 사용자와 운영자.
- 영향 범위: 잘못된 복구 안내, 장애 진단 지연.
- 확인 근거: 요구 token 부재, 409 actual code `IDEMPOTENCY_MISMATCH`.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: FAIL.
- 제안하는 해결 방법: server public problem code와 client 안전 문구 map을 한 계약으로 고정한다.
- 구현 난이도: 중.
- 예상 효과: 원인별 재시도·설정 확인 안내 가능.
- 부작용 및 위험: 내부 stack·secret·식별자를 detail에 노출하지 않아야 한다.
- 검증 방법: C08/S08/S09와 실기기 오류 주입.
- KPI: 오류 6종 오분류 0, 민감정보 노출 0.

### P1-06 — 실기기 증거 부재

- 증상 또는 발견 내용: 실제 휴대폰, 두 사용자, 두 방 실행 증거가 없다.
- 기대 동작: `DEVICE_CHECKLIST.md` 전 항목에 증거 경로가 연결돼야 한다.
- 재현 조건: 현재 QA evidence 확인.
- 영향받는 사용자: 출시 대상 전체.
- 영향 범위: Rhino·Android·카카오 callback 차이를 확인하지 못함.
- 확인 근거: 기기 screenshot/log/manifest 없음.
- 확신 수준: 확인.
- 심각도: P1.
- 현재 상태: NOT TESTED.
- 제안하는 해결 방법: 전용 QA 계정·두 방·staging으로 체크리스트 실행.
- 구현 난이도: 중.
- 예상 효과: 로컬 harness 밖 실제 환경 결함 탐지.
- 부작용 및 위험: 개인정보가 증거에 포함될 수 있어 가명 계정과 redaction이 필요.
- 검증 방법: evidence manifest와 QA sign-off.
- KPI: 실기기 필수 항목 PASS 100%, 증거 없는 PASS 0.

## 7. 자동화·수동 경계

- 자동: artifact 문자 수/ES5/Rhino, identity 비수집, profile routing, slash, event ID, dispatcher, 오류 code, timeout, request count, V1 golden.
- 수동 필수: MessengerBot R 붙여넣기·저장·컴파일, Android callback, 두 실제 사용자, 두 방, 네트워크 장애 주입, 카카오 표시 품질.
- 자동 PASS를 수동 PASS로 승계하지 않는다.

## 8. 작업 상태

- 테스트 소스 반영: 이 QA 브랜치에 추가, 커밋 예정.
- 제품 소스 반영: 없음.
- 빌드: 미실행. 기존 generated V4 artifact를 읽기 전용 검사.
- DB 변경: 없음.
- 운영 배포: 없음.
- 남은 위험: P1-01~P1-06 전체.

## 9. 다음 패치 추천

1. profile별 client allowlist와 부정 slash 선차단을 먼저 구현한다.
2. V4 dispatcher에 모집·snapshot·FEATURES·스크림을 단계별로 연결한다.
3. retry용 immutable envelope를 만들고 event ID/body 재사용을 검증한다.
4. 요구 오류 6종을 server/client 공통 contract로 통일한다.
5. 기능 자동 테스트가 모두 PASS한 뒤 실기기 두 사용자·두 방 수용을 진행한다.
