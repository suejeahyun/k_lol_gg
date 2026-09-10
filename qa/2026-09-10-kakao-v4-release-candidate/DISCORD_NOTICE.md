# 디스코드 복붙용 공지

```text
[K-LOL.GG 카카오봇 V4 Release Candidate 안내]

카카오 V4 Phase 4+5 통합과 자동 검증을 완료했습니다.

- 공개 V1 명령의 501 응답 0건
- 도움말·봇버전·사진·미리보기 안내는 서버 전송 없이 처리
- 내부 운영/raw 명령은 공개 V4 전송에서 차단
- RECRUIT/FEATURES deterministic installation ID와 profile 격리
- 휴대폰 1대의 통합 봇 프로필 1개로 두 카카오톡 방 처리
- 파티·스크림은 RECRUIT, 내전·조회·운영은 FEATURES로 자동 분류
- 메시지당 HTTP 전송 1회, timeout 최대 5초, 자동 재시도 없음
- 방 이름·room·channel을 파싱하거나 권한에 사용하지 않음
- 두 방의 서로 다른 봇 표시명 모두 self echo 차단
- room registry/pair-room 없이 installation-scope 인증
- current/previous HMAC, 잘못된 설치본·프로필·서명 차단
- 일반 사용자 두 명의 교차 수정과 중복 event replay 보호
- V3/V41 기존 pairing과 API는 그대로 유지

자동 검증
- Phase 4 acceptance 25/25
- Phase 5 installation 보안 9/9
- Phase 2·3·V1 회귀 186/186
- 전체 contract 307/307, unit 609/609
- typecheck, ESLint, production build, tree secret scan 통과

P0 최초 pairing 차단은 RESOLVED입니다. 서버 V4 endpoint는 배포됐지만 통합 휴대폰 봇, identity secret, 실기기 송수신은 아직 운영 반영 전입니다.
```
