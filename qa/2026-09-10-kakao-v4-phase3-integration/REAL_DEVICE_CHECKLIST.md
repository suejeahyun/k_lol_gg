# 실기기 검증 체크리스트

현재 상태: 미확인. 이번 작업에서는 배포 및 실제 MessengerBot-R 기기 조작을 수행하지 않았다.

- [ ] RECRUIT 생성 파일을 실제 구인방 기기에 설치하고 callback 1회를 확인한다.
- [ ] FEATURES 생성 파일을 실제 기능방 기기에 설치하고 callback 1회를 확인한다.
- [ ] 실제 installation key와 signature로 V4 route의 200 응답을 확인한다.
- [ ] 일반 사용자 두 명이 room/sender allowlist 없이 INHOUSE·SCRIM·OPERATIONS를 실행한다.
- [ ] 같은 `eventId` 재전송이 DB mutation 없이 replay되는지 운영 로그와 DB receipt로 확인한다.
- [ ] 같은 `eventId`의 다른 body가 HTTP 409 `REPLAY_CONFLICT`인지 확인한다.
- [ ] 칼바람·증바람 0명 및 A→B→A snapshot을 실제 카카오 메시지 줄바꿈으로 확인한다.
- [ ] 운영 양식 4종의 정상 접수와 누락 안내를 확인한다.

