# 플레이어 Riot ID·티어 편집 v1.0.2

승인된 활성 사용자는 내 정보에서 Riot ID, 현재 티어와 최고 티어를 직접 변경할 수 있다. ADMIN과 SUPER_ADMIN도 플레이어 상세 수정 화면에서 같은 항목을 관리할 수 있다.

티어만 변경할 때는 Riot 연결을 유지한다. Riot ID를 변경할 때는 등록부와 보호 PUUID의 불일치를 막기 위해 기존 Riot 연결을 같은 transaction에서 해제하고 진행 중 동기화 작업을 취소한다. 저장 충돌이 발생하면 이 부수 변경과 감사 이벤트도 함께 rollback한다. 이후 직접 연결과 RSO는 변경된 등록부 Riot ID와 일치하는 계정만 다시 연결한다.

stale revision 뒤에는 본인 폼도 revision 기준으로 다시 마운트해 화면 입력값까지 최신 서버값으로 복구한다. 최종 커밋 기준 전체 `npm run check`, PostgreSQL 18 임시 클러스터의 전체 `npm run test:db`, 실제 Next HTTP 본인·관리자 수정 흐름, 운영 무변경 인증 smoke를 통과했다. 연결 상태 중복 충돌 rollback과 성공 요청 replay 무중복도 link·job·audit까지 확인했으며, 운영 Neon의 기존 연결/등록 Riot ID 불일치는 0건이다. 운영 DB migration과 운영 사용자 데이터 변경은 없다. 검증 상세는 [`docs/qa-evidence/player-profile-edit-2026-09-12/README.md`](../qa-evidence/player-profile-edit-2026-09-12/README.md)에 기록했다.
