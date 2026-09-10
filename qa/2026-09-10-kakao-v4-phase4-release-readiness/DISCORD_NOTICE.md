# 디스코드 복붙용 공지

```text
[K-LOL.GG 카카오봇 V4 배포 준비 점검 안내]

V4 서버 기능, DB migration, RECRUIT/FEATURES 분리, 재전송 방지 구조를 소스와 자동 테스트로 점검했습니다.

- receipt/nonce 및 설치본·방·프로필 DB 구조 확인
- V3 기존 API와 V4 API의 서버 측 병행 유지 확인
- RECRUIT/FEATURES 설치본 ID 분리 및 profile 차단 확인
- V4 기능 집중 테스트 105건과 release-readiness 계약 5건 통과

V4 최초 pairing 차단 항목은 deterministic installation-scope 인증으로 해결했습니다. V4는 room registry/pair-room을 사용하지 않으며 V3/V41의 기존 pairing은 그대로 유지합니다. 다만 운영 환경변수·DB·실기기는 아직 확인하지 않아 실제 배포는 보류합니다.

현재 운영 서버·DB·카카오봇에는 변경을 적용하지 않았습니다. 기존 V41 봇은 그대로 유지합니다.
```
