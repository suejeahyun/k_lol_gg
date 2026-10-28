# NEXUS.GG — 같은 휴대폰에서 별도 서비스 사용

NEXUS는 기존 명령·양식 기능을 재사용하되 별도 서버와 데이터베이스에 연결한다. 두 서비스의 일반 봇과 알림 companion은 각각 지정한 방만 허용한다. NEXUS의 서버 인증·기능·알림 저장소는 `NEXUS_` 접두어를 사용하며 K-LOL 설정을 읽거나 덮어쓰지 않는다. 네 방의 교차 등록을 검사하는 `KAKAO_ROOM_BINDINGS_V1`만 의도적으로 공유한다.

## 현재 준비 상태

- 공개 일반 봇: `NEXUS_KAKAO_BOT_MESSENGERBOT_R.js`
- 공개 사이트 알림 봇: `NEXUS_SITE_NOTICE_COMPANION.js`
- 일반 봇 R32 (`NEXUS_KAKAO_BOT_V40_R32_2026_10_28`)는 사전 등록한 `NEXUS`, `NEXUS구인구직방`의 Android 사용자·플랫폼 대화방 `shortcutId` 원문 문자열만 허용한다. 알림 companion 1.0.5는 등록된 NEXUS 구인구직방만 허용한다. 표시 이름이나 발신자 이름으로 방을 추측하지 않는다.
- 운영 주소는 소유가 확인된 별도 NEXUS 배포 주소를 명시한다. 일반 봇은 NEXUS HTTPS 주소와 독립 인증 설정이 모두 있을 때만 응답·요청한다. `nexus-gg.vercel.app`은 다른 팀 소유이므로 사용하지 않는다.
- 소스·합성 검증 완료와 실제 휴대폰 설치·서버 배포는 별개다. 이 파일 생성만으로 설치 완료를 의미하지 않는다.

## 생성과 설정

공개 파일을 재생성한다.

```powershell
node scripts/build-messengerbot-v1-strict.mjs --service nexus
```

NEXUS 서버 주소가 준비된 뒤 안전한 로컬 환경에 다음 네 값을 설정한다. 비밀값을 채팅·Git·명령 기록에 직접 입력하지 않는다. K-LOL의 `.env` 또는 비공개 설치본에서 가져오지 않는다.

| 휴대폰 빌드 환경변수 | 연결 대상 |
| --- | --- |
| `NEXUS_V2_BASE_URL` | NEXUS HTTPS origin; 경로·쿼리 없음 |
| `NEXUS_V4_KAKAO_IDENTITY_SECRET` | NEXUS 서버의 `KAKAO_V4_IDENTITY_SECRET` |
| `NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT` | NEXUS 서버의 `KAKAO_V4_WEBHOOK_SECRET_CURRENT` |
| `NEXUS_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT` | NEXUS 서버의 `KAKAO_V4_WEBHOOK_KEY_ID_CURRENT` |

identity/signing 키는 서로 다르고 각각 32–1024바이트여야 한다. K-LOL과도 별도로 발급한다. 프로토콜 이름·서명 형식은 서버 호환을 위해 기존 값을 유지한다. 설치·발신자 ID는 NEXUS의 독립 identity 키로 계산하며 요청 ID와 로컬 중복 방지 저장소도 분리한다.

```powershell
node scripts/build-private-messengerbot-v1-strict.mjs --service nexus
```

이 명령은 ignored `.private/NEXUS_KAKAO_BOT_PRIVATE_MESSENGERBOT_R.js`만 생성한다. 필수 설정이 없으면 중단하며 K-LOL 값을 대신 사용하지 않는다. 공개 파일에는 실제 주소나 비밀값이 없다.

## 휴대폰 설정

2026-10-28 R32는 Legacy 방 이름 대신 발신자 이름이 들어오는 실기기 문제에 대응한다. 먼저 `/sdcard/msgbot/global_modules/KAKAO_ROOM_ROUTER.js`를 설치하고 공통 `KAKAO_ROOM_BINDINGS_V1`에 네 실제 방을 모두 등록한 뒤, main 두 개와 companion 두 개를 새 전체 코드로 교체한다. 공통 모듈은 별도 봇 프로필이 아니다. [공통 모듈·방 등록·교체 안내](../MESSENGERBOT_R_INSTALL.md)를 따른다.

1. 기존 K-LOL 봇의 응답 대상은 기존 K-LOL 방만 유지한다. NEXUS 두 방을 선택하지 않는다.
2. MessengerBot R에서 별도 Legacy 봇 `NEXUSMain`을 만들고 NEXUS 비공개 파일 전체를 넣는다.
3. 응답 대상은 `NEXUS`, `NEXUS 구인구직방` 두 곳만 선택한다. 공통 모듈은 원본 알림의 패키지·Android 사용자·`Notification.getShortcutId()`의 대화방 식별자를 등록값과 대조한다. 숫자로 변환하지 않는다.
4. 각 서비스 방에서 `봇버전`, `내전상세 1`, `등록도움말`을 확인한다. NEXUS 링크는 NEXUS 주소이고 K-LOL 응답·저장 결과는 기존 서비스에 남아야 한다.
5. NEXUS에서 합성 신청·수정·조회 후 NEXUS DB에만 반영되는지 서버에서 확인하고, K-LOL 방에도 동일 명령을 보내 교차 저장·이중 답장이 없는지 확인한다.

R32는 공개 Legacy `response`를 비활성화하고 검증된 원본 알림만 기존 처리기에 전달한다. 같은 이름의 다른 방도 실제 ID가 다르면 차단한다. 모듈 누락은 컴파일 실패, 네 방 등록 누락·중복·형식 오류는 무응답으로 처리한다. NEXUS 생성본은 앱 구독 대상 설정 자체를 변경하지 않는다. 재컴파일은 이전 router와 companion 수신 세션을 종료한다.

NEXUS의 카카오 초대 링크·참여 코드·디스코드 주소는 아직 지정되지 않았다. 입장 안내는 NEXUS 사이트와 구인방 안내를 사용하며 기존 K-LOL 초대 링크를 포함하지 않는다.

## 사이트 충원 알림

일반 봇 비공개 파일을 먼저 만든 뒤 다음 명령으로 NEXUS 전용 companion을 만든다. 기본 OFF다.

```powershell
node scripts/build-private-site-notice-companion.mjs --service nexus
```

산출물은 `.private/NEXUS_SITE_NOTICE_COMPANION_PRIVATE.js`와 `.private/nexus-site-notice-setup.json`이다. 대상 ID·등록 코드·설정 revision·전송 ledger가 K-LOL과 분리된다. NEXUS 서버의 `KAKAO_SITE_NOTICE_TARGET_HASH`에는 NEXUS setup의 값을 사용한다.

실제 연결 단계에서만 `--enable`을 추가하고 별도 `NEXUSNotice` Legacy 봇에 설치한다(사용자 기존 프로필명 `NEXUS-otue`). 응답 대상은 등록된 NEXUS 구인구직방 하나로 제한하며 그 방에서 NEXUS setup의 일회용 등록 명령을 직접 전송한다. 네 프로필 묶음으로 교체할 때에는 기존 K-LOL companion도 1.0.5로 갱신한다. 재시작·재컴파일 후에는 수신 세션을 다시 등록한다. 이미 소비한 코드는 새로 발급하고, 아직 사용하지 않은 기존 코드는 그대로 사용할 수 있다. 실제 충원 알림 수신은 별도로 확인한다. 상세 전달·실패 의미는 [기존 companion 문서](../site-notices/README.md)를 따른다.

## 검증

```powershell
node --test tests/kakao-nexus-service-isolation.test.mjs tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-site-notice-phone.test.mjs
```

공유 `DataBase`를 사용하는 두 VM에서 설정·저장키·endpoint·identity·request ID·사이트 링크 분리, 미설정 무요청, 방 제한, companion 등록/대상/ledger 분리를 검증한다. 기존 K-LOL 생성본 해시, ES5/Rhino 정적 검사와 LF/CRLF 65,535자 제한도 검사한다. 실제 폰·카카오 송수신·운영 DB 분리는 설치 후 검증 대상이다.
