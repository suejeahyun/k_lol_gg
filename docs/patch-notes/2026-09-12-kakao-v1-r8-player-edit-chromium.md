# 카카오 V1 strict R8·플레이어 편집 Chromium QA 초안

완전히 빈 내전 전체 양식이 파티 구인으로 잘못 분류되어 `RECRUIT` 프로필의 `WRONG_PROFILE`을 받고, 이 오류가 인증 설정 문제로 축약되던 경로를 확인했다. R7의 빈 스냅샷 라우팅을 유지하면서 R8은 `WRONG_PROFILE`, `KAKAO_V4_TIMESTAMP_STALE`, `INVALID_SIGNATURE`를 각각 전체 설치본 교체, 휴대폰 자동 시간, 실제 인증 설정 확인으로 구분한다. 모든 활성 서버 호출 경로가 같은 안전 분기를 사용하고, HTTP 400의 구체적인 누락 필드 안내와 기존 V1 정상 문구는 보존한다.

플레이어 편집은 임시 PostgreSQL 18과 실제 Next 서버, 격리 Chromium에서 본인·관리자 흐름을 검증했다. 키보드 저장, 화면과 DB revision 갱신, concurrent 변경 뒤 HTTP 412 최신값 재마운트, 티어 전용 변경의 Riot 연결 유지, Riot ID 변경의 연결 해제·PUUID 제거·작업 취소·안전 감사 표시를 확인했다. `npm run test:db`는 종료 코드 0이며 계정 route 3/3, TypeScript와 ESLint도 통과했다.

R8 오류 처리 보완 전 전체 `npm run check`는 359개 중 운영 양식 누락 안내 회귀 1개가 실패했다. 해당 400 안내를 보존하도록 고친 뒤 전체 check를 다시 실행해 계약 359/359, 단위 검사, 홈 아트 검증과 프로덕션 빌드까지 통과했다. 관리자 브라우저 포커스 하네스도 공용 CDP 키보드 입력으로 보완한 뒤 `npm run test:db` 전체를 처음부터 다시 통과했다. 현재 변경은 커밋·tag·Vercel 배포 전이고 R8 휴대폰 설치와 실제 Kakao 송수신도 미확인이다. 따라서 이 문서는 아직 운영 릴리스 공지가 아닌 배포 전 초안이다.

검증 범위와 재현 절차는 [`docs/qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/README.md`](../qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/README.md)에 기록했다. 디스코드 복붙 공지 초안은 같은 폴더의 [`DISCORD_NOTICE.md`](../qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/DISCORD_NOTICE.md)에 있다.
