# 디스코드 복붙용 공지

```text
[K-LOL.GG 카카오봇 V4 Release Candidate 안내]

카카오 V4 Phase 4+5 통합과 자동 검증을 완료했습니다.

- 공개 V1 명령의 501 응답 0건
- 도움말·봇버전·사진·미리보기 안내는 서버 전송 없이 처리
- 내부 운영/raw 명령은 공개 V4 전송에서 차단
- RECRUIT/FEATURES deterministic installation ID와 profile 격리
- room registry/pair-room 없이 installation-scope 인증
- current/previous HMAC, 잘못된 설치본·프로필·서명 차단
- 일반 사용자 두 명의 교차 수정과 중복 event replay 보호
- V3/V41 기존 pairing과 API는 그대로 유지

자동 검증
- Phase 4 acceptance 25/25
- Phase 5 installation 보안 8/8
- Phase 2·3·V1 회귀 186/186
- 전체 contract 304/304, unit 608/608
- typecheck, ESLint, production build, tree secret scan 통과

P0 최초 pairing 차단은 RESOLVED입니다. 다만 운영 DB·환경변수 실제 구성·MessengerBot-R 실기기는 아직 확인하지 않았으며 운영 배포도 수행하지 않았습니다.
```
