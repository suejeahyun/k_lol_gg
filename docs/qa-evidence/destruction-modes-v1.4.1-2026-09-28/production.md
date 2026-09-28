# 멸망전 자동 평가 1.4.1 — 운영 배포

- source: 78a90191051e1fac28603cf9f865b6100173a02b
- tag: destruction-modes-v1.4.1
- deployment: dpl_CpHDpYe5LusRLrXLmH2o4CgNafeN, READY
- immutable URL: https://k-lol-5jbzvj7cb-tjdmswo11-3715s-projects.vercel.app
- 운영: https://k-lol-gg.vercel.app
- 확인: 2026-09-28T12:38:53.603Z

[후보 검사](candidate-smoke.json)와 [운영 검사](production-smoke.json)에서 health 200 ready, 관리자 API 401, 관리자 화면 307, 무인증 평가 cron 401, 공개 test 점수표 200을 확인했다. 자동 평가 cron의 1분 주기 등록을 확인했다. 내전 통계 호환을 포함한 [전체 검사](check.txt) 및 [격리 DB 검사](database.txt)가 통과했다. 기존 UI의 16개 화면 검증은 1.4.0 근거를 따른다.

운영 alias를 기존 READY 배포 dpl_5Zk83S7q36cu2v3EWdWNnowoCskN으로 되돌릴 수 있다. DDL이나 전체 MMR 재계산을 실행하지 않았다. 실제 계정 테스트는 이름이 일치하는 두 계정의 선택을 기다리는 중이며, 이 시점에는 실계정 평가가 완료되었다고 판정하지 않는다.

실제 예약 실행 확인: [cron 관측](cron-live.json)에서 test 대회의 revision 24→28, 자동 평가 감사 이벤트4건, 항목4건 수집 및 기본 비중 저장을 확인했다. 관리자 페이지를 열거나 수동 실행하지 않은 서버 예약 작업 결과다. 가상 참가자의 자료 누락은 미확인으로 보존되었다.
