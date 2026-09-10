# 설치 절차

현재 절차는 실행하지 않은 release-candidate 체크리스트다.

1. 기존 V41 RECRUIT/FEATURES 소스와 private 설정을 비밀 보관소에 백업한다.
2. staging server에서 환경변수 이름과 환경 범위만 확인한다. 값을 로그·채팅·스크린샷에 남기지 않는다.
3. 운영 DB와 분리된 staging DB의 migration head, receipt와 nonce schema를 read-only로 확인한다.
4. `npm run build-messengerbot:v4`로 두 paste-ready 파일을 생성한다.
5. 생성 파일의 byte SHA-256을 `COMMAND_RESULTS.md`와 대조한다.
6. RECRUIT와 FEATURES를 별도 MessengerBot profile에 설치한다.
7. 각 profile의 private DataBase에 필요한 이름과 값을 안전하게 설정한다.
8. V4에서는 pair-room 명령을 실행하지 않는다. V3/V41 pairing 설정은 삭제하거나 변경하지 않는다.
9. 동일 방의 V41을 중지한 뒤 V4 한 profile만 staging canary로 시작한다.
10. `/봇버전`에서 profile과 서로 다른 deterministic installation ID를 확인한다.
11. 상태·조회, 일반 sender 두 명 교차 수정, snapshot, 종료, replay/conflict 순으로 검증한다.
12. RECRUIT/FEATURES 교차 profile과 wrong installation/signature가 fail-closed하는지 확인한다.
13. canary 증거가 모두 확인된 뒤에만 운영 전환을 별도로 승인한다.

