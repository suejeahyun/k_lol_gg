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
- `DATABASE_URL`, migration `0009`, `0018`, `0019`, `0022`

선택:

- `KAKAO_WEBHOOK_KEY_ID_CURRENT`: 기본값 `current`
- `KAKAO_WEBHOOK_SECRET_PREVIOUS`, `KAKAO_WEBHOOK_KEY_ID_PREVIOUS`: 제한된 키 회전 기간에만 사용
- `KAKAO_WEBHOOK_PRINCIPAL_ID`: 기본값 `bot:kakao`; 자격증명이 아닌 감사 주체 라벨

DB의 `recruiting.kakao_operation_settings`도 `global_enabled=true`, `maintenance_mode=false`이고 사용할 기능이 활성화되어야 한다. 비밀값과 allowlist 원문은 DB나 관리자 화면에 저장하지 않는다.

## MessengerBot R 준비

MessengerBot R에 바로 붙여 넣는 엔트리는 `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`다. `TRANSPORT.js`와 `ROUTER.js`를 수정했다면 `node scripts/build-messengerbot-v41.mjs`로 완성본을 다시 생성하고 `node --check`를 통과시킨다. 기존 V40은 덮어쓰지 않는다.

1. MessengerBot R private `DataBase`에 `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT`를 저장한다.
2. 별도의 32 bytes 이상 난수 키를 `KLOL_V2_KAKAO_IDENTITY_SECRET`에 저장한다. 이 값은 서명 키 회전 때 바꾸지 않아야 opaque 방·발신자 ID가 유지된다.
3. 필요하면 `KLOL_V2_BASE_URL`에 HTTPS 운영/스테이징 origin을 저장한다. 미설정 시 공식 운영 origin을 사용한다.
4. V41 완성본을 별도 봇 사본에 붙여 넣고 `/V2연동확인`으로 나온 opaque 방·발신자 ID만 서버 allowlist에 등록한다. 이 ID는 표시 이름을 별도 키로 HMAC해 만들며 표시 이름 자체를 전송하지 않는다.
5. `/전적`, `구인현황`, `스크림현황`, `내전현황`과 내전 신청 양식은 V2 helper로 직접 전송된다. `내전현황`과 양식 동기화를 위해 `KLOL_V2_ACTIVE_SEASON_ID`에 현재 시즌 UUID를 저장한다. 파티·스크림 mutation은 `/V2모집 <JSON>`의 exact V2 body를 사용한다.
6. 모집 mutation은 서버 응답의 `aggregateId`와 `revision`을 봇의 private storage에 저장하고 후속 명령에 사용한다. 최신 revision이 없으면 mutation을 보내지 않는다.
7. 이미지 수신은 공개 코드가 아니라 사이트 소유자가 먼저 만든 30분짜리 opaque `sessionId`만 사용한다.

완성본은 `response()`를 포함한 독립 실행 엔트리다. 전송부만 재사용할 때에만 `TRANSPORT.js`를 사용한다. V40의 free-text 파티·스크림 등록은 V2가 요구하는 UUID·revision을 안전하게 만들 수 없으므로 자동 변환하지 않고 사이트 또는 `/V2모집`으로 안내한다. 서버가 구형 secret을 새 HMAC으로 승격하는 우회 경로는 제공하지 않는다.

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

1. 별도 preview/스테이징 DB에 migration과 `kakao_operation_settings` singleton을 확인한다.
2. 새 키와 opaque allowlist를 스테이징 서버·V41 봇 사본에만 주입한다.
3. player search/status처럼 읽기 영향이 작은 명령으로 정상·만료 timestamp·잘못된 room을 각각 한 번 검증한다.
4. party create → status → sync → finish를 테스트 데이터로 검증하고 `aggregateId`/`revision` 저장을 확인한다.
5. scrim은 운영자가 제공한 tournament/team UUID로 같은 흐름을 검증한다.
6. V41을 운영 봇으로 전환한 뒤 V1 봇은 중지한다. 동일 메시지를 두 봇이 동시에 mutation하지 않게 한다.
7. 회전 시 서버에 previous/current를 함께 두고 봇을 current로 바꾼 다음, 관측 기간 후 previous를 제거한다.

## 비밀 없는 장애 판정

서버는 외부 응답을 계속 일반 401로 유지하지만 내부 로그에 `KAKAO_WEBHOOK_REJECTED`와 아래 allowlisted code만 남긴다.

- `SIGNING_KEY_UNAVAILABLE`: 서버 current key 미설정
- `QUERY_FORBIDDEN`, `BODY_INVALID`, `BOT_SELF_HEADER_INVALID`, `INVALID_REQUEST`
- `INVALID_SIGNATURE`, `EXPIRED_TIMESTAMP`
- `ROOM_FORBIDDEN`, `SENDER_FORBIDDEN`, `BOT_SELF_MESSAGE`

로그에는 body, signature, nonce, room/sender ID, 환경변수 값이 포함되지 않는다. 401이면 위 코드를 먼저 확인하고, 503이면 DB 연결·0022 singleton·global/maintenance/개별 feature를 확인한다. 409/412이면 idempotency key 또는 revision을 갱신한다.

## 롤백

V41 배포만 중지하고 V1 서비스가 아직 살아 있는 기간에는 V40으로 되돌릴 수 있다. V2 서버가 기본 코드가 된 뒤에는 구형 secret 계약을 다시 켜지 않는다. 문제가 있으면 V2 Kakao DB feature를 끄고 봇을 중지한 다음 원인을 수정한다. 데이터 삭제나 V1 public 테이블 변경은 필요하지 않다.
