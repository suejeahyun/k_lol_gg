# kakao-site-notices 1.0.2 진단 후보

상태: 로컬 후보 / 휴대폰 교체·수신 미확인. Git tag 및 서버 배포 없음. 기존 서버 배포와 이전 게시 릴리스 근거는 변경하지 않았다.

## 보고와 변경

사용자가 별도 알림 봇 전원·Legacy 설정·코드 교체를 확인했으나 `사이트알림버전`이 무응답이라고 보고했다. 앞서 제공된 37·218행 경고 이미지는 다른 코드라는 사용자 정정으로 원인 근거에서 제외했다. 실기기 근본 원인은 아직 미확정이다.

초기화 오류를 SETUP/LOCK/STORAGE/TIMER 단계로 고립하여 버전·진단 처리를 유지한다. 입력 콜백 거부와 SDK 답장 실패는 로컬 고정 코드만 기록한다. 원래 SDK Replier를 JS 함수로 감싸 기존 R25와 같은 호출 방식을 사용한다. 서버 등록·폴링·ACK와 그룹/패키지 경계 및 중복 억제는 유지한다.

## 검증

- `node --test tests/kakao-site-notice-phone.test.mjs`: 15 PASS. 전체 파일 초기화 성공/실패, 로컬 진단, 원래 SDK 메서드 수신 객체 보존, 설정 불변, 그룹/패키지 차단, SDK 거부/예외, 기존 등록·중복 억제 검증 포함.
- `node scripts/audit-messengerbot-rhino-static.mjs integrations/messengerbot-r/site-notices/KLOL_SITE_NOTICE_COMPANION.js`: ES5, 정적 경고 후보 0.
- `npm run check`: exit 0. 전체 로그 `.tmp/site-notice-1.0.2-check.log`. 이는 Android 실기기 실행 검증이 아니다.
- 생성된 비공개 설치본을 VM에서 정상 설정 및 설정 저장 실패로 실행: 2 PASS. 버전과 초기화 단계 응답 확인. 실제 HTTP·카카오 메시지 전송 없음.
- 서버 target ID/hash 보존, 로컬 등록 코드 신규 발급 확인. 기존 설치본은 빌더가 비공개 backups에 보관했다.
- 개인 JS: 12,939자 / 13,712바이트 / SHA-256 `0be8ddd9aeeff2aedb517ff3d244bad4b5c0cc19ec4e9fde420e51dc240101da`.

## 남은 확인

1. 사용자가 새 설치본을 알림 전용 봇에 교체하고 버전·진단 응답 또는 로컬 `[KLOL_SITE_NOTICE]` 로그를 제공한다.
2. 초기화 READY와 정상 콜백·답장을 확인한 후 새 개인 안내의 코드로 그룹 세션을 등록한다.
3. 실제 SITE 9→10 충원 안내 수신 및 잠금 화면 지속 실행을 확인한다.

진단이 정상이어도 서버 연결과 실제 메시지 수신을 대신 증명하지 않는다. 이번 후보는 운영 명단·회원·서버 환경·배포를 변경하지 않았다.
