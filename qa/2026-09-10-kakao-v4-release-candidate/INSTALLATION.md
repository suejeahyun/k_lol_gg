# 설치 절차

현재 절차는 실행하지 않은 release-candidate 체크리스트다.

1. 기존 V41 RECRUIT/FEATURES 소스와 private 설정을 비밀 보관소에 백업한다.
2. staging server에서 환경변수 이름과 환경 범위만 확인한다. 값을 로그·채팅·스크린샷에 남기지 않는다.
3. 운영 DB와 분리된 staging DB의 migration head, receipt와 nonce schema를 read-only로 확인한다.
4. `npm run build-messengerbot:v4`로 두 paste-ready 파일을 생성한다. 휴대폰은 1대만 사용한다.
5. 생성 파일의 byte SHA-256을 `COMMAND_RESULTS.md`와 대조한다.
6. 같은 휴대폰의 MessengerBot R에 RECRUIT와 FEATURES 봇 프로필을 각각 하나씩 만든 뒤 대응 파일을 설치한다.
7. 같은 휴대폰의 공용 `DataBase`에 필요한 네 설정을 한 번만 안전하게 저장한다. 두 봇 프로필은 이를 공동으로 읽지만 정적 profile ID 때문에 installation ID는 서로 달라야 한다.
8. MessengerBot R 응답 방 설정에서 RECRUIT는 구인 관련방 하나만, FEATURES는 나머지 기능방 하나만 선택한다. 한 프로필에 두 방을 선택하거나 두 프로필을 같은 방에 선택하지 않는다.
9. V4에서는 pair-room 명령을 실행하지 않는다. V3/V41 pairing 설정은 삭제하거나 변경하지 않는다.
10. 각 지정 방의 V41을 중지한 뒤 해당 V4 프로필만 staging canary로 시작한다.
11. 두 방에서 `/봇버전`을 실행해 profile과 서로 다른 deterministic installation ID를 확인한다.
12. RECRUIT 프로필은 구인 관련방에만, FEATURES 프로필은 기능방에만 답하고 반대 방·반대 profile 명령에는 답하지 않는지 확인한다.
13. 상태·조회, 일반 sender 두 명 교차 수정, snapshot, 종료, replay/conflict 순으로 검증한다.
14. 로컬 필터를 우회한 교차 profile과 wrong installation/signature가 서버에서도 fail-closed하는지 확인한다.
15. canary 증거가 모두 확인된 뒤에만 운영 전환을 별도로 승인한다.
