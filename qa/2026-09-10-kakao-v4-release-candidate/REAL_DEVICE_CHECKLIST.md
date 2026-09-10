# 실기기 체크리스트

현재 상태: 전 항목 미확인.

- [ ] 휴대폰 1대에 V4 통합 MessengerBot R 봇 프로필 하나만 생성.
- [ ] 기존 V4 RECRUIT/FEATURES 분리형 프로필은 모두 중지.
- [ ] 통합 생성 파일 하나 저장·Rhino 컴파일 성공.
- [ ] 구인방·기능방의 서로 다른 봇 표시명을 두 self-echo DataBase 키에 각각 설정.
- [ ] 두 대상 방의 `/봇버전`이 각각 응답 1회이며 UNIFIED와 서로 다른 RECRUIT/FEATURES installation ID를 출력.
- [ ] 두 방 모두 파티·스크림 명령은 RECRUIT profile로 서버 전송 1회.
- [ ] 두 방 모두 내전·전적·랭킹·운영 명령은 FEATURES profile로 서버 전송 1회.
- [ ] room/channel callback 값을 바꿔도 installation scope가 유지됨.
- [ ] 일반 sender 두 명이 생성 후 교차 수정·종료 가능.
- [ ] 잘못된 profile/installation을 직접 보낸 우회 요청은 서버에서 거절.
- [ ] 임의 installation ID와 잘못된 signature가 거절됨.
- [ ] current signing key 정상, 회전 중일 때 previous key 정상.
- [ ] 같은 event/body 재전송이 한 번만 반영되고 replay header를 반환.
- [ ] 같은 event/다른 body가 HTTP 409 `REPLAY_CONFLICT`.
- [ ] local 도움말·봇버전·사진·미리보기 안내는 server send 0회.
- [ ] internal/raw 명령은 server send 0회.
- [ ] command당 HTTP execute 1회, timeout 최대 5초, 자동 network retry 0회.
- [ ] 같은 callback/log ID 재전송은 같은 event ID, 봇 프로세스 재시작 뒤에는 다른 event ID.
- [ ] 두 방의 log ID가 같은 family에서 충돌하는지 관찰하고 결과 기록.
- [ ] V3/V41 pairing과 기존 route가 그대로 동작.
