# ADR 0008: 카카오봇 V1 사용자 동작을 동결하고 V4 서명 전송으로 교체한다

- 상태: 채택, 휴대폰 설치본 생성 완료·실기기 교체 전
- 날짜: 2026-09-11
- 대상: MessengerBot R 단일 설치본, 구인 기능방과 나머지 기능방

## 배경

운영자가 원하는 것은 새 명령 체계가 아니라 V1 카카오봇을 사용하던 사람이 같은 명령, 양식, 줄바꿈과 응답 순서로 계속 사용하는 것이다. 기준 V1은 `6.k_lol_gg_v1_blueblack_baseline/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js`이며 확인된 SHA-256은 `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7`이다.

V1 파일을 그대로 다시 설치할 수는 없다. 이 파일은 폐기된 `/api/kakao/*` bearer·본문 secret 계약을 호출하고, 서버의 `legacy-kakao-recruit-transition.ts`는 해당 요청을 의도적으로 HTTP 410 `KAKAO_BOT_UPGRADE_REQUIRED`로 거부한다. 반면 현재 V4는 raw body HMAC, timestamp, nonce, installation 범위, event idempotency와 5초 단일 요청 경계를 제공하고 V2의 모집·조회·운영 양식 서비스와 PostgreSQL 저장소에 연결되어 있다.

현재 V4의 `classifier.ts`, `canonical-command.ts`, `dispatcher.ts`와 `application.ts`가 만든 사용자 문구는 V1을 참고해 새로 구현한 코드다. 따라서 V1 원본과 다른 별칭, 라우팅 우선순위, 기본값 노출 시점, 응답 문구가 생길 수 있다. 이 코드는 도메인·저장소 연결에는 재사용할 수 있지만 V1 사용자 동작의 원본으로 간주하지 않는다.

## 결정

### 1. V1을 사용자 동작 커널로 동결한다

V1의 `response()` 본문, 명령 판정 함수, 라우팅 순서, 양식 파서, 로컬 문구 생성기와 서버 응답 포맷터를 사용자 동작의 단일 기준으로 유지한다. 선행 `/` 처리, 봇 echo 제외, 입장 인사, 파티·내전·스크림·전적·랭킹·운영 양식과 이미지 입력의 관찰 가능한 동작도 이 범위에 포함한다.

배포 산출물은 위 기준 파일을 직접 편집해 분기시키지 않는다. 빌드 단계에서 기준 파일의 SHA-256을 확인한 뒤, 아래의 명시된 전송 seam만 어댑터로 연결한다. 기준 hash가 달라지면 생성과 배포를 실패시켜야 한다. 새 기능은 V1 명령과 충돌하지 않는 별도 분기로만 추가하고, 충돌하면 V1 라우트가 우선한다.

V4의 `localReply`, `unifiedLocalReply`, `acceptsPublicText`, `publicProfileId`는 V1 사용자 입력 앞단에서 실행하지 않는다. 이들을 함께 실행하면 V1보다 먼저 응답하거나 입력을 버릴 수 있기 때문이다. V4는 아래 전송 facade와 서버 보안 경계만 제공한다.

### 2. 전송 seam만 V4 facade로 바꾼다

MessengerBot R callback의 `logId`와 `userHash`를 V4 전송에 전달하기 위해 얇은 callback wrapper가 요청 context를 시작한 뒤 원본 V1 `response()`를 호출한다. 원본 라우터가 선택한 handler는 `KLOL_V1_EXACT_V4_TRANSPORT.sendOnce(profileId, rawText, context)`를 호출한다.

`sendOnce`는 현재 V4의 다음 동작을 그대로 재사용한다.

- `RECRUIT` 또는 `FEATURES`에서 파생한 installation ID
- `userHash`, 없으면 표시명을 HMAC한 감사용 sender ID
- `logId`, boot ID와 counter로 만든 event ID
- `KLOL_KAKAO_COMMAND_V4\n<keyId>\n<SHA-256(raw body)>` HMAC
- `Idempotency-Key === eventId`
- `POST /api/integrations/kakao/v4/commands`
- 사용자 입력 하나당 `execute()` 정확히 한 번, timeout 5,000ms, 자동 retry 없음

한 callback 안에서 두 번째 텍스트 전송을 시도하면 네트워크 요청을 추가하지 않고 fail-closed한다. 여러 조회·저장이 필요한 흐름은 서버 dispatcher가 한 요청 안에서 V2 서비스를 조합한다. 로컬 V1 응답은 네트워크 요청을 만들지 않는다.

다음 함수는 이름, 입력 판정과 최종 V1 문구는 유지하되 내부의 구형 `Jsoup.connect`, bearer header, body secret만 `sendOnce` 결과로 대체한다.

| V1 전송 경계 | V4 profile | 서버에서 재사용할 V2 경계 |
|---|---|---|
| `handlePartyRecruitApi`, `fetchPartyRecruitStatusText` | `RECRUIT` | `RecruitingApplicationService`, `KakaoAssistant` |
| `sendSearchPlayerCommand`, `sendOpenchatCommand` | `FEATURES` | `KakaoAssistant`의 플레이어·전적·랭킹·오픈채팅 조회 |
| `fetchSeasonRecruitStatusText`, `handleSeasonApplyMessage` | `FEATURES` | `KakaoAssistant`의 시즌 신청 snapshot |
| `handleOperationFormMessage` | `FEATURES` | `OperationForms` |
| `handleManagedImage` | 로컬 | V1 R2 clean-session 무응답, HTTP 요청 없음 |
| `replyManagedImageFallback` | 로컬 | V1 R2 clean-session 무응답, HTTP 요청 없음 |

위 표가 빌더가 교체하는 9개 전송 seam의 전체 목록이다. `handlePartyRecruitSync`와 `handleSiteFirstManagedWorkflow`를 포함한 나머지 `response()` 도달 함수 63개는 원본 byte를 유지한다. 전자는 원본대로 `handlePartyRecruitApi` seam을 호출하고, 후자는 원본대로 사이트 링크만 로컬 응답한다.

서버의 현재 V4 classifier/formatter는 위 V1 handler의 입력·응답 골든 테스트를 모두 통과할 때만 사용자 응답 생성기로 사용할 수 있다. 포트와 V2 호출은 재사용하되, 다른 문구를 만드는 `localReply`, `partyLines`, `partyStatusReply`, `partyTemplate` 등의 결과를 V1 문구 대신 노출해서는 안 된다.

### 3. 한 휴대폰과 두 기능방은 명령 family로 처리한다

운영 토폴로지는 휴대폰 1대, MessengerBot R callback 1개, 카카오톡 방 2개다.

- 파티·구인·스크림 handler는 `RECRUIT` profile을 사용한다.
- 내전·전적·랭킹·운영 양식·이미지 handler는 `FEATURES` profile을 사용한다.
- MessengerBot R가 전달하는 `room`, `channelId` 또는 방 이름은 서명, profile 선택과 권한 판정에 사용하지 않는다. 실제 관측에서 같은 카카오톡 방도 사용자별로 다른 room fingerprint가 나온 적이 있으므로 이를 신뢰 경계로 삼을 수 없다.
- 기능방 분리는 사용 안내와 self-echo 표시명 분리를 위한 운영 규칙이다. 잘못된 방에서 입력한 지원 명령을 방 문자열만으로 거부하지 않는다.
- 모든 방 사용자가 V1 공개 명령을 사용할 수 있다. sender ID는 감사, 이미지 session 소유자 확인과 멱등성에만 사용하며 관리자·작성자·allowlist 권한으로 승격하지 않는다. 같은 installation scope의 다른 사용자가 파티 전체 양식을 수정하거나 마감할 수 있어야 한다.

V4의 두 profile에서 파생한 installation scope는 DB의 물리적 카카오 room row를 요구하지 않는다. 서버는 `KakaoV4InstallationScopeAuthorizer`가 반환한 profile별 결정적 `room-*`을 모집의 논리적 소유 범위로 사용한다. 이 결정은 불안정한 callback room을 버리면서 RECRUIT와 FEATURES 데이터를 서로 섞지 않는다.

### 4. 파티 template은 비공개 DRAFT만 예약한다

V1은 양식에 사용할 모집번호가 필요하다. 번호 충돌 없이 이를 유지하기 위해 양식 생성 요청은 기존 `RecruitPartyStatus = "DRAFT"`를 사용해 번호만 예약한다.

- DRAFT는 구인 현황·상세·활성 모집 집계에 노출하지 않는다.
- 사용자가 채운 전체 양식을 보내면 같은 DRAFT를 `IN_PROGRESS`로 전환한다.
- 양식만 생성하고 제출하지 않은 경우 활성 파티가 생긴 것처럼 보이면 안 된다.
- V1과 동일하게 최초 양식에는 값이 비어 있는 `》시작시간 :`과 `》게임정보 :` 줄을 표시한다. 제출에도 값이 없을 때만 서버가 접수 시각 KST `HH:mm`과 `미입력`을 저장하고 현황·상세에서 보여준다.
- 이 흐름은 현재 enum, command payload와 조회 filter로 구현 가능하므로 DB migration을 추가하지 않는다.

### 5. imageDB는 V1 R2의 실제 활성 동작을 유지한다

원본 V1 `response()`는 `imageDB.getImage()`, `getImageBase64()`, `getImageBitmap()` 순서로 이미지 입력을 확인한다. 그러나 같은 원본의 관리 명령은 `isManagedWorkflowMessage()` 다음 `handleSiteFirstManagedWorkflow()`에서 사이트 링크를 안내하고 즉시 종료한다. 구형 `handleManagedWorkflowMessage()`와 `rememberManagedUploadCode()`는 선언되어 있을 뿐 이 `response()`에서 호출되지 않아 새 이미지 세션을 만들지 않는다.

따라서 정상 설정과 빈 세션 저장소로 시작하는 V40 R2의 실제 활성 동작은 다음과 같다.

- 관리 명령은 V1과 같은 사이트 링크 안내를 로컬로 응답한다.
- 활성 세션이 없는 `imageDB` 입력은 응답하지 않고 HTTP 요청도 만들지 않는다.
- V1에 없던 UUID 세션 명령이나 V4 이미지 API를 추가하지 않는다.
- 기존 비-strict 이미지 API의 HMAC, 4.2MB 제한, 활성 세션과 sender hash 검증은 다른 흐름을 위해 그대로 유지하며 완화하지 않는다.

이 결정은 기능을 임의로 제거한 것이 아니라 해시로 고정한 V40 R2 `response()`의 clean-install 제어 흐름을 그대로 실행한 결과다. 근거는 `tests/kakao-v1-site-first-image-boundary.test.mjs`와 `docs/qa-evidence/2026-09-11-kakao-v1-site-first-image-boundary.md`에 고정한다.

### 6. 보안과 데이터 경계는 낮추지 않는다

다음은 V1 호환보다 우선하는 필수 조건이다.

- 구형 `/api/kakao/*`, bearer token, query secret, body `secret`을 재개하지 않는다.
- 공개 생성본과 Git에는 signing secret, identity secret 또는 운영 DB 자격증명을 넣지 않는다. 비밀값은 MessengerBot R `DataBase`와 Vercel secret 환경변수에만 둔다.
- HTTPS, raw-body-before-JSON HMAC, constant-time 비교, 5분 timestamp tolerance, nonce replay 방지, durable event idempotency, request size cap과 no-store 응답을 유지한다.
- 로그에는 raw room, sender, signature, secret, 본문과 이미지 내용을 남기지 않는다. 제한된 reason code와 비가역 hint만 허용한다.
- 기존 V2 application service, Drizzle schema와 Neon PostgreSQL 데이터를 재사용한다. 이 어댑터를 위해 table, column, enum 또는 migration을 추가하지 않는다.
- 서버의 in-memory receipt는 빠른 중복 억제일 뿐이다. 실제 mutation은 기존 `recruiting_command_receipts`와 nonce claim을 사용한다.

오류 응답은 V1의 기능별 제목과 재시도·권한 의미를 유지하되, V1이 사용자의 명령 원문, 서버 raw body 또는 `String(error)`를 그대로 되돌리던 부분은 복원하지 않는다. strict 휴대폰 생성본은 서버가 명시적으로 제공한 `reply`만 상태와 무관하게 통과시키고, 그 외 실패는 상태 코드와 안전한 고정 문구만 표시한다. signing secret, identity secret, signature, raw response와 내부 예외는 사용자 응답에 포함하지 않는다.

운영 양식의 서버 `sourceHash` 중복까지 새 이벤트 사이에 공유하는 기능은 V4 DTO에 추가하지 않는다. 한 휴대폰에서는 원본과 동일한 `KLOL_OPERATION_FORM_LAST_HASH_V1` 로컬 해시가 같은 양식의 재전송을 먼저 막는다. 여러 휴대폰 사이의 의미상 중복 제거가 필요해지면 별도 서버 계약으로 설계한다.

활성 시즌이 없을 때 strict STATUS/DETAIL은 V1처럼 빈 현황으로 응답한다. 활성 시즌이 둘 이상인 비정상 데이터는 V1의 “최신 하나 임의 선택”을 복원하지 않는다. 현재 `seasons_single_active_uidx` 불변식과 assistant의 conflict를 유지해 잘못된 시즌에 신청을 넣지 않도록 fail-closed한다.

V40 R2 clean-install을 기준으로 이미지 두 seam은 비활성이다. 이전 V39 설치본의 로컬 `KLOL_MANAGED_UPLOAD_V1_*` 세션 값이 남아 있는 상태까지 승계하지 않으며, 이런 오래된 세션은 사이트에서 다시 시작해야 한다.

V1 스크림의 `일시`는 `9/12 21:00`, 오전·오후, `H시` 표기를 KST instant로 정규화한다. `협의`처럼 날짜로 바꿀 수 없는 자유 입력은 기존 V2 스크림 표에 별도 열이 없으므로 V1에서 사용하지 않던 `legacyMemo`에 식별 가능한 내부 prefix로 저장하고, strict 현황·상세에서만 복원한다. 공개 스크림 DTO는 이 내부 값을 `memo: null`로 투영해 저장 표현을 노출하지 않는다. 이 방식으로 DB migration 없이 원래 V1 표시를 유지한다.

이미 V2로 이관된 구형 스크림 중 `scheduledAt`도 위 내부 prefix도 없는 레코드의 과거 `startTimeText`는 원본 DB에 값이 남아 있지 않으므로 복원할 수 없다. 신규·수정 strict 양식에는 위 경계를 적용한다.

## 적용 순서와 차단 조건

1. 기준 V1 파일 hash와 V1 exact golden fixture를 고정한다.
2. V1 callback wrapper와 텍스트 `sendOnce` facade를 추가하되 사용자 문구는 변경하지 않는다.
3. V4 dispatcher의 각 V1 route를 V2 서비스에 연결하고 골든 응답을 맞춘다.
4. DRAFT 생성→전체 양식 제출→활성화, A→B→A snapshot, 다른 사용자 수정·마감을 DB 계약으로 검증한다.
5. V40 R2의 site-first 관리 링크와 clean-session imageDB 무응답을 골든 테스트로 고정한다.
6. 단일 생성본을 만들고 Rhino/ES5 syntax, side-effect lint, 1요청/5초, V1 golden을 통과시킨다.
7. 한 휴대폰의 두 실제 기능방에서 서로 다른 사용자로 생성·수정·마감·조회를 확인한 뒤에만 운영본으로 교체한다.

아래 중 하나라도 발생하면 배포를 차단한다.

- 기준 V1 hash 또는 exact 문구가 이유 없이 달라진다.
- 한 입력에 텍스트 HTTP 요청이 두 번 이상 발생한다.
- callback room 또는 sender allowlist가 공개 명령 권한이 된다.
- 양식 생성만으로 DRAFT가 활성 현황에 보인다.
- V1에 없는 이미지 session/API가 사용자 입력 경로에 추가된다.
- 구형 bearer API 또는 DB migration이 다시 추가된다.

## 결과

사용자는 V1과 같은 명령과 문구를 보며, 전송과 저장만 V4/V2의 안전한 경계로 바뀐다. V4에서 새로 만든 사용자 라우터와 V1 원본을 동시에 유지하는 중복을 없애고, 이후의 기능 추가도 V1 골든 계약을 깨뜨리지 않는 범위에서 진행할 수 있다.
