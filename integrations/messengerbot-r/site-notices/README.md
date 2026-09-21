# 사이트 내전 충원 알림 companion

서버 SITE 참가로 본 참가가 9명 이하에서 10명이 될 때, 해당 내전을 사용하는 **FEATURES** 설치 범위의 지정된 카카오 세션으로 안내를 전달한다. 기존 phone adapter와 command classifier의 내전 프로필이 FEATURES이므로 파티용 RECRUIT scope와 섞지 않는다. 예비 참가, 이름/라인 수정, 10명 상태 저장 재시도, 회원 연결은 새 충원 이벤트를 만들지 않는다. 취소 뒤 다시 10명이 되면 별개의 새 안내다. 명단·회원명·방이름은 알림 payload와 서버 로그에 넣지 않는다.

**기본 OFF. 실제 기기 설치·송수신 확인 전 운영 활성화로 표시하지 않는다.** 기존 R24/R25 한 파일은 그대로 두고 알림 전용 별도 봇 하나만 추가한다. 이 파일은 일반 명령어에 답하지 않는다. 기존 두 프로필을 추가 설치하는 것과 다르다.

## MessengerBot R 0.7.29a 기준

현재 설치 버전이 0.7.29a이므로 0.7.34a에 추가된 channelId 인자나 최신 API2를 사용하지 않는다. 기존 운영 설치본에서 사용하는 `response(room, msg, sender, isGroupChat, replier, imageDB, packageName)`, `replier.reply(text)`, DataBase, Jsoup, Java 암호화를 재사용한다. 공식 [0.7.34a·0.7.36a 릴리스 기록](https://github.com/MessengerBotTeam/msgbot-old-release/releases)은 channelId 추가와 이후 Legacy 축소를 보여준다.

`Api.replyRoom(방이름, ...)`로 찾지 않는다. 운영자가 **원하는 그룹방에 일회용 등록 명령을 직접 보낼 때 받은 replier 객체**만 유지한다. 따라서 같은 이름의 다른 방이나 이후 명령의 방으로 바뀌지 않는다. 패키지는 `com.kakao.talk`만 허용하고 디버그룸·개인방·듀얼 메신저는 허용하지 않는다.

앱 재시작·재컴파일은 수신 세션을 영속화할 수 없으므로 등록을 해제한다. 새 등록 코드로 다시 등록하기 전에는 poll/발송하지 않는다. 서버 큐는 만료 전까지 보관한다. 0.7.29a 실제 기기에서 비동기 replier 세션 수명과 30초 타이머 지속 실행은 아직 미확인이다. 이를 설치 검사의 필수 조건으로 둔다. 앱 업데이트는 요구하지 않는다.

## 설치 준비 및 명시적 연결

1. 서버 migration을 먼저 반영하되 `KAKAO_SITE_NOTICE_ENABLED`는 미설정 또는 `false`로 유지한다.
2. 저장소에서 `node scripts/build-private-site-notice-companion.mjs`를 실행하면 `.private/KLOL_SITE_NOTICE_COMPANION_PRIVATE.js`와 `.private/site-notice-setup.json`을 만든다. 둘 다 git 제외이며 비밀값을 포함한다. 공개 채팅·Git·로그에 올리지 않는다. 공개 소스는 `KLOL_SITE_NOTICE_COMPANION.js`다.
3. 실제 연결 준비가 끝나면 `node scripts/build-private-site-notice-companion.mjs --enable`로 휴대폰용 활성 설치본을 준비한다. 이 명령은 로컬 파일만 생성하며 서버 환경이나 휴대폰을 변경하지 않는다. 이전 파일은 `.private/backups/`에 보관한다. target ID는 유지하며 등록 코드는 매 빌드 새로 발급한다.
4. MessengerBot R 0.7.29a에서 **새 Legacy 봇 하나**에 비공개 JS 전체를 붙인다. 기존 일반 응답 봇은 변경하지 않는다. 해당 companion은 하나만 실행한다.
5. setup JSON의 `targetHash`를 서버 `KAKAO_SITE_NOTICE_TARGET_HASH`에 설정한다. 이 값은 임의 방이름 해시가 아니라 명시 등록 대상으로 생성한 난수 ID의 HMAC이다. 서버의 기존 V4 identity/signing 설정과 휴대폰 설정이 같아야 한다.
6. 합성 환경에서 아래 검사 후, 실제 대상 방과 앱 권한·절전 설정을 확인하고 서버 `KAKAO_SITE_NOTICE_ENABLED=true`를 반영한다. 활성화 시점 이후 새 SITE 충원만 큐에 저장하며 과거 충원을 소급 발송하지 않는다.
7. setup JSON의 `registrationMessage`를 **지정할 그룹방에 운영자가 한 번 직접 전송**한다. 코드는 기기에서 먼저 소모되며 서버 REGISTER가 성공한 뒤 그 수신 세션만 유지한다. 등록 메시지는 봇이 채팅방에 재출력하지 않는다. 필요하면 기기 디버거에서 `KLOL_SITE_NOTICE.status()`가 `REGISTERED`인지 로컬 확인한다. 서버 연결 실패시 코드 재발급 후 다시 등록한다.
8. 재시작/재컴파일/세션 만료 후에는 3번부터 새 코드로 재등록한다. 같은 설치본 재컴파일로 이미 쓴 코드가 살아나지 않는다. 방을 바꿀 때에는 먼저 서버 OFF, 이전 companion 정지, 기존 큐 검토·만료 후 신규 등록을 진행한다.

## 전달·실패 의미

- 서버는 SITE 신청 저장과 같은 transaction에 이벤트를 쓴다. 신청 저장이 실패하면 이벤트도 없다. application ID·revision으로 재시도 중복을 막는다.
- HMAC 프로토콜은 일반 V4 명령과 분리하고 5분 timestamp 허용, 일회용 nonce, installation/target 정확 비교를 한다. 다른 scope는 큐에 넣거나 claim하지 않는다.
- 휴대폰은 30초 간격으로 한 건만 claim한다. 2분 lease, 최대 20회, 재시도 backoff는 최대 15분이다. 오프라인이면 lease 만료 뒤 다시 claim한다.
- 전송 직전 기기 DataBase에 `PREPARED`를 기록하고 읽어서 확인한다. SDK 호출 뒤 `SENT`를 저장하고 ACK한다. ACK만 유실되면 같은 이벤트를 다시 보내지 않는다. 이 영속 기록은 36시간 유지하고 최대 512건으로 제한한다. 상한에서는 새 전송을 멈춘다.
- SDK 예외, 전송 중 프로세스 종료 흔적인 `PREPARED`는 `SEND_UNCERTAIN`으로 끝내고 자동 재발송하지 않는다. 중복 방지를 위해 일부 안내가 누락될 수 있으며 운영자가 실제 채팅을 확인해야 한다. **정확히 한 번 전달 또는 실제 수신 확인을 보장하지 않는다.** `DELIVERED`는 SDK 호출이 명시적으로 거부되지 않았음을 뜻하며 원격 전달 영수증이 아니다.
- 모집이 닫혔거나 다시 10명 미만이면 claim 시 만료한다. 새 충원은 기존 미발송 이벤트를 대체한다. 최대 24시간 또는 해당 운영일 종료(다음날 06:00 KST) 중 먼저 도래하는 시점에 만료하며 terminal 기록은 30일 후 정리한다. 인증된 poll/register/ack와 기존 서명 daily-close가 같은 `pruneSiteNotices`를 호출한다. 만료 상태 전환·보관기간 종료 삭제는 각각 최대 500건씩 `skipLocked`로 처리하며 다음 실행에서 이어진다. 폰이 꺼져 있거나 알림이 OFF여도 배포된 daily-close의 실제 예약 실행이 정상이라면 보관정리를 진행한다. 예약 실행의 운영 증거는 별도로 확인한다.
- kill switch: 서버 `KAKAO_SITE_NOTICE_ENABLED=false`와 companion OFF. 기존 모집/신청/일반 카카오 명령은 계속 동작한다. 큐·dedupe 파일을 임의 삭제하거나 구 알림을 재전송하지 않는다.

일일 정리 확인: 기존 `/api/cron/kakao-daily-close`는 CRON_SECRET 인증 뒤 같은 job transaction에서 정리하며 `maintenanceRuns.countsJson`과 감사 metadata에 `siteNoticesExpired`, `siteNoticesRetired`를 남긴다. 해당 날짜의 성공 run·두 건수·실패 로그를 확인한다. 실패한 job은 성공으로 기록하지 않으며, 수동 DB 삭제로 대신하지 않는다. 기록이 없으면 서버 예약 설정과 인증을 먼저 확인한다.

## 재현 가능한 검사

```powershell
npx tsx --test tests/kakao-site-notices.test.ts
node --test tests/kakao-site-notice-phone.test.mjs tests/season-kakao-pending-http-ui.test.mjs
```

DB 검사는 격리 하네스에 등록된 `tests/database/kakao-site-notices.contract.test.ts`를 쓴다. 운영 DB에 직접 테스트하지 않는다. 합성 검사는 9→10/재시도/10→10/재충원, 저장 rollback, scope·target·nonce·lease, 동시 claim, ACK손실·재시작 dedupe, 전송 불확실, 만료·retention을 포함한다.

실기기 검사는 대상 그룹방 한 곳의 정확 수신, 같은 이름의 별도 방 무발송, 미등록 무발송, 30초 poll/잠금화면 유지, 오프라인 뒤 만료 전 재연결, 재컴파일 후 재등록 요구, SDK 실패 상태를 확인하고 앱 버전·설치 JS SHA-256·시간·결과를 기록한다. 이 저장소 합성 검사 결과를 실기기 성공으로 대신하지 않는다.
