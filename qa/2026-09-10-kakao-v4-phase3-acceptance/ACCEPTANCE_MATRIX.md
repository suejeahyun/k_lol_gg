# Phase 3 acceptance matrix

## 자동 테스트 환경

| 환경 | 상태 | 근거 |
|---|---|---|
| Windows / Node test runner | PASS | 신규 client 21개와 Phase 2 회귀 116개 실행 |
| TypeScript server/service harness | FAIL | 신규 서버 계약 33개 중 31개 실패 |
| Android + MessengerBot R | BLOCKED | 연결된 실기기·테스트 방·설치본 없음 |
| 운영 API/DB | NOT TESTED | 배포·DB 접근을 수행하지 않음 |
| 웹 1440/1280/768/390/360px | NOT APPLICABLE | 이번 범위는 Kakao bot command 계약이며 웹 UI 변경 없음 |
| 키보드/마우스/터치 및 WCAG 2.2 AA | NOT APPLICABLE | bot text protocol 자동 계약. 링크 대상 웹 접근성은 별도 QA 필요 |

## 현재 의도적 501 범위와 V1 acceptance

`RECOGNIZED → canonical null → NOT_IMPLEMENTED → HTTP 501`인 현재 경로를 기준으로 열거했다. `스크림구인` 초기 양식만 200 응답이지만 exact reply가 다르다.

| 프로필/영역 | V1 입력 범위 | 현재 baseline | 구현 후 acceptance |
|---|---|---|---|
| FEATURES INHOUSE 종목 선택 | `내전구인` | 501 | V1 종목 선택 안내 exact reply |
| FEATURES INHOUSE 생성 | 협곡/칼바람/증바람 및 날짜·번호·정원 | 501 | 모드별 전체 양식 exact reply |
| FEATURES INHOUSE 조회 | `내전현황`, `시즌내전현황`, `AI공지`, `내전상세` | 501 | 전체 회차/번호 상세 exact reply |
| FEATURES INHOUSE 참가 안내 | `내전참가`, `내전신청`, `참가신청` | 501 | V1 server legacy reply |
| FEATURES INHOUSE snapshot | 협곡/칼바람/증바람 전체 양식 | 501 | 완전한 authoritative 배열, 삭제·0명·A→B→A |
| RECRUIT SCRIM 초기 양식 | `스크림구인` 계열 | 200, 운영일 불일치 | V1 KST 날짜 exact reply |
| RECRUIT SCRIM 신규/수정 | 전체 양식 `#자동배정`/기존 번호 | 501 | mutation 1회, 신규/수정 exact reply |
| RECRUIT SCRIM active tournament | 명시 번호가 없는 신규 양식 | 501 | 활성 대회 1건만 허용, 0/2+건 `INVALID_FORM` |
| FEATURES 운영 양식 | friends/suggestions/meetups/leaves | 501 | 정상은 1회 접수, 누락은 0회 접수+exact 오류 |
| FEATURES 등록/결과/경고 | 등록센터, 내전등록, 경고등록, 인증, 경고현황, 결과현황 | 501 | V1 링크·문구 exact reply |
| FEATURES 사진취소 | 공개 V1 `사진취소` | 501 | V1 계약상 등록센터 exact reply. 내부 `V2사진취소`와 분리 |
| FEATURES 예약공지 | `자동공지`, `공지생성` + 12/15/18/20 | 501 | 읽기 전용 미리보기 exact reply |
| 내부/진단 | `V2*`, raw JSON, 사진상태/미리보기 확인 계열 | 501 유지 | Phase 3 V1 공개 acceptance 범위 밖 |
| unknown/invalid | slash boundary 위반/미등록 명령 | 501 또는 invalid 유지 | 사용자 명령으로 새로 노출하지 않음 |

## 케이스별 baseline

| ID | 계약 | 결과 | 실제 결과/근거 |
|---|---|---|---|
| P3-I01~I06 | INHOUSE 선택·생성·현황·상세 exact reply | FAIL | `NOT_IMPLEMENTED` |
| P3-I07 | snapshot 삭제·0명·A→B→A | FAIL | canonical `null` |
| P3-I08 | 칼바람/증바람 이름 전용 snapshot | FAIL | canonical `null` |
| P3-S01 | SCRIM 초기 양식 exact date | FAIL | `운영일: 작성일` |
| P3-S02~S03 | SCRIM 신규/수정 1회 dispatch | FAIL | `NOT_IMPLEMENTED`, dispatch 0회 |
| P3-S04~S05 | 활성 대회 0/2+건 `INVALID_FORM` | FAIL | 501로 port 미도달 |
| P3-O01~O04 | 운영 양식 4종 정상 | FAIL | `NOT_IMPLEMENTED`, dispatch 0회 |
| P3-O05~O08 | 운영 양식 4종 필수값 누락 | FAIL | V1 누락 안내 대신 501 |
| P3-M01~M08 | 관리 안내/예약공지 exact reply | FAIL | `NOT_IMPLEMENTED` |
| P3-A01 | authorization에 room/sender role 미사용 | PASS | 입력은 installation/profile/key만 포함 |
| P3-A02 | 일반 사용자 2명 동일 기능 사용 | FAIL | allowlist 차단은 없지만 기능이 501 |
| P3-R01 | 동일 eventId mutation replay 1회 | FAIL | 성공 mutation이 501, dispatch 0회 |
| P3-R02 | 동일 eventId 본문 충돌 | PASS | HTTP 409 `REPLAY_CONFLICT` |
| P3-C01~C21 | 대상 command당 client send 1회 | PASS | 각 command `send` 정확히 1회 |

## 출시 판정

- 출시 차단: P3-I*, P3-S*, P3-O*, P3-M*, P3-A02, P3-R01.
- 출시 후 개선: 없음. 요청된 Phase 3 계약은 모두 출시 전 충족 대상이다.
- 회귀 게이트: 기존 Phase 2 116개는 앞으로도 **116/116 PASS**가 아니면 병합하지 않는다.

## KPI 및 관측 이벤트 제안

| KPI | 기준선 | 목표 | 필요한 속성 |
|---|---:|---:|---|
| Phase 3 501 응답률 | 자동 대상 서버 계약 31/31 실패 | 0% | profileId, command category, result code, contract version |
| V1 reply mismatch | 서버 exact reply 대상 전부 미충족 | 0건 | command category, expected fixture version, reply hash |
| command당 client send | 21/21 1회 | 100% 1회 | eventId, attempt, profileId, command category |
| duplicate mutation | 실제 운영 기준선 미확인 | 0건 | eventId hash, aggregate id, mutation count, replayed |
| 활성 대회 판별 실패 | 실제 기준선 미확인 | 추세 관측 | active tournament count(0/1/2+), recruitDate, result code |
| 운영 양식 제출 성공률 | 실제 기준선 미확인 | 구현 후 기준선 수립 | formType, validation result, missing field count, HTTP code |

개인정보 보호를 위해 원문 text, sender 표시명, Riot ID, 양식 본문은 분석 이벤트에 저장하지 않는다.
