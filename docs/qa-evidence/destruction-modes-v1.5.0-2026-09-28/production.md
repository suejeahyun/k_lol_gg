# 멸망전 본인 기재 승패 1.5.0 — 운영 반영

- source: 6969b78992a1bad966749ea6771447d9694db951
- tag: destruction-modes-v1.5.0
- deployment: dpl_EgKnNzS66RKjD3oZsQ2FP5yZ29fx, READY
- immutable URL: https://k-lol-meqr6or78-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- 확인: 2026-09-28T13:49:47.663Z

[후보 검사](candidate-smoke.json)와 [운영 검사](production-smoke.json)에서 health ready, 공개 점수표 정상, 관리자·예약 실행 인증 경계를 확인했다. [전체 검사](check.txt)는 계약 445개, 단위 1025개 통과·1개 skip, 기존 lint 경고 58개, 빌드 통과다. [DB 검사](database.txt)와 [브라우저 상호작용](../../qa/destruction-self-reported-2026-09-28/interactions.json)은 정수 입력, 모드별 신청, 본인 수정, 재계산, 멱등성·소유권 및 확정 후 잠금을 확인했다. 390/1440px 화면 24개, axe 위반 및 브라우저 예외 0개다.

[실제 운영 전환](live-transition.json): 예약 작업이 기존 미확정 test 대회를 ABSOLUTE_V2로 전환했다. 연결 계정의 본인 기재 승패는 아직 없으므로 해당 20%는 NO_DATA다. 나머지 기존 네 점수는 보존됐으며 본인이 승패를 입력할 수 있는 단계다. 실제 숫자를 임의로 대신 기재하지 않았다. 최종 총점·티어는 미확정이며 가능한 범위는 58.76~78.76점이다.

배포 전 READY 기준은 dpl_GLGTUHjPR97zRRz2E2Y1VUE1BM7f(1.4.2 런타임, 문서 커밋 5e890bc7)이며, 영향 대상 대회 1개·참가자 20명의 원본을 비공개로 백업했다. 데이터 전환 후 이전 서버는 새 공식 버전을 읽지 못하므로 단순 배포 rollback을 하지 않는다. 복구는 forward-fix 또는 이후 신규 입력 이력을 보존한 스냅샷 복원 절차를 따른다. 확정 경매와 협곡은 변경하지 않았고 운영 DDL을 실행하지 않았다.
