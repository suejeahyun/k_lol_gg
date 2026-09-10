# Kakao V4 command gateway

설계 버전: `KLOL_KAKAO_COMMAND_V4_2026_09_10_R2_UNIFIED`

## 상태

- 소스 구현: 단일 gateway, profile 전용 authorization, 전체 공개 V1 명령 dispatcher, 통합 ES5 템플릿과 단일 산출물 생성 스크립트.
- 실제 동작: `봇버전`·`도움말` 등은 봇 로컬 응답, 나머지 공개 V1 파티·내전·스크림·조회·운영 양식은 서명·profile 검증 후 canonical dispatcher가 처리한다.
- 차단 동작: 알 수 없는 명령과 internal/raw 입력은 `INVALID_FORM`, 교차 profile 명령은 `WRONG_PROFILE`로 fail-closed한다. 공개 V1 명령에 `501` 또는 `ROUTER_NOT_ENABLED` 경로는 없다.
- 검증 상태: 자동 contract·unit·typecheck·production build 통과. V4 전용 identity·signing keyring을 V1/V41과 분리했으며 실제 값은 Git에 저장하지 않는다. MessengerBot R 실기기 전환은 아직 수행하지 않았다.
- 운영 반영: 서버 endpoint는 2026-09-10 GitHub `main`과 Vercel Production에 배포됐다. 통합 휴대폰 봇은 아직 운영에 설치하지 않았다.

## 경계

```text
MessengerBot R
  -> local: 봇버전 / 도움말
  -> prefilter: empty / over 20,000 chars / bot echo
  -> command family: 파티·스크림=RECRUIT / 내전·조회·운영=FEATURES
  -> raw text exactly once
  -> POST /api/integrations/kakao/v4/commands (1 execute, 5 second timeout, no automatic retry)
       -> exact envelope + body size + query/header rejection
       -> V4 raw-body HMAC + timestamp
       -> installation -> canonical room -> profile capability
       -> eventId idempotency
       -> local/probe reply OR canonical V1 dispatcher
       -> unknown/internal/cross-profile fail-closed
```

V4는 실제 room ID, channel ID, room name을 body나 header로 받지 않는다. MessengerBot R callback의 `room`과 `channelId` 인자는 플랫폼 시그니처 때문에 존재하지만 읽거나 전송하지 않는다. `senderId`는 표시명 또는 안정 user hash의 HMAC fingerprint이며, 공개 명령 authorization은 sender role이나 환경 allowlist를 사용하지 않는다.

## 한 휴대폰·통합 봇·두 방 운영 토폴로지

V4의 기준 운영 형태는 **휴대폰 1대 + MessengerBot R 통합 봇 프로필 1개 + 카카오톡 방 2개**다. 실기기에서 두 분리형 프로필이 두 방 알림을 모두 수신한 사실을 반영해, 통합 callback 하나만 사용한다.

- 통합 프로필이 구인 관련방과 기능방 알림을 함께 수신한다.
- 파티·구인·스크림 명령은 `RECRUIT`, 내전·전적·랭킹·운영 양식은 `FEATURES`로 분류한다.
- `/봇버전`과 로컬 도움말은 통합 프로필이 한 번만 응답하며 서버로 전송하지 않는다.
- callback의 `room`, `channelId`, 방 이름은 파싱·분류·인증·전송에 사용하지 않는다.
- 따라서 실제 카카오 방은 권한 경계가 아니다. 잘못된 방에서 지원 명령을 입력해도 해당 family 요청은 실행될 수 있으며, 접근 제어는 installation/profile 서명과 서버 도메인 규칙이 담당한다.
- 같은 통합 스크립트가 V4 전용 identity secret과 선택된 profile ID로 서로 다른 RECRUIT/FEATURES `installationId`와 내부 room scope를 계산한다.
- 분류된 명령은 서버에 정확히 한 번 전송한다. 네트워크 예외 시 자동 재시도하지 않아 최대 대기 시간은 5초다.
- 두 방에서 봇 표시명이 다르므로 `KLOL_V4_BOT_SELF_NAME_RECRUIT`와 `KLOL_V4_BOT_SELF_NAME_FEATURES`에 각 표시명을 저장한다. 통합 callback은 둘 중 어느 이름이든 self echo로 무시한다.

## 요청 계약

본문은 아래 일곱 키만 허용한다.

```json
{
  "profileId": "RECRUIT",
  "installationId": "install-0123456789abcdef0123456789abcdef",
  "senderId": "sender-user-0123456789abcdef0123456789abcdef",
  "eventId": "event-boot-a1b2c3d4e5f60718-1",
  "timestamp": 1789009200,
  "nonce": "0123456789abcdef0123456789abcdef",
  "text": "/V4상태"
}
```

- `profileId`: 통합 entry가 원문 명령 family로 결정한 `RECRUIT` 또는 `FEATURES`.
- `installationId`: identity secret과 profile에서 만들어지는 안정 fingerprint.
- `senderId`: user hash가 있으면 이를, 없으면 표시명을 HMAC 처리한 fingerprint.
- `eventId`: log ID가 있으면 profile+boot ID+log ID, 없으면 프로세스 시작 때 생성한 `bootId`와 증가 counter를 사용한다. 같은 실행 중 동일 callback 재전송은 같은 ID이고, 재시작 뒤 같은 log ID는 다른 ID다. message content hash는 사용하지 않는다.
- `timestamp`, `nonce`: replay window와 서명 신선도 입력.
- `text`: 파싱하지 않은 원문. 이미지 입력은 이번 범위에서 제외한다.

HTTP header는 `Content-Type`, `Accept`, `x-klol-key-id`, `x-klol-signature`, `Idempotency-Key`만 애플리케이션 계약으로 사용한다. `Idempotency-Key`는 `eventId`와 정확히 같아야 한다. `x-klol-room`, `x-klol-channel`, `x-klol-room-name`, `x-klol-sender`가 있으면 요청을 거부한다.

MessengerBot R의 log ID가 방 전체가 아니라 방별로만 유일한지는 미확인이다. 같은 실행·같은 profile family·서로 다른 방에서 같은 log ID가 충돌할 잔여 위험이 있으므로 실기기 로그로 확인해야 한다. room 값을 event ID에 넣어 이 위험을 숨기지 않는다. 방 값은 신뢰 경계가 아니기 때문이다.

서명 material은 다음과 같다.

```text
KLOL_KAKAO_COMMAND_V4\n<keyId>\n<SHA-256(raw JSON body)>
```

## V1 계약

명령 분류와 exact reply의 기준은 `docs/contracts/KAKAO_V4_V1_COMPATIBILITY_CONTRACT.md`와 `tests/fixtures/kakao-v4-v1-compatibility-contract.json`이다. 선행 ASCII slash 0회/1회 동등성, slash 오탐 방지, canonical room 소유권, authoritative full snapshot, A→B→A revision 수용, V2 진단 분리를 유지한다.

V1 dispatcher는 기존 PostgreSQL 서비스에 연결되어 있다. 상태 변경과 서버 조회 응답은 기존 durable receipt·nonce 경계를 사용하며 같은 event/body 재전송은 replay, 같은 event의 다른 body는 conflict로 처리한다. application의 bounded in-memory receipt는 동일 프로세스 안의 빠른 재전송을 보조할 뿐 영속 경계를 대체하지 않는다.

## MessengerBot R 산출물

편집 원본은 공용 `KLOL_KAKAO_BOT_V4_SHARED.js`와 통합 `KLOL_KAKAO_BOT_V4_UNIFIED.js` entry다. 다음 명령이 휴대폰 붙여넣기용 파일 하나를 생성한다.

```powershell
npm run bot:kakao:v4
```

공개 생성본에는 비밀값이 없다. 실제 휴대폰에는 `.private/KLOL_KAKAO_BOT_V4_UNIFIED_PRIVATE_MESSENGERBOT_R.js` 한 파일만 전체 붙여넣는다. private 생성기는 V4 전용 identity·signing keyring과 두 self-echo 표시명을 파일 선두에서 `DataBase`에 자동 저장하며, 같은 값을 Vercel Production에 등록할 수 있다. 과거 분리형 산출물은 `legacy-split-profiles`에 보존하지만 운영에 설치하지 않는다. 자동 검증과 실기기 QA가 모두 끝나기 전에는 운영방에 설치하지 않는다.
