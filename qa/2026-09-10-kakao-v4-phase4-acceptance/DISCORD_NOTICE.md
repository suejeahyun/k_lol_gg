🧪 Kakao V4 Phase 4 QA 계약 추가 안내

- 제품 코드는 변경하지 않고 테스트·QA 문서만 추가했습니다.
- Phase 4 신규 baseline: 8 PASS / 17 FAIL
- 기존 회귀: Phase 2 116/116 PASS, Phase 3 70/70 PASS, V1 fixture 12/12 PASS

현재 출시 차단 항목은 다음과 같습니다.

- 구인 웹도우미 PUBLIC alias 4종의 501
- unknown 명령의 501 처리
- FEATURES 도움말 V1 문구 불일치
- 구인도움말·구인웹도우미의 불필요한 서버 전송
- INTERNAL/raw V2 대표 9종의 public transport 진입
- 사진상태·내전확인·미리보기취소의 501

반대 profile 403 WRONG_PROFILE, malformed 무전송, command당 client send 최대 1회, room/sender role 미사용은 확인했습니다. 최종 봇은 RECRUIT 8,700자, FEATURES 8,829자로 40k 미만이며 ES5 parse와 Rhino warning 후보 0, timeout 5초 조건을 통과했습니다.

실기기 검증은 Android/MessengerBot R 환경이 없어 BLOCKED입니다. push, deploy, DB, secret 변경은 없습니다. 현재 Phase 4는 출시 가능 상태로 판정하지 않았습니다.
