# Kakao V4 command gateway

설계 버전: `KLOL_KAKAO_COMMAND_V4_2026_09_10_R1`

## 상태

- 소스 구현: 단일 gateway, profile 전용 authorization, 두 ES5 템플릿과 생성 스크립트.
- 실제 동작: `봇버전`·`도움말`은 봇 로컬 응답, `V4상태`·`V4계약확인`은 서명·profile 검증 후 서버 응답.
- 아직 미연결: V1 파티·내전·스크림·조회·운영 양식 dispatcher. 해당 입력은 성공으로 숨기지 않고 `501 KAKAO_V4_COMMAND_ROUTER_NOT_ENABLED`를 반환한다.
- 운영 반영: 없음. DB schema, 환경변수, 배포, 운영 봇을 변경하지 않는다.

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
       -> V4상태 / V4계약확인 OR explicit 501
```

V4는 실제 room ID, channel ID, room name을 body나 header로 받지 않는다. MessengerBot R callback의 `room`과 `channelId` 인자는 플랫폼 시그니처 때문에 존재하지만 읽거나 전송하지 않는다. `senderId`는 표시명 또는 안정 user hash의 HMAC fingerprint이며, 공개 명령 authorization은 sender role이나 환경 allowlist를 사용하지 않는다.

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

현재 in-memory receipt는 상태 변경이 없는 probe 두 개만 보호한다. V1 dispatcher를 연결하기 전에는 event receipt와 nonce claim을 기존 PostgreSQL 트랜잭션 receipt에 통합해야 한다.

## MessengerBot R 산출물

편집 원본은 공용 `KLOL_KAKAO_BOT_V4_SHARED.js`와 profile별 얇은 entry다. 다음 명령이 transport를 포함한 휴대폰 붙여넣기용 한 파일 두 개를 생성한다.

```powershell
npm run bot:kakao:v4
```

생성된 `*_MESSENGERBOT_R.js`만 각 휴대폰에 붙여넣는다. V1 dispatcher 연결과 실제 기기 QA 전에는 운영방에 설치하지 않는다.
