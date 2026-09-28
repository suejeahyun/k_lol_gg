# 멸망전 자동 평가 1.4.2 — 운영 확인

- source: 67cddf82ea41a89bdd3bee50f57d68c8000ec1a7
- tag: destruction-modes-v1.4.2
- deployment: dpl_p1iG6FnovVyaBw3PzTexbvzqc7Ya, READY
- immutable URL: https://k-lol-537kjw886-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- 확인: 2026-09-28T13:21:21.421Z

[전체 검사](check.txt), [격리 DB 검사](database.txt), [후보 smoke](candidate-smoke.json), [운영 smoke](production-smoke.json)를 통과했다. 계약 445개, 단위 1022개 통과·1개 skip, 기존 lint warning 58개. health ready, 공개 점수표 200, 관리자 및 cron 인증 경계를 확인했다. 예약 cron은 1분 주기다.

사용자가 지정한 연결 계정을 기존 test 대회에서 재평가했다. 백업·행 잠금·revision 증가·감사 이벤트·outbox를 갖춘 유지보수 트랜잭션으로 미확인 항목만 재예약했으며, 실제 평가는 운영 예약 작업이 수집했다. 점수 수동 주입, 비중 변경, 팀 확정은 하지 않았다. 원본 계정 식별정보와 백업은 Git 밖 비공개 경로에 보관했다.

[실제 결과](live-evaluation.json): 도전과제 72.93점 복구. 일반 칼바람은 90→180→365일 조회 후 제공 기록 없음으로 남아 있다. 솔랭 78.46, 내전 43.65, 챔피언 100점. 가능한 총점 58.76~78.76, 최종 총점·티어·가격은 미확정이다. 누적 도전과제 점수를 증바람 승률이나 판수로 해석하지 않는다.

진단 배포에서 실제 config가 tracking을 생략하는 것을 확인했다. 고정 누적 ID 101301/101302/101307과 각각의 이름·활성 상태·MASTER 목표를 검증하고 명시적 시즌/만료 데이터를 거부한다. [진단 배포 기록](diagnostic-production-smoke.json)을 따로 보존했다.

복구 기준은 변경 전 READY 배포 dpl_C4yCJNnvPwn3CLVxeJQL8c5PoADj이다. 운영 DDL 및 사이트 전체 MMR 재계산은 실행하지 않았다. 챔피언 분포는 실제 연결 참가자 1명만 존재해 계산식을 조정하지 않았다.
