# Kakao R11 방 콜백 추적 QA

## 관측과 판정

- 확인됨: R10의 두 `/V2연동확인` 결과는 설치 지문 `install-42fc4a1af843db6b874d3b5b3b884fa3`으로 동일하다.
- 확인됨: 같은 두 결과의 방 지문은 `room-6deb4cdee4ea09d71d2e171f4cbbb7b3`, `room-ad9195e02863363eb38dc06a27c3af9b`로 다르다.
- 확인됨: 소스와 속성 테스트상 `sender`는 방 HMAC 입력에 포함되지 않는다.
- 판정: 서로 다른 identity secret 가설은 배제되며, MessengerBot R이 서로 다른 `room` 문자열을 전달했다.
- 미확인: 두 callback 문자열의 어느 UTF-16 코드 단위가 다른지. R11 현장 결과가 필요하다.

## R11 변경

- `/V2연동확인`에 NFKC·zero-width 정규화 후 실제 방 HMAC 입력의 UTF-16 코드 단위를 최대 80개까지 표시한다.
- 원문 방 이름, secret, 환경변수 또는 새 허용 목록을 서버로 전송하거나 저장하지 않는다.
- 기존 방·발신자 fingerprint 계산과 DB canonical room pairing 계약은 변경하지 않는다.

## 검증

| 검증 | 결과 |
| --- | --- |
| 방 식별·모바일 집중 테스트 | 11/11 통과 |
| MessengerBot R 생성 | LF 65,046자 / CRLF 보수 계산 65,264자 |
| 휴대폰 설치본 SHA-256 | `71bda4b0f3149caf2ba9ae6edb48f0268a0bd658acca992ec709b551f9fe3de4` |
| 계약·단위 테스트 | 214/214, 479/479 통과 |
| recruiting DB 계약 | 10/10 통과 |
| TypeScript·production build | 통과 |
| ESLint | 오류 0, 생성물·기존 테스트 중심 경고 18 |

## 현장 확인

1. R11 설치본 전체를 교체하고 `/봇버전`으로 버전·설치 지문을 확인한다.
2. 97·99 사용자가 같은 실제 방에서 `/V2연동확인`을 각각 한 번 실행한다.
3. 두 결과의 `방입력 UTF-16` 줄을 원문 그대로 비교한다.
4. 값이 다르면 최초로 달라지는 코드 단위를 기준으로 MessengerBot R callback 원인을 분류한다.

운영 서버 배포, DB migration, 휴대폰 설치 및 실제 카카오 송수신은 이 저장소 작업에서 수행하지 않았다.

## 근거 있는 다음 패치 추천

1. 현장 코드 단위 차이가 방향 제어·variation selector 등 안전하게 제거 가능한 문자로 확인되면 정규화 allowlist를 최소 범위로 확장한다.
2. callback 값이 사용자별 별도 방 제목으로 확인되면 로컬 fingerprint 자동 병합을 하지 않고 관리자 canonical room pairing으로 연결한다.
3. 진단 완료 후 UTF-16 출력은 제거하거나 SUPER 진단 모드로 제한한다.
4. MessengerBot R 버전·Android 제조사별 callback 차이를 회귀 fixture로 고정한다.
