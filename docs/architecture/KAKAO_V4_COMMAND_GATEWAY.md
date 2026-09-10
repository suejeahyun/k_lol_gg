# Kakao V4 command gateway

설계 버전: `KLOL_KAKAO_COMMAND_V4_2026_09_10_R1`

## 상태

- 소스 구현: 단일 gateway, profile 전용 authorization, 전체 공개 V1 명령 dispatcher, 두 ES5 템플릿과 생성 스크립트.
- 실제 동작: `봇버전`·`도움말` 등은 봇 로컬 응답, 나머지 공개 V1 파티·내전·스크림·조회·운영 양식은 서명·profile 검증 후 canonical dispatcher가 처리한다.
- 차단 동작: 알 수 없는 명령과 internal/raw 입력은 `INVALID_FORM`, 교차 profile 명령은 `WRONG_PROFILE`로 fail-closed한다. 공개 V1 명령에 `501` 또는 `ROUTER_NOT_ENABLED` 경로는 없다.
- 검증 상태: 자동 contract·unit·typecheck·production build 통과. 운영 Vercel의 필수 환경변수 이름은 확인했으며 `KLOL_V2_KAKAO_IDENTITY_SECRET`은 아직 미설정이다. MessengerBot R 실기기 전환도 아직 수행하지 않았다.
- 운영 반영: 서버 코드는 2026-09-10 GitHub `main`과 Vercel Production에 배포됐다. V4 endpoint는 배포됐지만, 위 identity secret 설정과 같은 휴대폰의 두 봇 프로필 실기기 검증 전에는 기존 운영 봇에서 V4로 전환하지 않는다.

## 경계

```text
MessengerBot R
  -> local: 봇버전 / 도움말
  -> prefilter: empty / over 20,000 chars / bot echo
  -> raw text exactly once
  -> POST /api/integrations/kakao/v4/commands (5 second timeout)
       -> exact envelope + body size + query/header rejection
       -> V4 raw-body HMAC + timestamp
       -> installation -> canonical room -> profile capability
       -> eventId idempotency
       -> local/probe reply OR canonical V1 dispatcher
       -> unknown/internal/cross-profile fail-closed
```

V4는 실제 room ID, channel ID, room name을 body나 header로 받지 않는다. MessengerBot R callback의 `room`과 `channelId` 인자는 플랫폼 시그니처 때문에 존재하지만 읽거나 전송하지 않는다. `senderId`는 표시명 또는 안정 user hash의 HMAC fingerprint이며, 공개 명령 authorization은 sender role이나 환경 allowlist를 사용하지 않는다.

## 한 휴대폰·두 방 운영 토폴로지

V4의 기준 운영 형태는 **휴대폰 1대 + MessengerBot R 봇 프로필 2개 + 카카오톡 방 2개**다. 같은 휴대폰의 `DataBase`에 저장한 서버 주소·identity secret·signing secret·key ID를 두 프로필이 함께 읽는다. 다만 각 entry에 정적으로 고정된 `profileId`가 installation HMAC 재료에 포함되므로 RECRUIT와 FEATURES의 `installationId` 및 내부 room scope는 반드시 서로 다르다.

- RECRUIT 봇 프로필: MessengerBot R 앱에서 구인 관련방 하나만 응답 대상으로 선택한다.
- FEATURES 봇 프로필: MessengerBot R 앱에서 나머지 기능방 하나만 응답 대상으로 선택한다.
- 한 봇 프로필에 두 방을 동시에 선택하거나 두 프로필을 같은 방에 선택하지 않는다.
- 실제 방 격리는 MessengerBot R의 프로필별 응답 방 선택이 담당한다. callback의 `room` 문자열은 신뢰하거나 서버로 보내지 않는다.
- 교차 명령은 profile별 entry에서 서버 전송 없이 무응답 처리하며, 우회 전송돼도 서버 classifier가 `WRONG_PROFILE`로 거부한다.

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

- `profileId`: 소스에 정적으로 고정된 `RECRUIT` 또는 `FEATURES`.
- `installationId`: identity secret과 profile에서 만들어지는 안정 fingerprint.
- `senderId`: user hash가 있으면 이를, 없으면 표시명을 HMAC 처리한 fingerprint.
- `eventId`: log ID가 있으면 profile+log ID, 없으면 프로세스 시작 때 생성한 `bootId`와 증가 counter를 사용한다. message content hash는 사용하지 않는다.
- `timestamp`, `nonce`: replay window와 서명 신선도 입력.
- `text`: 파싱하지 않은 원문. 이미지 입력은 이번 범위에서 제외한다.

HTTP header는 `Content-Type`, `Accept`, `x-klol-key-id`, `x-klol-signature`, `Idempotency-Key`만 애플리케이션 계약으로 사용한다. `Idempotency-Key`는 `eventId`와 정확히 같아야 한다. `x-klol-room`, `x-klol-channel`, `x-klol-room-name`, `x-klol-sender`가 있으면 요청을 거부한다.

서명 material은 다음과 같다.

```text
KLOL_KAKAO_COMMAND_V4\n<keyId>\n<SHA-256(raw JSON body)>
```

## V1 계약

명령 분류와 exact reply의 기준은 `docs/contracts/KAKAO_V4_V1_COMPATIBILITY_CONTRACT.md`와 `tests/fixtures/kakao-v4-v1-compatibility-contract.json`이다. 선행 ASCII slash 0회/1회 동등성, slash 오탐 방지, canonical room 소유권, authoritative full snapshot, A→B→A revision 수용, V2 진단 분리를 유지한다.

V1 dispatcher는 기존 PostgreSQL 서비스에 연결되어 있다. 상태 변경과 서버 조회 응답은 기존 durable receipt·nonce 경계를 사용하며 같은 event/body 재전송은 replay, 같은 event의 다른 body는 conflict로 처리한다. application의 bounded in-memory receipt는 동일 프로세스 안의 빠른 재전송을 보조할 뿐 영속 경계를 대체하지 않는다.

## MessengerBot R 산출물

편집 원본은 공용 `KLOL_KAKAO_BOT_V4_SHARED.js`와 profile별 얇은 entry다. 다음 명령이 transport를 포함한 휴대폰 붙여넣기용 한 파일 두 개를 생성한다.

```powershell
npm run bot:kakao:v4
```

생성된 `*_MESSENGERBOT_R.js` 두 파일을 같은 휴대폰의 서로 다른 MessengerBot R 봇 프로필에 각각 붙여넣는다. 자동 검증과 실기기 QA가 모두 끝나기 전에는 운영방에 설치하지 않는다.
