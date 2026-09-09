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
- `KAKAO_WEBHOOK_BOT_SENDER_ID`: 봇 자신의 opaque sender ID
- `DATABASE_URL`, migration head `0033_tan_sprite`

선택:

- `KAKAO_WEBHOOK_KEY_ID_CURRENT`: 기본값 `current`
- `KAKAO_WEBHOOK_SECRET_PREVIOUS`, `KAKAO_WEBHOOK_KEY_ID_PREVIOUS`: 제한된 키 회전 기간에만 사용
- `KAKAO_WEBHOOK_ALLOWED_ROOMS`: 구형 값을 명시적인 일회성·비상 bootstrap으로 이관할 때만 임시 사용. 정상 방 권한 판정에는 사용하지 않는다.
- `KAKAO_WEBHOOK_ALLOWED_SENDERS`: 구형 bootstrap 초기 ADMIN 이관에만 사용. 일반 요청·raw-V2 권한 판정에는 사용하지 않는다.
- `KAKAO_WEBHOOK_PRINCIPAL_ID`: 기본값 `bot:kakao`; 자격증명이 아닌 감사 주체 라벨
- `KAKAO_RAW_RECRUIT_COMMANDS_DEVELOPMENT_ONLY`: Production 이외 환경에서만 `/V2모집 <JSON>`을 명시적으로 허용하려면 정확히 `true`. 운영에서는 설정하지 않는다.

DB의 `recruiting.kakao_operation_settings`도 `global_enabled=true`, `maintenance_mode=false`이고 사용할 기능이 활성화되어야 한다. R14.2의 방 scope는 `kakao_bot_installations.canonical_room_id`와 `kakao_room_members`에서 판정한다. `kakao_room_bindings`는 구형 이관·진단 기록이며 정상 요청 라우팅에는 사용하지 않는다. 비밀값과 bootstrap 원문은 DB나 관리자 화면에 저장하지 않는다.

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
| 없음 | `KLOL_V2_KAKAO_IDENTITY_SECRET` | 서버에 저장하지 않는 **별도 값**. 설치본 ID와 opaque 발신자 ID를 만드는 로컬 HMAC 키. signing key와 같으면 안 되고 signing key 회전 때 바꾸지 않는다. |
| `KAKAO_WEBHOOK_ALLOWED_ROOMS` | 직접 대응 없음 | 정상 권한 판정에서는 읽지 않는다. 구형 room ID를 DB registry로 명시적 일회성 bootstrap할 때만 임시 사용한다. |
| `KAKAO_WEBHOOK_ALLOWED_SENDERS` | 직접 대응 없음 | 정상 역할·raw-V2 판정에서는 읽지 않는다. 구형 sender를 bootstrap 방의 초기 ADMIN으로 이관할 때만 사용한다. |
| `KAKAO_WEBHOOK_BOT_SENDER_ID` | 직접 대응 없음 | 봇 계정 자신의 `sender-` ID. 모든 요청에서 self-message 차단에 사용되므로 유효한 단일 ID가 필요하다. |
| `KAKAO_WEBHOOK_KEY_ID_CURRENT` | `KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT` | **동일한 공개 라벨**. R14 V3 서명에 포함되며 검증에 성공한 서버 key ID와 일치해야 한다. |
| `KAKAO_WEBHOOK_SECRET_PREVIOUS` / `KAKAO_WEBHOOK_KEY_ID_PREVIOUS` | 없음 | 회전 관측 기간에만 서버가 이전 서명을 함께 받는 용도. current와 다른 값/라벨을 쓴다. |
| `KAKAO_WEBHOOK_PRINCIPAL_ID` | 없음 | 비밀이 아닌 감사 주체 라벨. 기본값 `bot:kakao`. |
| 없음 | `KLOL_V2_BASE_URL` | 봇이 요청할 V2 환경의 HTTPS origin. 경로·쿼리·fragment 없이 `https://host` 형식만 허용한다. |
| 없음 | `KLOL_V2_ACTIVE_SEASON_ID` | 내전 현황·전체 신청 동기화에서 쓰는 현재 시즌 UUID. 다른 명령만 쓸 때는 불필요하다. |

`search-player`, `openchat`, `operation-forms`, member-safe `managed-forms`, 내전 snapshot `SYNC`/`STATUS`, 모집 생성·조회와 스크림 참가는 유효한 HMAC과 ACTIVE canonical 방 binding을 통과한 요청에 한해 모든 발신자를 MEMBER로 허용한다. pairing 전 일반 API는 `ROOM_BINDING_REQUIRED`로 차단되고, 휴대폰 로컬의 `/봇버전`, `/V2연동확인`, 도움말과 서명된 일회용 `/V2방연동 CODE`만 사용할 수 있다. 운영 양식 검토·삭제는 Kakao 명령으로 제공하지 않고 웹 ADMIN 세션을 요구한다. 모집 동기화·종료·취소·재개·확정·완료는 aggregate 생성자·상대 팀장 또는 canonical 방 MANAGER/ADMIN 역할로 제한한다. 다른 canonical 방의 aggregate 조회·변경은 404로 숨긴다. 모든 부류에서 bot sender 차단은 동일하다.

| 모집 명령 | Kakao 권한 |
| --- | --- |
| `CREATE_PARTY`, `CREATE_SCRIM` | ACTIVE canonical 방의 모든 MEMBER |
| `GET_PARTY_STATUS` | 같은 원본 방의 일반 발신자 |
| `JOIN_SCRIM` | 같은 원본 방의 일반 발신자; 성공한 발신자를 상대 팀장으로 귀속 |
| `SYNC_*`, `FINISH_PARTY`, `CANCEL_*`, `REOPEN_SCRIM`, `CONFIRM_SCRIM`, `COMPLETE_SCRIM` | 생성자·상대 팀장·canonical 방 MANAGER/ADMIN |
| `RESET_PARTY` | Kakao 경로 거부 |
| `/V2모집 <JSON>` | 설치본 내부 경계와 명시적 비운영 개발 모드에만 허용; 일반 MEMBER 명령으로 승격하지 않는다. |

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
- identity key는 같은 봇/환경 안에서는 안정적으로 유지한다. 바꾸면 설치본 ID와 `sender-*` ID가 모두 달라져 새 설치본으로 다시 pairing해야 한다.
- Vercel 값에는 따옴표, 앞뒤 공백, 줄바꿈을 포함하지 않는다. signing key 양쪽의 12자리 fingerprint만 로컬에서 비교하고 실제 값은 로그·채팅·스크린샷에 남기지 않는다.
- 클립보드 기록/기기 간 동기화가 켜져 있으면 잠시 끄고, 양쪽 설정을 마친 뒤 `Set-Clipboard -Value ""`로 지운다.
- current/previous signing key 및 key ID는 서로 다르게 둔다. previous는 회전 종료 후 제거한다.

봇 자신의 ID는 봇이 사용하는 Kakao 계정으로 `/V2연동확인`을 직접 입력해 나온 `sender-*` 값을 쓴다. 일반 운영자도 각자 같은 명령을 보내 자신의 opaque 발신자 ID를 확인한다. `sender-user-*`는 callback userHash 기반이고, 표시명 fallback인 `sender-display-*`는 동명이인·닉네임 변경 위험 때문에 MEMBER로만 처리된다.

### 설정 후 비밀 없는 확인

1. 전체본의 해시와 START/END sentinel을 설치 문서대로 확인하고 MessengerBot R에서 컴파일한다.
2. `/봇버전`과 `봇버전`이 모두 설치 대상 버전을 반환하는지 확인한다.
3. `/V2연동확인`의 설치본·발신자 ID를 확인하고, 미등록 설치본이면 사이트 SUPER 관리자가 발급한 코드를 그 설치본에서 `/V2방연동 CODE`로 한 번 사용한다.
4. 먼저 `랭킹`, `구인현황` 같은 읽기 요청을 확인한 뒤, Preview에서만 테스트 모집 create → status → finish 또는 내전 신청 미리보기 → 확인을 검증한다.
5. 관리자 `/admin/kakao/rooms`에서 canonical 방 상태, 설치본 binding, MEMBER/MANAGER/ADMIN 역할을 확인한다. 키·fingerprint 원문은 화면이나 로그에 노출하지 않는다.
6. 서버 로그의 제한된 reject code와 stage만 확인한다. `SIGNING_KEY_UNAVAILABLE`/`INVALID_SIGNATURE`/`INSTALLATION_KEY_MISMATCH`는 401 설치본 인증 오류, `INSTALLATION_REVOKED`는 403 회수 상태, `ROOM_BINDING_REQUIRED`는 403 pairing 필요, `ROOM_PAUSED`/`ROOM_NOT_REGISTERED`는 canonical 방 상태 오류, `ROLE_FORBIDDEN`은 역할 부족, `BOT_SELF_MESSAGE`는 bot ID/self header 차단이다. 503이면 DB 연결과 migration head `0033`을 우선 확인하며 DB 장애는 우회 허용하지 않는다.

### R14.2 설치본 scope 진단

V41 R14.2는 MessengerBot R callback의 `room`, `channelId`, `isGroupChat`을 인증·라우팅·로컬 상태 key·delivery ID에 사용하지 않는다. 서버로 보내는 `room-*` header는 실제 방 문자열이 아니라 공개 installation ID에서 domain-separated SHA-256으로 파생한 고정 scope다. HMAC V3가 이 scope를 포함해 서명하며 서버도 기대값을 다시 계산하므로 alternate scope 주입은 거부된다. signing key가 current에서 previous/current로 회전해도 scope는 바뀌지 않는다.

1. `/봇버전`으로 R14.2와 설치본 ID·key ID를 확인한다.
2. `/V2연동확인`으로 같은 설치본 ID와 opaque 발신자 ID가 나오는지 확인한다. 실제 room ID는 출력하지 않는다.
3. `/V2진단`의 403 `ROOM_BINDING_REQUIRED`는 parser 오류가 아니라 정상적인 미페어링 상태다. SUPER 관리자가 canonical 방용 코드를 발급하고 `/V2방연동 CODE`를 한 번 실행한다.
4. pairing 뒤 `/V2진단`이 200인지 확인하고 `5인파티`, `2인파티`, `/구인현황`, 운영 양식을 순서대로 확인한다.
5. `ROOM_PAUSED`/`ROOM_NOT_REGISTERED`는 registry 상태를 복구하며 DB 장애 시에는 fail-closed 상태를 유지한다.

**봇 설치본 하나는 실제 카카오톡 방 하나에서만 실행한다.** 동일 identity secret/설치본을 여러 실제 방에서 구독하면 서버가 방을 구분할 정보가 없으므로 데이터·멤버 권한이 하나로 합쳐진다. 이는 코드로 탐지할 수 없다. 방마다 별도 identity secret, 별도 installation ID, 별도 봇 프로필을 발급한다.

2026-09-09 외출 접수 장애의 읽기 전용 production 로그에서는 12:18:33.050, 15:36:49.894, 15:36:58.649, 15:37:05.579 KST 요청이 모두 `/api/integrations/kakao/operation-forms`의 `ROOM_FORBIDDEN`으로 DB 진입 전에 종료됐다. 이 경로는 당시에도 일반 발신자를 허용했고 HMAC 검증 뒤 room을 판정하므로 원인은 room allowlist 불일치로 확정한다. 확인된 probe ID는 저장소에 복사하지 않고 운영 환경 값과 대조한다.

같은 날 별도 운영 hotfix로 기존 room 1개를 보존한 채 확인된 room 1개를 추가했다(정규화 2개, duplicate 0, wildcard 없음). sender/secret/다른 env는 바꾸지 않았고, 기존 source SHA `e408bdd50260b9f48ebea5ee509d34aced295ca6`를 `dpl_7ggWSkbjf3Qq9aoQaGT8Bn6hf2ue`로 재배포해 production health 200과 DB `select 1`을 확인했다. Vercel env history를 rollback 근거로 유지한다. 이 확인은 R8 코드 배포 증거가 아니며, 실제 양식 재전송 후 `ROOM_FORBIDDEN` 소멸과 2xx/정확한 400을 추가 확인해야 한다.

저장소에서 실행하는 비파괴 계약 확인 명령은 다음과 같다.

```powershell
npm run bot:kakao:v41
node --check integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js
npx tsx --test tests/recruiting-security.test.ts tests/kakao-v2-transition.test.ts
node --test tests/kakao-v41-bot-contract.test.mjs
npm run bot:kakao:audit
```

저장소에서 비밀 원문을 확인하거나 출력할 필요는 없다. 키 길이·형식·configured boolean과 양쪽 fingerprint 비교만으로 설정을 점검한다.

## MessengerBot R 준비

MessengerBot R 휴대폰에 바로 붙여 넣는 엔트리는 65,535자 미만의 `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js`다. `KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`는 개발·검토용이다. `TRANSPORT.js`, `KLOL_KAKAO_BOT_V41_V1_COMPAT.js`, `ROUTER.js`를 수정했다면 `npm run bot:kakao:v41`로 두 생성본을 다시 만들고 `node --check`와 생성 동일성 테스트를 통과시킨다. 기존 V40은 덮어쓰지 않는다.

1. MessengerBot R private `DataBase`에 `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT`를 저장한다.
2. 서버 current key ID와 같은 공개 라벨을 `KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT`에 저장한다.
3. 별도의 32 bytes 이상 난수 키를 `KLOL_V2_KAKAO_IDENTITY_SECRET`에 저장한다. 이 값은 서명 키 회전 때 바꾸지 않아야 installation·발신자 ID가 유지된다. 실제 카카오톡 방마다 다른 값을 쓴다.
4. `KLOL_V2_BASE_URL`에 검증할 HTTPS 운영/스테이징 origin을 반드시 저장한다. 소스에는 기본 운영 origin이 없으며, 미설정 상태에서는 외부 요청을 보내지 않는다.
5. V41 완성본을 별도 봇 사본에 붙여 넣고 `/V2연동확인`으로 설치본·opaque 발신자 ID를 확인한다. 사이트 SUPER 관리자가 새 canonical 방 또는 기존 방 대상의 일회용 코드를 발급하고, 그 설치본에서 `/V2방연동 CODE`를 실행한다.
6. `/전적`, `구인현황`, `스크림현황`, `내전현황`과 내전 신청 양식은 V2 helper로 직접 전송된다. `내전현황`과 양식 동기화를 위해 `KLOL_V2_ACTIVE_SEASON_ID`에 현재 시즌 UUID를 저장한다. V39/V40의 문장형 파티·스크림 전체 양식과 운영 신청 4종도 호환 파서가 exact V2 body로 바꿔 전송하며, 구조화 운영자는 `/V2모집 <JSON>`을 사용할 수 있다.
7. 모집 mutation은 서버 응답의 `aggregateId`와 `revision`을 봇의 private storage에 저장하고 후속 명령에 사용한다. 최신 revision이 없으면 mutation을 보내지 않는다.
8. 이미지 수신은 공개 코드가 아니라 사이트 소유자가 먼저 만든 30분짜리 opaque `sessionId`만 사용한다.

완성본은 `response()`를 포함한 독립 실행 엔트리다. 전송부만 재사용할 때에만 `TRANSPORT.js`를 사용한다. R14.2 문장형 등록은 delivery ID에서 결정한 UUID·멱등 키를 만들고 서버가 반환한 revision을 설치본 scope의 private storage에 보관한다. 서버가 구형 secret을 새 HMAC으로 승격하는 우회 경로는 제공하지 않는다. 봇이 만든 모집은 authorization 뒤 해석된 canonical `sourceRoomId`에 묶여 같은 canonical 방에서만 조회·수정된다.

R14.1 이하에서 R14.2로 교체하면 private storage key가 legacy room fingerprint에서 installation scope로 바뀐다. 교체 전 진행 중 모집 수정·내전 미리보기·사진 세션을 마치거나 취소하고, 교체 뒤 새로 시작한다. 서버의 기존 모집·신청·사진 데이터는 삭제하지 않는다.

### 소유자 사진 전송

1. 사용자가 봇에 `/V2연동확인`을 보내 설치본 ID와 opaque 발신자 ID를 받는다.
2. 경기 결과 접수 또는 내 사진 과제 화면의 `카카오톡으로 사진 보내기`에 설치본 ID와 발신자 ID를 입력해 30분 세션을 발급한다. 서버는 installation scope와 canonical room을 함께 호환 검증한다.
3. 화면에서 복사한 `/V2사진세션 <UUID>`를 같은 대화방에 보내고 이미지를 차례로 전송한다.
4. `/사진상태`로 남은 시간과 연결 여부를 확인하고, 중단할 때는 사이트의 `세션 취소`와 봇의 `/사진취소`를 함께 실행한다.

방·발신자 표시 이름, 원본 메시지, 세션 UUID는 운영 로그나 QA 문서에 복사하지 않는다.

### 내전 참가 신청 공통 양식

사이트와 봇은 플레이어 identity를 공유하지만, Kakao authoritative sync 범위는 `opaque sourceRoomId hash + 신청일 + 회차 + 모드`다. 주라인과 부라인은 같은 구조로 주고받는다. V41이 출력한 전체 형식은 맨 앞의 `/` 또는 전각 `／` 한 글자를 붙여도 동일하게 처리한다.

```text
[K-LOL.GG 내전 참가 신청]
신청일: 2026-09-08
회차: #1
종목: 협곡
정원: 10명
*참가 신청 양식*
1. 플레이어: 별빛 | Riot ID: 별빛#KR1 | 주라인: MID | 부라인: SUP, ADC | 상태: 신청 | 출처: SITE
2.
...
10.
```

- 사이트에서 승인 계정으로 저장하면 동일한 카카오 신청 행을 새로 만들지 않고 SITE 신청으로 승격한다. SITE의 라인 선택과 완료된 관리자 판정이 후속 카카오 스냅샷보다 우선한다.
- 봇은 SITE 신청을 취소하거나 덮어쓰지 않는다. 카카오에서만 생성된 미검토 신청과 확인 대기 행만 스냅샷에 맞춰 갱신한다.
- 헤더의 날짜·회차·협곡 모드·정원과 1번부터 정원까지의 전체 슬롯을 모두 확인한 경우에만 누락 신청을 철회한다. 완전한 빈 1~10 양식은 0명 동기화이며, 일부 슬롯이 빠진 빈 입력은 대량 철회를 막기 위해 거부한다.
- 누락된 같은 범위 KAKAO 신청은 hard delete하지 않고 `CANCELLED`로 전환한다. SITE, 관리자 확정/예비/거절, 다른 방·날짜·회차·모드는 변경하지 않는다.
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

## canonical 방 registry 동시 전환 순서

R8 서버는 출처 표식 없는 R7 모집 body를 거부하고, R8 봇이 보내는 출처 표식은 R7 서버의 exact-key 파서가 거부한다. 따라서 이 버전은 서버와 휴대폰을 혼용하는 무중단 전환 대상이 아니다. 짧은 Kakao 모집 변경 점검 시간을 잡고 아래 순서를 한 묶음으로 실행한다.

1. 별도 preview/스테이징 DB에 migration `0009`, `0018`, `0019`, `0022`, `0026`~`0030`과 `kakao_operation_settings` singleton을 확인한다.
2. 새 signing key를 스테이징 서버·V41 봇 사본에만 주입하고, 방은 스테이징 DB에서 pairing한다.
3. player search/status처럼 읽기 영향이 작은 명령으로 정상·만료 timestamp·잘못된 room을 각각 한 번 검증한다.
4. party create → status → sync → finish를 테스트 데이터로 검증하고 `aggregateId`/`revision` 저장을 확인한다.
5. 스크림 문장형 전체 양식으로 create → status → detail을 확인하고 양 팀 5포지션 라인업·메모·진행 방식·일시가 보존되는지 검증한다. 기존 UUID 기반 구조화 명령도 같은 계약으로 확인한다.
6. 운영 모집 변경을 잠시 중지하고 저장→정상 종료→백업 뒤 migration `0030`, `0031`, `0032`, 서버, R14 휴대폰 전체본을 연속 적용한다. 이전 봇과 같은 방을 구독하는 다른 스크립트·프로필은 모두 중지한다.
7. 생성자·같은 방 타 발신자·운영자와 다른 방 fixture로 2xx/403/404를 확인하고, 완전한 2명→0명 내전 양식이 SITE/관리자 확정/다른 방·회차를 보존하는지 확인한다.
8. 회전 시 서버에 previous/current를 함께 두고 봇을 current로 바꾼 다음, 관측 기간 후 previous를 제거한다.

## 비밀 없는 장애 판정

서버는 외부 응답을 계속 일반 401로 유지하지만 내부 로그에 `KAKAO_WEBHOOK_REJECTED`와 아래 allowlisted code만 남긴다.

- `SIGNING_KEY_UNAVAILABLE`: 서버 current key 미설정
- `QUERY_FORBIDDEN`, `BODY_INVALID`, `BOT_SELF_HEADER_INVALID`, `INVALID_REQUEST`
- `INVALID_SIGNATURE`, `EXPIRED_TIMESTAMP`
- `ROOM_BINDING_REQUIRED`, `ROOM_NOT_REGISTERED`, `ROOM_PAUSED`, `ROLE_FORBIDDEN`, `BOT_SELF_MESSAGE`

각 로그에는 `SIGNATURE`, `ROOM_REGISTRY`, `ROLE`, `SENDER` 중 하나의 stage가 함께 남는다. ID나 비밀값은 남기지 않는다.

로그에는 body, signature, nonce, room/sender ID, 환경변수 값이 포함되지 않는다. 401이면 위 코드를 먼저 확인하고, 503이면 DB 연결·migration `0031`·0022 singleton·기능 설정을 확인한다. 403은 pairing/방 상태/역할 또는 raw V2 제한, 404는 다른 canonical 방 aggregate 접근 은닉을 우선 확인한다. 409/412이면 idempotency key 또는 revision을 갱신한다.

## 롤백

R8 서버와 R8 휴대폰은 함께 롤백한다. 한쪽만 R7로 되돌리면 모집 body exact-key 검사가 실패한다. V2 서버가 기본 코드가 된 뒤에는 구형 secret 계약을 다시 켜지 않는다. 문제가 있으면 V2 Kakao DB feature를 끄고 봇을 중지한 다음 원인을 수정한다. `0030`의 nullable provenance 열과 상태 행은 그대로 두며 데이터를 삭제하지 않는다. 기존 provenance가 없는 KAKAO 행은 새 authoritative sync가 임의 철회하지 않으므로 운영자가 별도로 검토한다.
