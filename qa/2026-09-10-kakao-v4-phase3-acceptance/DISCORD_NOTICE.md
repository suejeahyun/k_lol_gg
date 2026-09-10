🧪 Kakao V4 Phase 3 QA 계약 추가 안내

- 테스트/QA 문서만 추가했으며 제품 코드는 변경하지 않았습니다.
- 기존 Phase 2 회귀 게이트: 116/116 PASS
- 신규 Phase 3 클라이언트 단일 전송: 21/21 PASS
- 신규 Phase 3 서버 acceptance: 2 PASS / 31 FAIL

현재 실패는 내전 생성·현황·상세·전체 명단 동기화, 스크림 전체 양식/활성 대회 판별, 운영 양식 4종, 등록·결과·경고·사진·예약공지의 미구현 501과 V1 응답 불일치를 출시 게이트로 기록한 결과입니다.

동일 eventId 본문 충돌 409 `REPLAY_CONFLICT`, 설치본/프로필 기반 권한 계약, command당 client send 1회는 확인했습니다. 성공 mutation replay는 Phase 3 구현 경로가 아직 없어 FAIL입니다.

실기기 검증은 Android/MessengerBot R 환경이 없어 BLOCKED 상태이며, 구현 후 체크리스트로 재검증해야 합니다.

⚠️ 운영 배포, push, DB, secret 변경은 없습니다. 현재 Phase 3는 출시 가능 상태로 판정하지 않았습니다.
