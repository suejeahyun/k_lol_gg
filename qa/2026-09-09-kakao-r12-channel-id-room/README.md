# Kakao R12 channelId 방 식별 QA

## 원인 판정

- 확인됨: 99의 방 입력 `AD00.B9AC.C790.002E.0020.0039.0039...`는 `관리자. 99 재현 M(M)`이다.
- 확인됨: 지오의 방 입력은 `03 지오 zabaniah G(E)`, 소영의 방 입력은 `관리자. 97 소영 U(D)`이다.
- 확인됨: 세 사용자 모두 같은 installation fingerprint를 사용하지만 `room` callback에는 각 발신자 표시명이 들어왔다.
- 확인됨: 소스 내부에서 `room` 매개변수를 재대입하지 않았고 `sender`도 방 HMAC 입력에 포함하지 않았다.
- 판정: DB·HMAC 결함이 아니라 Android 11+ 카카오 알림 구조를 처리하지 못하는 MessengerBot R 알림 파서 문제다.

## 수정

- 레거시 `response` 서명을 `channelId`, `userHash`까지 받는 현재 계약으로 확장했다.
- 숫자형 `channelId`가 있으면 방 이름 대신 이를 HMAC 방 입력으로 사용한다.
- 같은 `channelId`의 서로 다른 발신자 100명은 방 fingerprint 1개와 발신자 fingerprint 100개를 만든다.
- `channelId` 없이 `isGroupChat=false`이고 `room=sender`이면 서버 권한 요청과 로컬 방 상태 처리를 안전하게 거부한다.
- `/V2연동확인`은 `방 식별 기준: channelId` 또는 `legacy room`을 표시한다.
- 환경변수·sender allowlist·방 이름 하드코딩은 추가하지 않았다.

## 검증

| 검증 | 결과 |
| --- | --- |
| channelId·손상 callback 집중 테스트 | 19/19 통과 |
| MessengerBot R 생성 | LF 65,161자 / CRLF 보수 계산 65,306자 |
| 휴대폰 설치본 SHA-256 | `3c5c3601c2cf7a1cd61f87171eabc5c9a84f6962d1a3cec720b6bacde4c06267` |
| 계약·단위 테스트 | 215/215, 479/479 통과 |
| recruiting DB 계약 | 10/10 통과 |
| TypeScript·production build | 통과 |
| ESLint | 오류 0, 생성물·기존 테스트 중심 경고 18 |

## 운영 전 필수 확인

1. MessengerBot R 앱 버전을 확인한다. 0.7.34a 미만 또는 Play 스토어 레거시판이면 최신 안정 버전으로 교체한다.
2. R12 휴대폰 설치본을 전체 교체한다.
3. `/봇버전`으로 R12와 설치 지문을 확인한다.
4. 99·지오·소영이 같은 방에서 `/V2연동확인`을 실행한다.
5. 세 결과가 같은 방 fingerprint이고 `방 식별 기준: channelId`인지 확인한다.
6. 관리자 canonical room pairing 후 MEMBER 조회·생성 및 역할별 변경을 실제 검증한다.

운영 DB migration, 서버 배포, MessengerBot R 앱 업데이트, 휴대폰 설치 및 실제 카카오 송수신은 이 저장소 작업에서 수행하지 않았다.

## 근거 있는 다음 패치 추천

1. `userHash`를 sender fingerprint의 우선 입력으로 전환해 닉네임 변경에도 멤버 역할을 유지한다.
2. channelId 사용률과 legacy fallback 사용률을 민감값 없는 집계로 관리자 화면에 표시한다.
3. 지원 최소 MessengerBot R 버전과 APK 교체·rollback runbook을 별도로 고정한다.
4. 실제 기기별 channelId fixture를 추가하되 원본 ID는 HMAC 처리 후 보관한다.
