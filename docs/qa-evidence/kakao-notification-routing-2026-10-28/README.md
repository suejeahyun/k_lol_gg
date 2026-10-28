# 카카오 알림의 채팅방 식별 호환성

## 최종 상태 — 휴대폰 설치 및 네 방 응답 확인

2026-10-28 일반 봇 두 개의 R32, 사이트 알림 companion 두 개의 1.0.5, 공통 router 1.0.0을 실제 휴대폰에 설치했다. 네 프로필과 공통 모듈의 설치 파일 해시를 대조하고 컴파일 성공을 확인했다. 사용자가 PC 카카오톡을 직접 사용한 테스트를 명시적으로 승인한 뒤 네 실제 방의 버전 응답을 각각 한 번씩 확인했다. 검증 시점 구인현황은 K-LOL 2건, NEXUS 0건으로 구분됐다. 두 서비스의 알림 수신 세션 등록과 상태 조회도 정상이며 임시 진단 봇은 OFF로 전환했다.

최종 기기 재검증에서 운영 프로필 4개가 ON, 진단 프로필이 OFF임을 확인했다. 네 설치본과 공통 모듈을 합친 5개 파일의 바이트 SHA-256이 전달본과 일치했다. 기존 인증·URL·알림 설정 14개 파일은 바이트 동일했고 일회용 등록 코드 2개는 소비된 상태였다. router 오류 로그는 0건이었다. 해당 원본 근거는 ignored `.private/phone-backup-20261028/r32-final-phone-audit.json`에 보관한다.

**새 사이트 충원 이벤트의 자동 알림 실발송은 미검증이다.** 이를 확인하기 위한 가짜 운영 자료는 만들지 않았다. 수신 세션 등록·상태 확인을 신규 이벤트의 종단간 발송 확인으로 간주하지 않는다. 공개 검증 요약은 [validation.json](validation.json), 사용자 변경 안내는 [1.0.0 패치 노트](../../patch-notes/kakao-notification-room-routing-v1.0.0.md)에 있다.

## 확인된 장애

사용자가 USB로 연결한 Android 16 휴대폰에는 MessengerBot R 0.7.29a와 카카오톡 26.9.1이 설치돼 있었다. 기존 네 프로필의 소스와 독립된 서비스 설정은 전달한 R31 파일과 일치했고, 컴파일 및 알림 수신 권한도 정상이었다. 그러나 Legacy `response`의 `room` 값에는 실제 방 이름 대신 발신자 표시명이 들어왔다. 이 때문에 R31의 정확한 방 이름 허용 목록에서 명령이 차단됐다.

원본 알림 진단에서도 `android.title`은 발신자와 같았으며 `android.conversationTitle`, `android.subText`, `android.summaryText`는 없었다. 알림에는 `android.messages`, `threadId`, `chatLogId`와 답장용 RemoteInput Action이 있었다. 원본 표시명, 알림 식별값, 사용자 메시지 및 설정 비밀값은 공개 근거에 포함하지 않는다.

동일 증상은 [공식 이슈 #31](https://github.com/VioletXF/MessengerBot/issues/31)에도 보고됐다. [공식 alpha.7 변경 기록](https://codeberg.org/naijun0403/messengerbot-r-releases/releases/tag/v0.7.41-alpha.7)은 카카오톡 26.7 이상 알림 구조와 방 조회 변경을 명시한다. 설치된 앱과 새 배포 APK는 서명이 달랐고 새 버전은 JavaScript 엔진도 변경했다. 기존 앱을 제거하거나 교체하지 않았다.

## 처리 경계

방 이름이 없는 알림을 발신자명으로 추정하지 않는다. 사용자와 명시적으로 허용된 작업자가 각 실제 방에 입력한 서로 다른 일회용 코드로 네 논리 방과 원본 알림의 `(Android 사용자, Notification.getShortcutId())`를 연결한다. `shortcutId`는 플랫폼의 대화 식별자 원문 문자열을 보존한다. 이 기기의 `extras.threadId`는 여러 방에서 모두 0이었으므로 방 식별에 사용하지 않는다. 임시 수집 결과와 운영 바인딩은 별개이며, 네 항목의 완전성·중복 여부를 검사한 뒤 단일 JSON registry를 적용한다. 알 수 없는 방, 불완전하거나 잘못된 registry, 식별값 충돌은 차단한다. 별개 방의 이름이 같더라도 자동으로 허용하지 않는다.

| 프로필 역할 | 허용하는 등록 슬롯 |
| --- | --- |
| K-LOL 일반 봇 | KLOL_MAIN, KLOL_RECRUIT |
| K-LOL 사이트 알림 | KLOL_RECRUIT |
| NEXUS 일반 봇 | NEXUS_MAIN, NEXUS_RECRUIT |
| NEXUS 사이트 알림 | NEXUS_RECRUIT |

공용 모듈은 `/sdcard/msgbot/global_modules/KAKAO_ROOM_ROUTER.js`에 두며 별도 봇 프로필을 만들지 않는다. 서비스별 인증·DB namespace 및 서버 주소는 그대로 유지한다. 네 프로필은 공유 routing registry에서 허용된 슬롯만 읽고, 각 알림의 정확한 답장 Action을 보관한다. 전역 방 이름 세션 검색이나 최근 알림을 이용한 콜백 보정은 사용하지 않는다. 기존 Legacy 자동 응답 경로와 원본 알림 경로를 동시에 실행하지 않는다.

방 식별자는 숫자로 변환하지 않는다. 메시지 중복 판정에만 사용하는 `chatLogId`는 Java Long에서 Java 문자열로 직접 변환한다. 휴대폰의 커스텀 Rhino는 Java Long의 `.longValue()` 메서드를 노출하지 않았다. 합성 Android Bundle의 `putLong` → `getLong` → Java 문자열 경로로 `9007199254740993`이 정확히 보존됨을 실제 폰에서 확인했다. 일반 Mozilla Rhino JVM 결과와 이 휴대폰 결과를 구분한다.

## 복구와 데이터 보존

설치 전 다섯 프로필, 전체 외부 앱 저장소와 기존 APK 분할 파일을 ignored `.private/phone-backup-20261028/`에 백업했다. 전체 저장소 archive의 550개 일반 파일을 끝까지 읽어 검증했다. 기존 DataBase, 인증 키, 알림 ledger, 카카오톡 앱 데이터는 삭제하지 않았다. 임시 방 수집·진단 봇은 적용과 실기기 확인 후 비활성화했다.

## 검증 상태

| 검증 항목 | 결과 |
| --- | --- |
| 네 프로필 R32 / 1.0.5와 공통 router 1.0.0 설치·해시·컴파일 | PASS |
| 사용자 승인 후 PC 카카오톡 네 방 버전 응답 | 4/4 PASS, 방마다 1회 |
| 두 서비스 구인현황 분리 | PASS, 확인 당시 K-LOL 2건 / NEXUS 0건 |
| 두 구인방 사이트 알림 세션 등록·상태 | 2/2 PASS |
| 임시 진단 봇 | OFF |
| 최종 기기 상태·파일 대조 | 운영 프로필 4개 ON, 설치 파일 5개 해시 일치 |
| 기존 설정·등록 코드 | 설정 14개 파일 바이트 동일, 등록 코드 2개 소비 |
| Router 오류 로그 | 0건 |
| 전체 `npm run check` | PASS, 종료 코드 0 |
| Lint / 타입 / ERD | 오류 0·경고 89 / PASS / 114표·175외래키 일치 |
| 계약 테스트 | 771 PASS, 실패 0 |
| 단위 테스트 | 1,201 PASS, 기존 SKIP 1, 실패 0 |
| 홈 안내 이미지 / 프로덕션 빌드 | 68개 PASS / Next 16.4.3, 정적 페이지 101/101 |
| 신규 사이트 충원 이벤트 자동 발송 | NOT_VERIFIED |

전체 검사 로그는 ignored `.private/r32-full-check-retry.log`에 보관했다. 이 기록에는 실제 방 식별값, 사용자 표시명, 인증값, 등록 코드, 채팅 원문을 포함하지 않는다. 서버·Vercel·운영 DB 배포는 이번 휴대폰 변경에 포함하지 않았다. Git commit·tag·릴리스 등록은 별도 릴리스 기록으로 연결한다.
