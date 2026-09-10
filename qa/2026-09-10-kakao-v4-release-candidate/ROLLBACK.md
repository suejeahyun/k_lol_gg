# 롤백 절차

1. 오류가 발생한 V4 MessengerBot profile을 먼저 중지한다.
2. 동일 방에서 V4와 V41을 동시에 실행하지 않는다.
3. 백업한 V41 소스와 private 설정을 복원하고 기존 pairing 상태를 유지한다.
4. server 회귀가 원인이면 승인된 이전 server revision으로 배포를 되돌린다.
5. V3 route, 기존 pairing row, previous signing key를 관측 기간 전에 삭제하지 않는다.
6. V4가 만든 정상 도메인 데이터나 receipt를 자동 삭제하지 않는다.
7. 로그의 public error code, trace ID, event ID hash와 영향 command 범위를 보존한다. secret과 원문 개인정보는 기록하지 않는다.
8. read-only 점검으로 중복 mutation 유무를 확인하고 데이터 보정이 필요하면 별도 승인·백업·복구 계획을 세운다.

