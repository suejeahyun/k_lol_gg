# Read-only production log evidence

- 대상 deployment: `dpl_7ggWSkbjf3Qq9aoQaGT8Bn6hf2ue`
- host: `k-lol-gg.vercel.app`
- 관찰 구간: 2026-09-09 18:52~18:54 KST
- `POST /api/integrations/kakao/openchat`: 5건
- 결과: 5건 모두 `401 INVALID_SIGNATURE`
- 발생 시각: 18:53:46.078, 18:53:49.339, 18:53:58.482, 18:54:11.167, 18:54:18.242 KST
- 요청 간격: 약 3~13초
- 동일 millisecond 중복: 0건
- `/api/integrations/kakao/recruits`: 0건
- `SIGNING_KEY_UNAVAILABLE`, `ROOM_FORBIDDEN`, `SENDER_FORBIDDEN`: 0건
- current/previous 서버 secret와 일치한 서명: 0건

판정:

- 확인됨: 운영 host/path/deployment까지 요청이 도달했고 서명 검증에서 차단됐다.
- 확인됨: 하나의 서버 요청이 서버 내부에서 두 번 기록된 형태가 아니라 시간차가 있는 별도 요청이다.
- 추정: 여러 활성 MessengerBot R 스크립트·프로필 또는 기기 재시도가 별도 요청을 만들었다.
- 미확인: R13 요청은 서명이 검증되지 않아 신뢰 가능한 installation ID/key ID/delivery ID를 서버가 확정할 수 없다.

이 문서는 읽기 전용 조회 결과이며 운영 설정·배포·데이터는 변경하지 않았다.
