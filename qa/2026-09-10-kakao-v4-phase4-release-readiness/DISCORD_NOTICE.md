# 디스코드 복붙용 공지

```text
[K-LOL.GG 카카오봇 V4 배포 준비 점검 안내]

V4 서버 기능, DB migration, RECRUIT/FEATURES 분리, 재전송 방지 구조를 소스와 자동 테스트로 점검했습니다.

- receipt/nonce 및 설치본·방·프로필 DB 구조 확인
- V3 기존 API와 V4 API의 서버 측 병행 유지 확인
- RECRUIT/FEATURES 설치본 ID 분리 및 profile 차단 확인
- V4 기능 집중 테스트 105건과 release-readiness 계약 5건 통과

다만 신규 V4 설치본을 카카오방에 최초 연결하는 공식 pairing 명령이 아직 없어 현재 배포는 보류합니다. 이 경로를 추가하고 staging DB·실기기 검증까지 통과한 뒤 운영 적용 일정을 다시 안내하겠습니다.

현재 운영 서버·DB·카카오봇에는 변경을 적용하지 않았습니다. 기존 V41 봇은 그대로 유지합니다.
```
