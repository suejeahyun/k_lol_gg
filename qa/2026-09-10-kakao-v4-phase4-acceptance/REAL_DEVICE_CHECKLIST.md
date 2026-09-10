# Kakao V4 Phase 4 실기기 체크리스트

현재 상태: **BLOCKED**. Android/MessengerBot R 기기, 테스트 카카오 방, 설치 secret이 이 QA 환경에 없어 실행하지 않았다.

## 사전 조건

- 테스트 전용 방과 RECRUIT/FEATURES 설치본을 준비한다.
- 서버 배포 SHA, 봇 파일 SHA-256, MessengerBot R/Rhino 버전을 기록한다.
- 사용자 2명을 준비하되 화면 증거의 표시명·프로필은 마스킹한다.
- 서버 trace에는 원문, secret, token이 남지 않는지 확인한다.

## 체크리스트

| ID | 절차 | 기대 결과 | 상태 | 증거 |
|---|---|---|---|---|
| D01 | 두 봇 `/봇버전` | profile·버전·installation 표시, 서버 요청 없음 | BLOCKED | 화면+HTTP log |
| D02 | FEATURES `/도움말` | V1 일반 도움말 exact, 0 send | BLOCKED | 원문 diff |
| D03 | RECRUIT `/도움말`, `/구인도움말` | V1 구인 도움말 exact, 0 send | BLOCKED | 원문 diff |
| D04 | RECRUIT `/구인웹도우미` | V1 사이트 링크 exact, 0 send | BLOCKED | 원문 diff |
| D05 | PUBLIC 대표 alias plain/slash | 동일 reply, 501 없음 | BLOCKED | 두 응답+trace |
| D06 | PUBLIC 명령을 반대 profile에서 실행 | 403 `WRONG_PROFILE` 안내 | BLOCKED | 상태/code |
| D07 | malformed slash/URL/일반 대화 | 무응답·무전송 | BLOCKED | 방 화면+HTTP 0건 |
| D08 | unknown 직접 API 요청 | 400 `INVALID_FORM`, 501 금지 | BLOCKED | HTTP 증거 |
| D09 | INTERNAL/raw V2 9종 plain/slash | public HTTP 0건 | BLOCKED | 클라이언트 계측 |
| D10 | FEATURES `/사진상태` | 사이트 확인 안내, 세션 정상 단정 금지 | BLOCKED | 응답 원문 |
| D11 | `/내전미리보기취소` | 사이트 미반영·폐기 안내, mutation 0건 | BLOCKED | 응답+DB readback |
| D12 | `/내전확인 ABCD1234` | 확인 대상 없음/폐기 안내, mutation 0건 | BLOCKED | 응답+DB readback |
| D13 | 명령별 로그 확인 | client send ≤1, server mutation ≤1 | BLOCKED | eventId/trace |
| D14 | 네트워크 지연·첫 요청 timeout | timeout ≤5초, retry도 같은 eventId | BLOCKED | 시간/attempt log |
| D15 | 두 일반 사용자 같은 PUBLIC 명령 | sender role 없이 같은 결과 | BLOCKED | 마스킹 화면 |
| D16 | Android에서 두 생성 파일 compile | Rhino 오류·경고 후보 없음 | BLOCKED | 앱 compile log |

## 판정 규칙

- PASS는 카카오 화면, client send count, server trace 또는 read-only 데이터가 필요한 수준으로 함께 남았을 때만 사용한다.
- mutation 없는 명령은 DB/read model 변화가 없음을 확인해야 한다.
- 기기에서 보기 좋다는 이유만으로 기능 PASS를 주지 않는다.

## 패치 후 필수 재검증

1. Phase 4 자동 계약 25/25 PASS.
2. Phase 2 116/116, Phase 3 70/70, V1 fixture 12/12 PASS.
3. D02~D12 공개/로컬/INTERNAL 경계.
4. D13~D16 send/retry/Rhino 실기기 검증.
