# Kakao MessengerBot R V1 → V2 전환

상태: 코드·로컬 계약 준비. 운영 환경변수 변경, 실제 Kakao 호출, 운영 배포는 별도 승인 작업이다.

## 전환 원칙

- V1의 bearer/query/body secret 요청을 V2 요청으로 서버에서 대신 번역하지 않는다. 그렇게 하면 새 서명 키를 가진 발신자만 요청할 수 있다는 경계가 사라진다.
- V2는 JSON 문자열 **원문 그대로** SHA-256과 HMAC을 계산한 뒤 같은 바이트를 전송한다.
- 운영 봇은 canonical `POST /api/integrations/kakao/*`만 호출한다. mutation redirect는 사용하지 않는다.
- 구형 party/scrim URL은 `410 KAKAO_BOT_UPGRADE_REQUIRED`와 후속 경로만 반환한다. 요청 본문과 구형 secret은 읽거나 기록하지 않는다.

## 서버 환경 계약

필수:

- `KAKAO_WEBHOOK_SECRET_CURRENT`: 32 UTF-8 bytes 이상의 독립 난수 키
- `KAKAO_WEBHOOK_ALLOWED_ROOMS`: 쉼표로 구분한 opaque room ID
- `KAKAO_WEBHOOK_ALLOWED_SENDERS`: 쉼표로 구분한 opaque sender ID
- `KAKAO_WEBHOOK_BOT_SENDER_ID`: 봇 자신의 opaque sender ID
- `DATABASE_URL`, migration `0009`, `0018`, `0019`, `0022`, `0026`, `0027`, `0028`

선택:

- `KAKAO_WEBHOOK_KEY_ID_CURRENT`: 기본값 `current`
- `KAKAO_WEBHOOK_SECRET_PREVIOUS`, `KAKAO_WEBHOOK_KEY_ID_PREVIOUS`: 제한된 키 회전 기간에만 사용
- `KAKAO_WEBHOOK_PRINCIPAL_ID`: 기본값 `bot:kakao`; 자격증명이 아닌 감사 주체 라벨

DB의 `recruiting.kakao_operation_settings`도 `global_enabled=true`, `maintenance_mode=false`이고 사용할 기능이 활성화되어야 한다. 비밀값과 allowlist 원문은 DB나 관리자 화면에 저장하지 않는다.

### V1 환경변수와 V2 대응표

Vercel에 남아 있는 아래 V1 변수는 V2 canonical API가 읽지 않는다. 이름이 비슷해도 복사하거나 별칭으로 연결하지 않는다.

| V1 서버 변수 | 과거 MessengerBot R 변수 | V2 처리 |
| --- | --- | --- |
| `KAKAO_RECRUIT_SECRET` | `KLOL_KAKAO_RECRUIT_SECRET` | V2에 대응 없음. 새 독립 서명 키를 생성한다. |
| `KAKAO_SEARCH_PLAYER_SECRET` | `KLOL_KAKAO_SEARCH_PLAYER_SECRET` | V2에 대응 없음. 새 독립 서명 키를 생성한다. |
| `KAKAO_OPENCHAT_SECRET` | `KLOL_KAKAO_OPENCHAT_SECRET` | V2에 대응 없음. 새 독립 서명 키를 생성한다. |

V2는 endpoint별 bearer secret 대신 canonical Kakao API 전체에 하나의 HMAC signing key를 사용한다. V1 봇과 rollback 기간이 끝나기 전에는 V1 변수를 임의 삭제하지 않되, V2 동작 확인 근거로 보지 않는다.

| Vercel 서버 | MessengerBot R private `DataBase` | 값 관계와 용도 |
| --- | --- | --- |
| `KAKAO_WEBHOOK_SECRET_CURRENT` | `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT` | **동일한 값**. 각각 UTF-8 32 bytes 이상. 모든 V2 요청의 HMAC 서명/검증 키. |
| 없음 | `KLOL_V2_KAKAO_IDENTITY_SECRET` | 서버에 저장하지 않는 **별도 값**. 방·발신자 표시 이름을 opaque ID로 만드는 로컬 HMAC 키. signing key와 같으면 안 되고 signing key 회전 때 바꾸지 않는다. |
| `KAKAO_WEBHOOK_ALLOWED_ROOMS` | 직접 대응 없음 | `/V2연동확인`이 표시한 `room-` ID를 쉼표로 연결한다. 모든 canonical API에서 강제된다. |
| `KAKAO_WEBHOOK_ALLOWED_SENDERS` | 직접 대응 없음 | 허용할 `sender-` ID를 쉼표로 연결한다. 내전 신청, 관리 양식, 예약 공지, 이미지 접수에서 강제된다. |
| `KAKAO_WEBHOOK_BOT_SENDER_ID` | 직접 대응 없음 | 봇 계정 자신의 `sender-` ID. 모든 요청에서 self-message 차단에 사용되므로 유효한 단일 ID가 필요하다. |
| `KAKAO_WEBHOOK_KEY_ID_CURRENT` | 없음 | 비밀이 아닌 서버 감사/회전 라벨. 봇은 전송하지 않으며 기본값은 `current`. |
| `KAKAO_WEBHOOK_SECRET_PREVIOUS` / `KAKAO_WEBHOOK_KEY_ID_PREVIOUS` | 없음 | 회전 관측 기간에만 서버가 이전 서명을 함께 받는 용도. current와 다른 값/라벨을 쓴다. |
| `KAKAO_WEBHOOK_PRINCIPAL_ID` | 없음 | 비밀이 아닌 감사 주체 라벨. 기본값 `bot:kakao`. |
| 없음 | `KLOL_V2_BASE_URL` | 봇이 요청할 V2 환경의 HTTPS origin. 경로·쿼리·fragment 없이 `https://host` 형식만 허용한다. |
| 없음 | `KLOL_V2_ACTIVE_SEASON_ID` | 내전 현황·전체 신청 동기화에서 쓰는 현재 시즌 UUID. 다른 명령만 쓸 때는 불필요하다. |

`recruits`, `search-player`, `openchat`, `operation-forms`는 서명과 방 allowlist를 통과한 요청에 한해 임의 발신자를 허용한다. `season-applications`, `managed-forms`, `scheduled-notice`, `image-receive`는 발신자 allowlist도 요구한다. 두 부류 모두 bot sender 차단은 동일하다.

### 안전한 키 생성과 환경별 범위

32 random bytes를 64자리 hex 문자열로 만들면 UTF-8 길이 조건을 충족하고 복사 오류도 확인하기 쉽다. Windows PowerShell에서 아래 블록을 signing key용과 identity key용으로 **각각 새로 한 번씩** 실행한다. 값은 화면에 출력하지 않고 클립보드에만 넣으며, fingerprint는 동일 값 확인용일 뿐 비밀 대신 사용할 수 없다.

```powershell
$klolRandomBytes = New-Object byte[] 32
$klolRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$klolRng.GetBytes($klolRandomBytes)
$klolRng.Dispose()
$klolGeneratedSecret = -join ($klolRandomBytes | ForEach-Object { $_.ToString("x2") })
Set-Clipboard -Value $klolGeneratedSecret
$klolSha256 = [Security.Cryptography.SHA256]::Create()
$klolDigest = $klolSha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($klolGeneratedSecret))
$klolSha256.Dispose()
$klolFingerprint = (-join ($klolDigest | ForEach-Object { $_.ToString("x2") })).Substring(0, 12)
"새 비밀값을 클립보드에 복사했습니다. fingerprint=$klolFingerprint"
Remove-Variable klolRandomBytes, klolRng, klolGeneratedSecret, klolSha256, klolDigest, klolFingerprint
```

- Production signing key는 Production Vercel env와 Production을 향하는 봇 한 쌍에만 둔다.
- Preview/Development는 별도 signing key와 별도 봇 사본을 사용한다. Production signing key를 Preview에 재사용하지 않는다.
- identity key는 같은 봇/환경 안에서는 안정적으로 유지한다. 바꾸면 `room-`/`sender-` ID가 전부 달라져 allowlist와 방별 봇 상태를 다시 설정해야 한다.
- Vercel 값에는 따옴표, 앞뒤 공백, 줄바꿈을 포함하지 않는다. signing key 양쪽의 12자리 fingerprint만 로컬에서 비교하고 실제 값은 로그·채팅·스크린샷에 남기지 않는다.
- 클립보드 기록/기기 간 동기화가 켜져 있으면 잠시 끄고, 양쪽 설정을 마친 뒤 `Set-Clipboard -Value ""`로 지운다.
- current/previous signing key 및 key ID는 서로 다르게 둔다. previous는 회전 종료 후 제거한다.

봇 자신의 ID는 봇이 사용하는 Kakao 계정으로 허용 방에 `/V2연동확인`을 직접 입력해 나온 `sender-` 값을 쓴다. 일반 운영자도 각자 같은 명령을 보내 자신의 `sender-` 값을 확인한다. `room-` 값은 같은 방·같은 identity key에서 모두 같아야 한다.

### 설정 후 비밀 없는 확인

1. 전체본의 해시와 START/END sentinel을 설치 문서대로 확인하고 MessengerBot R에서 컴파일한다.
2. `/봇버전`이 `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT`를 반환하는지 확인한다.
3. `/V2연동확인`의 방/발신자 ID가 Vercel allowlist와 일치하는지 확인한다. 이 명령은 외부 요청 없이 로컬 identity key로 계산된다.
4. 먼저 `랭킹`, `구인현황` 같은 읽기 요청을 확인한 뒤, Preview에서만 테스트 모집 create → status → finish 또는 내전 신청 미리보기 → 확인을 검증한다.
5. 관리자 `/admin/kakao`에서 키 값이 아니라 current key/room/sender/bot sender의 configured 상태만 확인한다.
6. 401이면 서버 로그의 allowlisted reject code만 확인한다. `SIGNING_KEY_UNAVAILABLE`는 서버 current 누락, `INVALID_SIGNATURE`는 signing 값 불일치, `ROOM_FORBIDDEN`/`SENDER_FORBIDDEN`은 allowlist 불일치, `BOT_SELF_MESSAGE`는 bot ID/self header 차단이다. 503이면 DB migration과 `kakao_operation_settings` 상태를 확인한다.

저장소에서 실행하는 비파괴 계약 확인 명령은 다음과 같다.

```powershell
npm run bot:kakao:v41
node --check integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js
npx tsx --test tests/recruiting-security.test.ts tests/kakao-v2-transition.test.ts
node --test tests/kakao-v41-bot-contract.test.mjs
```

저장소에서 비밀 원문을 확인하거나 출력할 필요는 없다. 키 길이·형식·configured boolean과 양쪽 fingerprint 비교만으로 설정을 점검한다.

## MessengerBot R 준비

MessengerBot R에 바로 붙여 넣는 엔트리는 `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`다. `TRANSPORT.js`, `KLOL_KAKAO_BOT_V41_V1_COMPAT.js`, `ROUTER.js`를 수정했다면 `npm run bot:kakao:v41`로 완성본을 다시 생성하고 `node --check`를 통과시킨다. 기존 V40은 덮어쓰지 않는다.

1. MessengerBot R private `DataBase`에 `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT`를 저장한다.
2. 별도의 32 bytes 이상 난수 키를 `KLOL_V2_KAKAO_IDENTITY_SECRET`에 저장한다. 이 값은 서명 키 회전 때 바꾸지 않아야 opaque 방·발신자 ID가 유지된다.
3. `KLOL_V2_BASE_URL`에 검증할 HTTPS 운영/스테이징 origin을 반드시 저장한다. 소스에는 기본 운영 origin이 없으며, 미설정 상태에서는 외부 요청을 보내지 않는다.
4. V41 완성본을 별도 봇 사본에 붙여 넣고 `/V2연동확인`으로 나온 opaque 방·발신자 ID만 서버 allowlist에 등록한다. 이 ID는 표시 이름을 별도 키로 HMAC해 만들며 표시 이름 자체를 전송하지 않는다.
5. `/전적`, `구인현황`, `스크림현황`, `내전현황`과 내전 신청 양식은 V2 helper로 직접 전송된다. `내전현황`과 양식 동기화를 위해 `KLOL_V2_ACTIVE_SEASON_ID`에 현재 시즌 UUID를 저장한다. V39/V40의 문장형 파티·스크림 전체 양식과 운영 신청 4종도 호환 파서가 exact V2 body로 바꿔 전송하며, 구조화 운영자는 `/V2모집 <JSON>`을 사용할 수 있다.
6. 모집 mutation은 서버 응답의 `aggregateId`와 `revision`을 봇의 private storage에 저장하고 후속 명령에 사용한다. 최신 revision이 없으면 mutation을 보내지 않는다.
7. 이미지 수신은 공개 코드가 아니라 사이트 소유자가 먼저 만든 30분짜리 opaque `sessionId`만 사용한다.

완성본은 `response()`를 포함한 독립 실행 엔트리다. 전송부만 재사용할 때에만 `TRANSPORT.js`를 사용한다. V40 문장형 등록은 봇이 새 UUID·멱등 키를 만들고 서버가 반환한 revision을 방별 private storage에 보관한다. 서버가 구형 secret을 새 HMAC으로 승격하는 우회 경로는 제공하지 않는다. 봇이 만든 모집은 서명된 `sourceRoomId`에 묶여 같은 허용 방에서만 조회·수정된다.

### 소유자 사진 전송

1. 사용자가 봇에 `/V2연동확인`을 보내 opaque 방 ID와 발신자 ID를 받는다.
2. 경기 결과 접수 또는 내 사진 과제 화면의 `카카오톡으로 사진 보내기`에 두 값을 입력해 30분 세션을 발급한다.
3. 화면에서 복사한 `/V2사진세션 <UUID>`를 같은 대화방에 보내고 이미지를 차례로 전송한다.
4. `/사진상태`로 남은 시간과 연결 여부를 확인하고, 중단할 때는 사이트의 `세션 취소`와 봇의 `/사진취소`를 함께 실행한다.

방·발신자 표시 이름, 원본 메시지, 세션 UUID는 운영 로그나 QA 문서에 복사하지 않는다.

### 내전 참가 신청 공통 양식

사이트와 봇은 `플레이어 + 신청일 + 회차`를 동일 신청의 기준으로 사용하며 주라인과 부라인을 같은 구조로 주고받는다. V41이 출력한 아래 형식은 그대로 다시 입력할 수 있다.

```text
[K-LOL.GG 내전 참가 신청]
신청일: 2026-09-08
회차: #1
1. 플레이어: 별빛 | Riot ID: 별빛#KR1 | 주라인: MID | 부라인: SUP, ADC | 상태: 신청 | 출처: SITE
```

- 사이트에서 승인 계정으로 저장하면 동일한 카카오 신청 행을 새로 만들지 않고 SITE 신청으로 승격한다. SITE의 라인 선택과 완료된 관리자 판정이 후속 카카오 스냅샷보다 우선한다.
- 봇은 SITE 신청을 취소하거나 덮어쓰지 않는다. 카카오에서만 생성된 미검토 신청과 확인 대기 행만 스냅샷에 맞춰 갱신한다.
- 공개 사이트와 봇 현황의 확인된 플레이어 표시는 닉네임·Riot ID·라인으로 제한한다. 회원명, 로그인 ID, Discord, 관리자 메모, 원본 해시는 응답에 포함하지 않는다. 자동 매칭하지 못한 봇 입력명은 서명·허용 목록이 검증된 운영자용 봇 응답과 관리자 검토 화면에서만 사용한다.

## 요청 계약

모든 요청에 다음 header가 필요하다.

- `Content-Type: application/json; charset=utf-8`
- `x-klol-timestamp`: 현재 Unix seconds, 서버와 최대 5분 차이
- `x-klol-nonce`: 요청마다 새 16~100자 opaque 값
- `x-klol-room`, `x-klol-sender`, `x-klol-bot-self`
- `x-klol-signature: v1=<hex HMAC-SHA256>`
- `Idempotency-Key`; 모집 mutation에는 `If-Match: "<revision>"`도 필요

서명 문자열은 아래 여섯 줄을 LF로 연결한다.

```text
KLOL_KAKAO_WEBHOOK_V1
<timestampSeconds>
<nonce>
<roomId>
<senderId>
<sha256(rawBody)>
```

## 무중단 전환 순서

1. 별도 preview/스테이징 DB에 migration `0009`, `0018`, `0019`, `0022`, `0026`~`0028`과 `kakao_operation_settings` singleton을 확인한다.
2. 새 키와 opaque allowlist를 스테이징 서버·V41 봇 사본에만 주입한다.
3. player search/status처럼 읽기 영향이 작은 명령으로 정상·만료 timestamp·잘못된 room을 각각 한 번 검증한다.
4. party create → status → sync → finish를 테스트 데이터로 검증하고 `aggregateId`/`revision` 저장을 확인한다.
5. 스크림 문장형 전체 양식으로 create → status → detail을 확인하고 양 팀 5포지션 라인업·메모·진행 방식·일시가 보존되는지 검증한다. 기존 UUID 기반 구조화 명령도 같은 계약으로 확인한다.
6. V41을 운영 봇으로 전환한 뒤 V1 봇은 중지한다. 동일 메시지를 두 봇이 동시에 mutation하지 않게 한다.
7. 회전 시 서버에 previous/current를 함께 두고 봇을 current로 바꾼 다음, 관측 기간 후 previous를 제거한다.

## 비밀 없는 장애 판정

서버는 외부 응답을 계속 일반 401로 유지하지만 내부 로그에 `KAKAO_WEBHOOK_REJECTED`와 아래 allowlisted code만 남긴다.

- `SIGNING_KEY_UNAVAILABLE`: 서버 current key 미설정
- `QUERY_FORBIDDEN`, `BODY_INVALID`, `BOT_SELF_HEADER_INVALID`, `INVALID_REQUEST`
- `INVALID_SIGNATURE`, `EXPIRED_TIMESTAMP`
- `ROOM_FORBIDDEN`, `SENDER_FORBIDDEN`, `BOT_SELF_MESSAGE`

로그에는 body, signature, nonce, room/sender ID, 환경변수 값이 포함되지 않는다. 401이면 위 코드를 먼저 확인하고, 503이면 DB 연결·0022 singleton·0026~0028 모집 호환 스키마·global/maintenance/개별 feature를 확인한다. 409/412이면 idempotency key 또는 revision을 갱신한다.

## 롤백

V41 배포만 중지하고 V1 서비스가 아직 살아 있는 기간에는 V40으로 되돌릴 수 있다. V2 서버가 기본 코드가 된 뒤에는 구형 secret 계약을 다시 켜지 않는다. 문제가 있으면 V2 Kakao DB feature를 끄고 봇을 중지한 다음 원인을 수정한다. 데이터 삭제나 V1 public 테이블 변경은 필요하지 않다.
