# Kakao V4 Phase 3 실기기 체크리스트

현재 결과: **BLOCKED** — 이 QA 환경에는 Android/MessengerBot R 실기기, 테스트 카카오 방, V4 설치 키가 없다. 아래 항목은 실행 절차와 증거 형식을 고정한 것이며 실행 완료를 의미하지 않는다.

## 사전 조건

- 테스트 전용 카카오 방 1개와 서로 다른 일반 사용자 계정 2개를 준비한다.
- RECRUIT/FEATURES 설치본의 버전, V1 contract version, 서버 배포 SHA를 기록한다.
- 테스트용 활성 시즌과 테스트용 멸망전 0건/1건/2건 상태를 안전하게 전환할 수 있어야 한다.
- 운영 데이터 대신 삭제 가능한 QA 데이터만 사용하고, 생성 aggregate ID를 기록한다.
- 화면 캡처에는 개인 프로필, 전화번호, secret, token을 가린다.

## 실행 체크리스트

| ID | 절차 | 기대 결과 | 상태 | 필요한 증거 |
|---|---|---|---|---|
| D01 | 두 설치본에서 `/V4상태`, `/V4계약확인` | 프로필·계약 버전 일치 | BLOCKED | 캡처, 서버 trace |
| D02 | 사용자 A/B가 각각 `내전구인` | 둘 다 동일 V1 종목 선택 안내 | BLOCKED | 두 계정 캡처 |
| D03 | 협곡/칼바람/증바람 생성 명령 | 날짜·번호·정원과 모드별 필드 exact parity | BLOCKED | 원문/응답 텍스트 diff |
| D04 | `내전현황`, `내전상세 2` | 전체 회차 요약과 편집 가능한 상세 양식 | BLOCKED | 캡처, API 응답 |
| D05 | A snapshot → B snapshot → A snapshot | 세 revision 모두 반영, 즉시 중복만 억제 | BLOCKED | 명단 DB read-only 조회, trace |
| D06 | 기존 2명 양식에서 1명 삭제 후 전체 전송 | 빠진 사용자가 서버 명단에서 삭제 | BLOCKED | 전/후 조회 |
| D07 | 10칸이 모두 빈 완전한 양식 전송 | 0명 authoritative 반영/취소 | BLOCKED | 전/후 조회 |
| D08 | `스크림구인` | KST 당일 운영일과 `#자동배정` exact template | BLOCKED | 응답 원문 |
| D09 | 활성 대회 1건에서 신규 전체 양식 | 정확한 대회 binding, mutation 1회 | BLOCKED | aggregate/대회 ID, trace |
| D10 | 기존 번호 전체 양식 수정 | 같은 aggregate·대회 binding 유지, revision +1 | BLOCKED | 전/후 조회 |
| D11 | 활성 대회 0건/2건에서 신규 양식 | mutation 0회, `INVALID_FORM` 안내 | BLOCKED | 오류 응답, mutation log |
| D12 | 운영 양식 friends/suggestions/meetups/leaves 정상 | 각 1회 접수, server reply 그대로 표시 | BLOCKED | 접수 ID, 응답 원문 |
| D13 | 각 운영 양식 필수값 비움 | 누락 필드 순서대로 안내, 접수 0회 | BLOCKED | 응답 원문, log |
| D14 | 등록/내전등록/경고등록/인증/경고현황/결과현황 | V1 문구·링크 exact parity | BLOCKED | 링크 포함 응답 diff |
| D15 | `사진취소` | 공개 V1 계약 응답, 내부 V2 명령과 분리 | BLOCKED | 응답/세션 전후 |
| D16 | `자동공지 20` | 읽기 전용 미리보기, 실제 자동 발송 없음 | BLOCKED | 응답/방 메시지 확인 |
| D17 | 동일 callback을 같은 eventId로 재전송 | mutation 1회, replay 응답 동일 | BLOCKED | client/server log correlation |
| D18 | 동일 eventId에 다른 본문 전송 | HTTP 409 `REPLAY_CONFLICT` | BLOCKED | 상태 코드/공개 code |
| D19 | 느린 네트워크에서 timeout 후 자동 retry | 같은 eventId 사용, mutation 1회 | BLOCKED | attempt별 eventId, trace |
| D20 | command 21종 각각 한 번 입력 | client send 1회, server downstream call 최대 1회 | BLOCKED | 계측 log |
| D21 | 모바일 키보드가 열린 채 긴 전체 양식 붙여넣기 | 줄바꿈/한글/특수문자 손실 없이 1회 처리 | BLOCKED | 입력/응답 캡처 |
| D22 | 새로고침에 준하는 앱 재시작 후 retry | durable idempotency 유지 또는 한계가 명시됨 | BLOCKED | 재기동 전후 log |

## 판정 규칙

- PASS: 실제 메시지, 서버 trace, read-only 데이터 조회가 함께 남은 경우만 표시한다.
- FAIL: 재현 가능한 차이와 eventId/trace를 기록한다.
- BLOCKED: 실기기·권한·테스트 데이터 상태가 없어 실행할 수 없는 경우다.
- NOT TESTED: 환경은 있으나 실행하지 않은 경우다.
- 화면이 정상처럼 보여도 mutation/readback을 확인하지 않으면 PASS가 아니다.

## 패치 후 최소 재검증

1. 자동 Phase 3 `54/54 PASS`.
2. Phase 2 회귀 `116/116 PASS`.
3. D03~D07 INHOUSE 전체 흐름.
4. D08~D11 SCRIM과 활성 대회 경계.
5. D12~D20 OPERATIONS/replay/single-send.
