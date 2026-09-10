# 설치 절차

현재 절차는 실행하지 않은 release-candidate 체크리스트다.

1. 기존 V41 RECRUIT/FEATURES 소스와 private 설정을 비밀 보관소에 백업한다.
2. staging server에서 환경변수 이름과 환경 범위만 확인한다. 값을 로그·채팅·스크린샷에 남기지 않는다.
3. 운영 DB와 분리된 staging DB의 migration head, receipt와 nonce schema를 read-only로 확인한다.
4. `npm run build-messengerbot:v4`로 비밀값 없는 공개 통합본을 생성한다.
5. 최초 설치 때 한 번만 `npm run bot:kakao:v4:private -- --configure-vercel`을 실행해 V4 전용 keyring을 Vercel Production에 등록하고 Git에서 제외되는 private one-paste 파일을 생성한다. 휴대폰은 1대만 사용한다.
6. 이후 코드 패치에서는 `npm run bot:kakao:v4:private -- --refresh`로 기존 비밀값을 바꾸지 않고 one-paste 파일만 갱신한다.
7. 기존 V4 RECRUIT/FEATURES 분리형 봇 프로필을 모두 중지한다. `legacy-split-profiles` 파일은 설치하지 않는다.
8. 같은 휴대폰의 MessengerBot R에 V4 통합 봇 프로필 하나를 만들고 `.private/KLOL_KAKAO_BOT_V4_UNIFIED_PRIVATE_MESSENGERBOT_R.js` 전체를 한 번만 복사해 붙여넣는다.
9. private 파일 선두가 V4 전용 연결 설정과 두 방의 봇 표시명을 `DataBase`에 자동 저장하므로 별도 설정 코드를 실행하지 않는다. 이 파일을 Git·채팅·공유 드라이브에 올리지 않는다.
10. V4에서는 pair-room 명령을 실행하지 않는다. V3/V41 pairing 설정은 삭제하거나 변경하지 않는다.
11. 두 대상 방의 V41을 중지한 뒤 V4 통합 프로필 하나만 staging canary로 시작한다.
12. 각 방에서 `/봇버전`을 실행해 통합 봇 응답이 메시지당 한 번만 오고, 응답 안의 RECRUIT/FEATURES installation ID가 서로 다른지 확인한다.
13. 어느 방에서 입력했는지와 무관하게 파티·스크림은 RECRUIT, 내전·조회·운영은 FEATURES로 정확히 한 번 전송되는지 확인한다.
    - 방 이름은 권한 경계가 아니므로 잘못된 방에서 입력한 지원 명령도 해당 family로 처리될 수 있다.
14. 상태·조회, 일반 sender 두 명 교차 수정, snapshot, 종료, replay/conflict 순으로 검증한다.
15. 잘못된 profile/installation/signature를 직접 보낸 요청이 서버에서 fail-closed하는지 확인한다.
16. canary 증거가 모두 확인된 뒤에만 운영 전환을 별도로 승인한다.

MessengerBot R log ID가 두 방을 합쳐 유일한지는 미확인이다. 같은 실행·같은 family에서 두 방의 log ID가 같으면 event ID가 충돌할 수 있으므로 canary 로그로 확인한다. 자동 재시도는 없으며 사용자가 다시 시도할 때는 새 callback/event ID가 생성돼야 한다.
