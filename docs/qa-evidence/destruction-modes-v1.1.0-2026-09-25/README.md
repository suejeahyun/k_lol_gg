# 멸망전 모집·단계 탐색 1.1.0

**운영 반영 완료**: source `d76823e7da7893b11a98bcc7e255baaa27502b56`, tag `destruction-modes-v1.1.0`, Vercel `dpl_27ZTkVKoBKfFodPbKkyBzehAvCWy` READY. 2026-09-25T11:24:34.822Z 운영 health ready·기존 멸망전 조회·관리자 인증 경계·효과음 3종 정상. [운영 확인](./production-smoke.json), [후보 확인](./candidate-smoke.json). 이전 1.0.0 증거는 당시 기록으로 보존한다.

## 변경

- 칼바람(ARAM)·증바람(ARAM_MAYHEM)은 총 모집 상한으로 모집한다. 신청자의 포지션은 null이며 가짜 포지션을 배정하지 않는다. 참가 확정은 팀 수 × 5명, 경매·선수 교체·경기 로스터는 포지션 제한 없이 팀당 5명이다.
- 협곡 및 gameMode가 없는 과거 대회는 포지션별 모집·팀당 포지션별 1명을 유지한다. 기존 칼바람·증바람 설정에 총 상한이 없으면 기존 포지션별 상한의 합으로 호환한다.
- 미충원 인원 수만큼 남은 후보의 높은 최소 입찰가부터 합산해 경매 잔액을 보존한다. 임시 등급·선수별 최소 입찰가·주장 예산·본선 4강 BO3는 기존 산식을 유지한다.
- 대회 준비 → 참가 모집 → 주장·포인트 확정 → 선수 경매 → 예선 → 본선 → 종료를 눌러 해당 단계의 설정·명단·평가·경매·대진·결과를 조회한다. 현재 단계만 운영 작업을 표시하며, 조회로 진행 상태를 바꾸지 않는다. URL·새로고침·뒤로가기를 지원한다.
- 공통 카드 뒤집기·포인트·WAV 효과음 유지. 증바람 전적은 기존 운영자 확인 입력이며 Riot 자동 수집을 새로 추가하지 않았다.

## 검증

- check.txt: lint 0 errors(기존 경고 57 + Git 제외 로컬 복원 스크립트 경고 1), 타입·ERD·계약 445 PASS, 단위 1,009 PASS/1 SKIP, 이미지 검사·운영 빌드 PASS.
- database.txt: 격리 PostgreSQL 18 fresh·재실행. 세 모드의 모집~경매~예선~본선~MVP~종료 회귀. 칼바람·증바람은 실제 신청 20건 모두 position null, DB index 저장과 경기 snapshot 확인. 협곡의 null 신청 거절.
- [브라우저 검사](../../qa/destruction-navigation-recruitment-2026-09-25/interactions.json): 390/768/1440px 74화면, 단계 선택·모드별 생성 폼·로그인 신청 저장·효과음·중복/응답 유실·연결 회복 등 12개 상호작용. axe 위반·브라우저 예외 0.
- auth-http.txt: 실제 HTTP 인증·TOTP·세션·역할 경계 검사. secrets.txt: 현재 트리 비밀정보 검사.
- [백업·복원](./production-backup-restore.json): 운영 DB 읽기 전용 snapshot, 비공개 논리 백업, 로컬 복원 후 189테이블 행 수·논리 컬럼·915제약조건·migration head 일치. PostgreSQL17→18 카탈로그 차이는 논리 스키마로 대조. 로컬 0045→0046 upgrade·재실행·행 보존 PASS.

## DB 적용과 복구

생성·검토한 0046_overconfident_robbie_robertson은 destruction_application_index.position의 NOT NULL만 해제한다. 테이블·행·기존 포지션 값·경매금은 변경하지 않는다. SQL SHA256 ea714fd3321cb41bfa7d480a4043e3dae851234971aec1ce82bd40b43109ca88. 운영 0045→0046 적용·재실행 PASS. db-migration.json에 적용 시각과 전후 상태를 기록했다.

백업 파일과 복원 cluster는 .private/recovery에만 보관하고 외부 업로드/Git에 포함하지 않는다. 이전 앱은 새 position=null 데이터를 처리할 수 없으므로 신규 무포지션 신청이 저장된 이후에는 이전 앱으로 단순 롤백하지 않고 forward-fix한다. schema down migration이나 원본 데이터 삭제는 실행하지 않는다.

실제 운영 참가자 신청·경매 및 Riot 조회는 테스트하지 않는다. 운영 smoke는 기존 공개 조회·권한 경계·효과음·health를 확인한다.
