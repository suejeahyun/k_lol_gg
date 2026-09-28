# 멸망전 판수 평가 1.6.0 — 운영 반영

- source: 5001ef243cac1baf8c15a61eb4ea01cfa225f173
- tag: destruction-modes-v1.6.0
- deployment: dpl_2vM1qJsVjYzuJD3ANqqoqF3CxVHP, READY
- immutable URL: https://k-lol-8tzluws7n-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- 확인: 2026-09-28T14:22:09.830Z

[후보 검사](candidate-smoke.json), [운영 검사](production-smoke.json): health ready, 점수표 200, 관리자·cron 인증 경계 통과. [공개 화면](public-verification.json)에서 ABSOLUTE_V3, 30·50·10·5·5, 300판 상한·승률 미반영 안내를 확인했다.

[전체 검사](check.txt): 계약 445개, 단위 1025개 통과·1개 skip, 기존 lint 경고 58개, 타입·ERD·빌드 통과. [DB 검사](database.txt): 본인 입력, 권한·멱등성, V2→V3 예약 작업 전환, 비중 재계산, 확정 후 잠금 통과. [화면·상호작용](../../qa/destruction-game-count-2026-09-28/interactions.json): 390/1440px 24화면, 6개 상호작용, axe 위반·브라우저 예외 0개.

[운영 전환](live-transition.json): 기존 미확정 test 대회의 비중이 30·50·10·5·5 및 ABSOLUTE_V3로 전환됐다. 실제 연결 계정의 기존 네 원점수(솔랭 78.46, 내전 43.65, 챔피언 100, 도전과제 72.93)는 유지됐다. 배포 확인 중 본인이 기재한 100승 55패, 총 155판을 확인했다. 판수 항목 51.67점, 최종 67.74점·A등급, 최소 입찰 250P·주장 1750P다. 운영 계정의 숫자를 임의로 채우지 않았으며, 새로 기재된 원본을 다시 백업한 뒤 예약 작업의 전환을 확인했다.

판수 점수는 min((승수+패수)/300×100, 100)이며 승률은 미반영한다. 300판은 초기 운영 경험량 기준으로 예측력 검증을 주장하지 않는다. 미입력과 명시적 0판(0점)을 구분한다.

배포 전 기준은 c3b05d99 / dpl_2Qt35k5W86ZrafXiQrhwkSScn1eZ (1.5.0 런타임), 영향 대상 대회 1개·참가자 20명을 비공개 백업했다. 이미 확정한 대회·협곡과 별도 사용자 설정 비중은 유지한다. V3 전환 뒤 이전 런타임만 되돌리면 공식 버전을 읽지 못하므로 forward-fix 또는 신규 입력을 보존한 스냅샷 복원 절차가 필요하다. 운영 DDL 없음.
