# 실기기 체크리스트

현재 상태: 전 항목 미확인.

- [ ] 휴대폰 1대에 RECRUIT/FEATURES MessengerBot R 봇 프로필을 각각 하나씩 생성.
- [ ] 공용 DataBase의 네 설정을 한 번 저장하고 두 프로필이 함께 사용.
- [ ] RECRUIT 생성 파일 저장·Rhino 컴파일 성공.
- [ ] FEATURES 생성 파일 저장·Rhino 컴파일 성공.
- [ ] 두 profile의 `/봇버전`이 서로 다른 installation ID를 출력.
- [ ] RECRUIT 프로필의 응답 방은 구인 관련방 하나만 선택.
- [ ] FEATURES 프로필의 응답 방은 나머지 기능방 하나만 선택.
- [ ] 구인 관련방에서는 RECRUIT만, 기능방에서는 FEATURES만 응답하며 반대 방에서는 침묵.
- [ ] room/channel callback 값을 바꿔도 installation scope가 유지됨.
- [ ] 일반 sender 두 명이 생성 후 교차 수정·종료 가능.
- [ ] 반대 profile command는 휴대폰에서 server send 0회, 우회 요청은 서버에서 `WRONG_PROFILE`.
- [ ] 임의 installation ID와 잘못된 signature가 거절됨.
- [ ] current signing key 정상, 회전 중일 때 previous key 정상.
- [ ] 같은 event/body 재전송이 한 번만 반영되고 replay header를 반환.
- [ ] 같은 event/다른 body가 HTTP 409 `REPLAY_CONFLICT`.
- [ ] local 도움말·봇버전·사진·미리보기 안내는 server send 0회.
- [ ] internal/raw 명령은 server send 0회.
- [ ] command당 send 1회이며 network retry만 같은 event ID를 재사용.
- [ ] V3/V41 pairing과 기존 route가 그대로 동작.
