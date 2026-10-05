# 2026-10-05 실제 구현 기반 기능·경로 인벤토리

## 판정 원칙

이 목록은 `src/app/**/page.tsx`, `route.ts`, metadata, 실제 TSX 조작 요소와 메뉴 상수에서 다시 추출했다. 모든 경로의 소스 존재·분류를 확인했으며, 테스트 파일의 존재를 현재 실행 통과로 표시하지 않는다. 기능별 실제 결과는 이번 릴리스 검증 기록과 연결한다. 과거의 `page-contract` 표시는 정상 업무 완료나 운영 준비 완료를 뜻하지 않는다.

기준 HEAD: `bd6433d207b9358109ad3939f4197b09dc78c34a`. 페이지 108개, API handler 212개, 호환 handler 63개, metadata 3개, 명시 HTTP method 499개. 소스 조작 요소 1088개·메뉴 항목 138개는 [JSON](feature-inventory.json)에 파일·행·이름/식·대상·handler와 함께 기록했다. 동적 반복 요소는 소스 한 위치로 센다.

## 현재 배포·검사 범위

조사 시작 시점의 운영 alias는 `dpl_6sT2FPF3ik26uwqdHDSh1sAExQC4`, READY, source `bd6433d207b9358109ad3939f4197b09dc78c34a`다. `origin/main`과 조사 시작 worktree가 같은 SHA다. 최신 STATUS의 `dpl_EvyosSgPiYDnFMiMWqU2KTGzt5AX` 다음에 문서 커밋이 main 자동배포되어 ID가 달라졌다. 두 source 사이 runtime 변경은 없다. 배포 시 현재 ID를 복구 기준으로 다시 확인한다.

현재 관리자 계약은 ADR-0010(2026-09-30)의 비밀번호 기반 ADMIN 목적 세션이다. 승인 상태·role·authVersion·세션 폐기·same-origin은 유지한다. V1 기능 카탈로그의 TOTP 필수 표는 과거 기준이며 ADR가 명시적으로 대체한다. 외부 봇의 서명/nonce 및 V1 oracle과 승인된 ADR-0011/0012의 병합 정책은 보존한다.

과거 108 페이지/486 화면 근거는 HTML/DOM 검사다. 상태 코드, h1/main, 문서 언어, overflow, 입력 크기, 조작 이름, 이미지 로드·alt, 중복 ID를 확인했으며 모든 버튼의 업무 E2E를 확인한 기록은 아니다. 과거 HTTP/DOM 건수는 아래 경로마다 구분했다. 현재 단위·DB·HTTP 실행 결과와 실제 조작 결과는 이번 릴리스의 별도 근거가 우선한다.

## 이번 실행과 검토 결과

2026-10-05 격리 환경의 [baseline HTTP](baseline-local-http.json)는 실제 계정/관리자 로그인 뒤 108개 페이지·169개 경로 조건에서 통과했다. JSON 각 경로 currentReview.baselineHttp에 결과를 연결했다. 이는 수정 완료 전 빌드 검사여서 최종 후보 검증을 대신하지 않는다. [격리 DB 로그](database.log)는 계약과 인증/관리자 비밀번호/플레이어/시즌/계정 HTTP 검증 exit 0을 확인했다. 운영 데이터로 쓰기 테스트하지 않았다. 최종 변경 검사 결과는 아래 후속 기록과 [릴리스 본문](README.md)을 기준으로 한다. 브라우저 조작과 운영 배포는 각 단계의 별도 근거를 따른다.

MMR UI 수정은 실제 페이지 렌더와 실제 query parser를 연결한 회귀 6개, 기존 UI 계약 3개, parser 2개가 통과했고 focused eslint·diff-check도 통과했다. 페이지 이동·포지션 점수/표본·빈 결과·잘못된 주소·동일 조건 재시도를 분리 확인했다. 이 회귀를 포함한 최종 전체 check도 통합 담당자가 실행해 통과했다.

2026-10-06 KST 기록 갱신: [최종 필수 검사](check.log)는 lint·타입·ERD·계약·단위·이미지 명세·production build를 통과했다. 계약 463개·단위 1,045개 통과, 환경 조건부 skip 1개와 기존 lint 경고 58개를 구분한다. [최종 경로 HTTP](local-http.json)는 합성 로그인 세션으로 108개 페이지·169개 조건을 통과했다. [서비스 조회 HTTP](local-service-http.json)는 익명 GET 31개로 홈 영역 순서, 접수 코드 복귀 링크, MMR 두 페이지/검색·잘못된 주소, 랭킹 API 정렬, 400·401 보호 경계와 health를 확인했다. JSON의 currentReview.finalHttp와 serviceReadOnlyHttp가 해당 경로별 근거다. 조회 응답 검증을 저장 완료나 실제 브라우저 조작의 대체 근거로 사용하지 않는다. 최종 브라우저 증거 정리 및 후보·운영 배포는 통합 담당의 후속 확인 대상으로 남긴다.

후속 검토 갱신: 접수 생성 완료와 서버 경로 commit 사이의 P2 업로드 경합을 발견해 `navigationPending` 잠금과 직접 handler 회귀로 수정했다. 원장의 소스 행은 이 수정까지 포함하며 수정 전 실패·수정 후 6개 회귀 통과와 보강 후 최종 전체 check exit 0을 확인했다. 169/31 조회 결과는 잠금 보강 전 통합 빌드의 조회 근거로 구분한다. [브라우저 기록](browser-observations.md)의 회차 전환·ARAM 저장은 확인했지만, CUA 취소 확인창 이후 중단된 취소·접수 생성→새 접수·후속 viewport/키보드는 완료로 표시하지 않는다. 후보·운영 배포 역시 대기 상태다.

## 사용자 목적과 기능군

| 기능군 | 사용자 과업과 현행 기능 | 소스에서 확인한 경로 수 | 검증 근거 찾는 위치 |
|---|---|---:|---|
| 홈·목적별 탐색·로그인 후 복귀 | 홈 여섯 영역, 기능 검색, 전역·모바일 메뉴, 내 활동 진입 | 13 | JSON suiteMapping.home (9개 관련 검사 소스; 실행 결과 아님) |
| 가입·로그인·비밀번호·계정 승인 | 약관 동의, 신규/기존 Riot ID 가입, 승인 대기, 회원/관리자 세션, 비밀번호 변경/복구 | 40 | JSON suiteMapping.auth (15개 관련 검사 소스; 실행 결과 아님) |
| 플레이어 등록부·검색·프로필 | 검색/정렬/필터, 프로필과 시즌·포지션·챔피언 통계, 관리자 수정/재활성화 | 12 | JSON suiteMapping.player (19개 관련 검사 소스; 실행 결과 아님) |
| 내전·시즌 참가 | 모집 회차·정원·예비·신청/수정/취소·관리자 검토·카카오 신청 연결 | 13 | JSON suiteMapping.applications (17개 관련 검사 소스; 실행 결과 아님) |
| 같이 할 사람·파티 모집 | 구인 공개 조회, 빈자리·예비 표시, 카카오 모집 양식·현황·마감 | 9 | JSON suiteMapping.recruits (16개 관련 검사 소스; 실행 결과 아님) |
| 이벤트 대회 | 목록·상세·신청·팀·대진·결과·관리자 수명주기 | 15 | JSON suiteMapping.event (2개 관련 검사 소스; 실행 결과 아님) |
| 멸망전 | 모드·신청·주장·점수표·평가·경매·대진·결과·MVP 투표·갤러리 | 25 | JSON suiteMapping.destruction (11개 관련 검사 소스; 실행 결과 아님) |
| 실력별 팀 만들기·저장 | 참가자·포지션 선택, 계산·후보 선택, 저장·복원·재계산·추천 | 45 | JSON suiteMapping.balance (13개 관련 검사 소스; 실행 결과 아님) |
| 무작위 팀·진영 정하기 | 이름/티어 입력, 생성, 오류 포커스, 결과 복사·초기화 | 6 | JSON suiteMapping.random (4개 관련 검사 소스; 실행 결과 아님) |
| 경기 기록·결과 제출·운영 검토 | 검색·상세, 제출/이미지 업로드/취소/이어하기, 검토·승인·거절·게시·무효·복원 | 38 | JSON suiteMapping.matches (27개 관련 검사 소스; 실행 결과 아님) |
| 시즌 랭킹·승률·MVP·MMR | 시즌/정렬/페이지·랭킹 3종, 집계 projection·정합성·재계산 | 9 | JSON suiteMapping.statistics (13개 관련 검사 소스; 실행 결과 아님) |
| 하이라이트·갤러리·챔피언·자료 | 목록·상세·재생·이미지·작성/편집/게시·보관/삭제·비공개 자산 권한 | 34 | JSON suiteMapping.media (19개 관련 검사 소스; 실행 결과 아님) |
| 커뮤니티 운영·징계 과제 | 익명 집계·본인 과제·증거 업로드·심사·운영 기록 | 19 | JSON suiteMapping.discipline (5개 관련 검사 소스; 실행 결과 아님) |
| 문의·운영 신청서 | 건의/오류 문의, 접수번호·중복 요청, 관리자 양식 검토·보존 정리 | 12 | JSON suiteMapping.support (6개 관련 검사 소스; 실행 결과 아님) |
| Riot 계정·최근 경기·연동 | 본인/관리자 연결·해제·동기화·재시도·분석, RSO 준비 상태 | 23 | JSON suiteMapping.riot (18개 관련 검사 소스; 실행 결과 아님) |
| 카카오 외부 연동 | V4 서명·nonce·양식 병합·bot 호환·방 설정·알림 poll/ack | 43 | JSON suiteMapping.kakao (72개 관련 검사 소스; 실행 결과 아님) |
| 관리·운영 설정·감사·백업·작업 | 설정·로그·이용 현황·내보내기·정리·health·예약 작업·복구 | 20 | JSON suiteMapping.operations (20개 관련 검사 소스; 실행 결과 아님) |
| 도움말·정책·설치·호환 주소 | 이용 안내·정책·앱 설치/PWA·이전 주소 복귀·잘못된 주소 안내 | 10 | JSON suiteMapping.guides (13개 관련 검사 소스; 실행 결과 아님) |

## 모든 경로의 점검 결과

`최종 HTTP`는 이번 통합 빌드의 페이지 GET/HTML 검사를 뜻하며, API는 별도 읽기 smoke 또는 DB/HTTP 계약 근거를 따른다. `소스 확인`은 경로·method·기능군·조작 연결을 분류한 결과다. `과거 HTTP/DOM`은 2026-10-03 소스 근거의 행 개수이며 이번 실행을 대신하지 않는다. API의 0/0은 기존 DB/HTTP 계약 부재를 뜻하지 않는다(페이지 캡처 범위 밖). JSON의 directTestReferences, suiteMapping에서 검증 소스를 찾고, 이번 검사 로그와 대조한다.

| 경로 | 종류·method | 기능군 | 결과 | 과거 HTTP/DOM |
|---|---|---|---|---|
| `/` | page GET | home | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/account` | page GET | auth | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/account/discipline` | page GET | discipline | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/account/password` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/account/riot` | page GET | riot | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/account/tier` | compatibility-handler GET/HEAD | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin` | page GET | operations | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/ai-requests` | page GET | operations | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/balance` | page GET | balance | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/balance-ai` | page GET | balance | 소스·최종 HTTP 5조건 통과 | 5/15 |
| `/admin/balance-ai/players` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/balance-ai/recalculate` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/balance-ai/reviews` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/balance-ai/reviews/[reviewId]` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/balance/drafts` | page GET | balance | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/admin/balance/drafts/[draftId]` | page GET | balance | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/admin/balance/drafts/[draftId]/recommendations` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/balance/recommendations` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/champions` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/champions/[championId]/edit` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/champions/new` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/discipline` | page GET | discipline | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/admin/discipline/[recordId]` | page GET | discipline | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/discipline/new` | page GET | discipline | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/highlights` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/highlights/[highlightId]/edit` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/highlights/new` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/images` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/images/[imageId]/edit` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/images/new` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao` | page GET | kakao | 소스·최종 HTTP 7조건 통과 | 7/21 |
| `/admin/kakao/operation-forms` | page GET | support | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/operation-forms/[formType]` | page GET | support | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/recruits` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/recruits/logs` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/recruits/settings` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/rooms` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/scrims` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/season-apply` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/settings` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/kakao/stats` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/login` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/logs` | page GET | operations | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/admin/logs/kakao` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/matches` | page GET | matches | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/admin/matches/[matchId]` | page GET | matches | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/admin/matches/[matchId]/ai-review` | compatibility-handler GET/HEAD | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/matches/[matchId]/edit` | page GET | matches | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/matches/new` | page GET | matches | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/matches/submissions/[submissionId]` | page GET | matches | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/operation-forms` | page GET | support | 소스·최종 HTTP 5조건 통과 | 5/15 |
| `/admin/operation-forms/[formType]` | page GET | support | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/operation-forms/[formType]/[id]` | page GET | support | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/operation-forms/warnings` | page GET | support | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/players` | page GET | player | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/players/[playerId]` | page GET | player | 소스·최종 HTTP 4조건 통과 | 4/12 |
| `/admin/players/[playerId]/balance` | compatibility-handler GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/players/[playerId]/edit` | compatibility-handler GET | player | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/players/[playerId]/riot` | compatibility-handler GET | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/players/new` | page GET | player | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/private-assets` | page GET | media | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/admin/private-assets/[assetId]` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/progress` | compatibility-handler GET/HEAD | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/admin/progress/destruction` | page GET | destruction | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/progress/destruction/[tournamentId]` | page GET | destruction | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/admin/progress/destruction/new` | page GET | destruction | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/progress/event` | page GET | event | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/progress/event/[eventId]` | page GET | event | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/progress/event/new` | page GET | event | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/recruits` | page GET | recruits | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/riot` | page GET | riot | 소스·최종 HTTP 4조건 통과 | 4/12 |
| `/admin/search` | page GET | operations | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/seasons` | page GET | applications | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/admin/seasons/kakao-pending` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/seasons/kakao-pending/[pendingId]` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/security` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/site-settings` | page GET | operations | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/usage` | page GET | operations | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/users` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/admin/users/[userAccountId]` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/ai-balance` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/ai-balance/players` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/ai-requests` | api GET | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/backups/[kind]` | api GET | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/balance-ai/adjustments` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/balance-ai/players` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/balance-ai/recalculate` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/balance-ai/reviews` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/balance-ai/summary` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/balance-ai/team-overrides` | api GET/POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/champions` | api GET/POST | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/champions/[championId]` | api DELETE/GET/PATCH | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/competitions/destruction` | api GET/POST | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/competitions/destruction/[tournamentId]` | api GET/PATCH | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/competitions/events` | api GET/POST | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/competitions/events/[eventId]` | api GET/PATCH | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/dashboard` | api GET | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/discipline-records` | api GET/POST | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/discipline-records/[recordId]` | api DELETE/GET/PATCH | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/discipline-records/target-options` | api GET | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/discipline-tasks/[taskId]/review` | api PATCH | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/discipline/assets/[assetId]` | api GET | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/highlights` | api GET/POST | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/highlights/[highlightId]` | api DELETE/GET/PATCH | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/highlights/[highlightId]/assets` | api GET/POST | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/images` | api GET/POST | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/images/[imageId]` | api DELETE/GET/PATCH | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/images/[imageId]/assets` | api GET/POST | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/images/[imageId]/home-display` | api PATCH | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/kakao/recruit-health` | api GET/POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/kakao/rooms` | api GET/POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/kakao/settings` | api GET/POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/kakao/stats` | api GET | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/login` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/logout` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/logs` | api GET | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/logs/stats` | api GET | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/maintenance/admin-log-cleanup` | api POST | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/maintenance/rate-limit-cleanup` | api POST | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches` | api GET/POST | matches | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/admin/matches/[matchId]` | api GET/PATCH | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/[matchId]/publish` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/[matchId]/restore` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/[matchId]/void` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/editor-options/players` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/import` | api POST/PUT | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/integrity` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/approve` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/cancel-import` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/images/[imageId]` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/images/[imageId]/ocr` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/reject` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/reopen` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/matches/submissions/[submissionId]/review-draft` | api PUT | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/operation-forms` | api GET | support | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/operation-forms/[formType]/[id]` | api DELETE/GET/PATCH | support | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/players` | api GET/POST | player | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/players/[playerId]` | api DELETE/GET/PATCH | player | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/players/[playerId]/balance-profile` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/players/[playerId]/password-reset` | api POST | player | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/players/[playerId]/reactivate` | api POST | player | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/private-assets` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/private-assets/[assetId]` | api DELETE/GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/private-assets/[assetId]/metadata` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/recruits` | api GET | recruits | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/recruits/[recruitId]` | api PATCH | recruits | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/riot` | api GET | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/riot/bulk` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/riot/bulk-link` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/riot/link` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/riot/retry` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/riot/sync` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/season-applications` | api GET | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/season-applications/[applicationId]/review` | api POST | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/season-kakao-pending` | api GET | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/season-kakao-pending/[pendingId]` | api GET | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/season-kakao-pending/[pendingId]/cancel` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/season-kakao-pending/[pendingId]/resolve` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/seasons` | api GET/POST | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/seasons/[seasonId]` | api DELETE/PATCH | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/seasons/[seasonId]/activate` | api POST | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/seasons/[seasonId]/clone` | api POST | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/seasons/[seasonId]/end` | api POST | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/security/totp` | api GET | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/security/totp/disable` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/security/totp/enable` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/security/totp/setup` | api DELETE/POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/session` | api GET | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/site-settings` | api GET/PUT | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/stats/consistency` | api GET | statistics | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/stats/recalculate` | api POST | statistics | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]/archive` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]/recommendations` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]/reevaluate` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]/restore` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]/save` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/team-tools/drafts/[draftId]/select` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/usage/export` | api GET | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users` | api GET | auth | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/admin/users/[userAccountId]` | api DELETE/GET | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/2fa-reset` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/approve` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/delete` | api DELETE | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/details` | api GET | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/password-reset` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/reject` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/reset` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/reset-pending` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/restore` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/role` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/admin/users/[userAccountId]/suspend` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/ai/chat` | api POST | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/applications/available` | api GET | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/applications/season` | api DELETE/GET/POST | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/login` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/logout` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/me` | api GET | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/me/player` | api GET/PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/password` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/password/forgot` | api PATCH | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/reset-requests` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/auth/signup` | api POST | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/champions` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/champions/[championId]` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/destruction` | api GET | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/destruction/[tournamentId]` | api GET | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/destruction/[tournamentId]/application` | api DELETE/GET/PUT | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/destruction/[tournamentId]/mvp-vote` | api POST | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/events` | api GET | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/events/[eventId]` | api GET | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/competitions/events/[eventId]/application` | api DELETE/GET/PUT | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/cron/destruction-ratings` | api GET | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/cron/kakao-daily-close` | api GET | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/cron/mmr-projection` | api GET | statistics | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/cron/riot-sync` | api GET | riot | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/cron/statistics-projection` | api GET | statistics | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/cron/support-retention` | api GET | support | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/discipline/stats` | api GET | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/health` | api GET | operations | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/highlights` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/highlights/[highlightId]` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/images` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/images/[imageId]` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/image-receive` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/managed-forms` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/openchat` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/operation-forms` | api POST | support | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/pair-room` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/recruits` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/scheduled-notice` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/search-player` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/season-applications` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/site-notices` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/integrations/kakao/v4/commands` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/discipline-assets-cleanup` | api POST | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/discipline-assets-recover` | api POST | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/kakao-daily-close` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/maintenance` | api POST | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/riot-api-probe` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/riot-sync` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/internal/jobs/storage-probe` | api POST | operations | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/destruction-scrim-recruits/[action]` | api GET/POST | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/image-receive` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/managed-forms` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/openchat` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/operation-forms` | api POST | support | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/party-recruits/[action]` | api GET/POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/recruit/season-apply` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/recruit/season-apply/status` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/scheduled-notice` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/kakao/search-player` | api POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/matches` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/matches/[matchId]` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/discipline/assets/[assetId]` | api GET | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/discipline/tasks` | api GET | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/discipline/tasks/[taskId]` | api GET | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/discipline/tasks/[taskId]/evidence` | api POST | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/discipline/tasks/[taskId]/evidence/[assetId]/submit` | api POST | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/discipline/tasks/[taskId]/kakao-session` | api DELETE/POST | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/match-submissions` | api GET/POST | matches | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/me/match-submissions/[code]` | api GET/PATCH | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/match-submissions/[code]/cancel` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/match-submissions/[code]/images` | api POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/match-submissions/[code]/images/[imageId]` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/match-submissions/[code]/kakao-session` | api DELETE/POST | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/riot` | api DELETE/GET/POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/riot/rso/callback` | api GET/POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/riot/rso/start` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/me/riot/sync` | api POST | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/media/assets/[assetId]` | api GET | media | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/rankings` | api GET | statistics | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/rankings/mmr` | api GET | statistics | 소스·조회 HTTP 2조건 통과 | 0/0 |
| `/api/recruits` | api GET/POST | recruits | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/riot/player/[playerId]/analytics` | api GET | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/riot/player/[playerId]/matches/[matchId]` | api GET | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/riot/player/[playerId]/summary` | api GET | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/seasons` | api GET | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/seasons/current` | api GET | applications | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/site-settings` | api GET | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/stats/player/[playerId]/recent` | api GET | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/stats/player/[playerId]/summary` | api GET | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/stats/top` | api GET | home | 소스·조회 HTTP 1조건 통과 | 0/0 |
| `/api/support` | api POST | support | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/candidates` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/drafts` | api GET/POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/drafts/[draftId]` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/drafts/[draftId]/recommendations` | api GET | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/drafts/[draftId]/reevaluate` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/drafts/[draftId]/save` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/team-tools/drafts/[draftId]/select` | api POST | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/api/usage/events` | api POST | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app` | page GET | home | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/app/account` | compatibility-handler GET/HEAD | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/coin-toss` | compatibility-handler GET/HEAD | random | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/install` | compatibility-handler GET/HEAD | guides | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/login` | compatibility-handler GET/HEAD | auth | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/matches` | compatibility-handler GET/HEAD | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/matches/[matchId]` | compatibility-handler GET/HEAD | matches | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/me` | compatibility-handler GET/HEAD | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/me/riot` | compatibility-handler GET/HEAD | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/players` | page GET | player | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/app/players/[legacyId]` | compatibility-handler GET | player | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/progress/destruction/[tournamentId]` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/progress/destruction/[tournamentId]/mvp-vote` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/progress/event/[eventId]` | compatibility-handler GET/HEAD | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/random-team` | compatibility-handler GET/HEAD | random | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/rankings` | compatibility-handler GET/HEAD | statistics | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/app/recruits` | compatibility-handler GET/HEAD | recruits | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/applications` | page GET | applications | 소스·최종 HTTP 5조건 통과 | 5/15 |
| `/balance` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/coin-toss` | compatibility-handler GET/HEAD | random | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/competitions` | page GET | home | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/competitions/destruction` | page GET | destruction | 소스·최종 HTTP 4조건 통과 | 4/3 |
| `/competitions/destruction/[tournamentId]` | page GET | destruction | 소스·최종 HTTP 8조건 통과 | 8/24 |
| `/competitions/events` | page GET | event | 소스·최종 HTTP 4조건 통과 | 4/3 |
| `/competitions/events/[eventId]` | page GET | event | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/destruction-auction-live/[tournamentId]` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/discipline` | page GET | discipline | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/discipline/evidence` | compatibility-handler GET/HEAD | discipline | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/forbidden` | page GET | guides | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/forgot-password` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/help` | page GET | guides | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/help/contact` | page GET | guides | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/help/kakao` | page GET | kakao | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/help/recruits` | page GET | recruits | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/help/riot` | page GET | riot | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/highlights` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/highlights/[highlightId]` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/images` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/images/[imageId]` | page GET | media | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/install` | page GET | guides | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/kakao` | compatibility-handler GET/HEAD | kakao | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/login` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/matches` | page GET | matches | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/matches/[matchId]` | page GET | matches | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/matches/submissions` | page GET | matches | 소스·최종 HTTP 2조건 통과 | 2/3 |
| `/matches/submit` | page GET | matches | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/me/player` | compatibility-handler GET/HEAD | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/me/riot` | compatibility-handler GET/HEAD | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation` | compatibility-handler GET/HEAD | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation/destruction/[tournamentId]` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation/destruction/[tournamentId]/captain-points` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation/destruction/[tournamentId]/participants` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation/destruction/[tournamentId]/participants/[playerId]` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation/event/[eventId]` | compatibility-handler GET/HEAD | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/participation/season` | compatibility-handler GET/HEAD | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/players` | page GET | player | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/players/[playerId]` | page GET | player | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/players/[playerId]/riot` | compatibility-handler GET/HEAD | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/players/balance` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/players/balance/drafts` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/players/balance/drafts/[draftId]` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/players/balance/drafts/[draftId]/recommendations` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/players/balance/recommendations` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/privacy` | page GET | guides | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/progress` | compatibility-handler GET/HEAD | home | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/destruction` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/destruction/[tournamentId]` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/destruction/[tournamentId]/images` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/destruction/[tournamentId]/images/[imageIndex]` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/destruction/[tournamentId]/mvp-vote` | compatibility-handler GET/HEAD | destruction | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/event` | compatibility-handler GET/HEAD | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/progress/event/[eventId]` | compatibility-handler GET/HEAD | event | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/random-team` | compatibility-handler GET/HEAD | random | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/rankings` | page GET | statistics | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/rankings/mmr` | page GET | statistics | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/recruit` | compatibility-handler GET/HEAD | recruits | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/recruit-helper` | compatibility-handler GET/HEAD | recruits | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/recruits` | page GET | recruits | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/riot-api` | compatibility-handler GET/HEAD | riot | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/signup` | page GET | auth | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/start` | page GET | home | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/team-balance` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/team-balance/drafts/[draftId]` | compatibility-handler GET/HEAD | balance | 소스 확인; 계약 근거·미확인 경계 별도 | 0/0 |
| `/terms` | page GET | guides | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/tools/coin-toss` | page GET | random | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/tools/random-team` | page GET | random | 소스·최종 HTTP 2조건 통과 | 2/6 |
| `/tools/team-balance` | page GET | balance | 소스·최종 HTTP 1조건 통과 | 1/3 |
| `/tools/team-balance/drafts` | page GET | balance | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/tools/team-balance/drafts/[draftId]` | page GET | balance | 소스·최종 HTTP 3조건 통과 | 3/9 |
| `/manifest.webmanifest` | metadata GET | guides | 소스 확인; 계약 근거·미확인 경계 별도 | 범위 밖 |
| `/robots.txt` | metadata GET | guides | 소스 확인; 계약 근거·미확인 경계 별도 | 범위 밖 |
| `/sitemap.xml` | metadata GET | guides | 소스 확인; 계약 근거·미확인 경계 별도 | 범위 밖 |

## 상태별 확인 범위와 미확인 경계

| 상태 | 확인할 근거·현행 구분 | 완료 주장 금지 범위 |
|---|---|---|
| 정상 사용 | 단위/DB 계약은 도메인·저장 상태 전이, HTTP는 인증·DTO·method 경계, 브라우저는 실제 조작 과업을 각각 구분 | 페이지 GET 200을 신청·저장 완료로 해석하지 않음 |
| 처음·빈 데이터 | home/public fallback, 목록 empty, 미연결 계정, 미개설 모집 fixture 및 실제 조건 확인 | 각 목록의 모든 조합을 브라우저에서 실행했다고 주장하지 않음 |
| 로딩·지연 | JSON loadingBoundaries와 async/error UI 확인; 상태별 지연 주입은 별도 근거 | 실제 이동통신 지연·오프라인 전수 미확인 |
| 잘못된 입력·주소 | parser/contract tests, invalid ID·query·빈 필터 HTTP, 404/오류 복귀 확인 | 오류마다 실기기 조작 확인은 별개 |
| 조회·저장 실패 | domain fault·외부 adapter·DB failure 계약; 재시도·입력 보존은 직접 조작 근거 | 실제 외부 서비스 장애 전수 미확인 |
| 권한·세션 만료 | 계정 상태·role·purpose·authVersion·타인 소유권·same-origin HTTP/DB 검사 | 실제 사용자/운영 계정을 바꿔 시험하지 않음 |
| 중복·재시도·동시 수정 | idempotency key, revision, transaction, nonce와 Kakao 양식 병합 계약 | 실 운영 동시 부하 시험은 미실행 |
| 취소·초기화·뒤로·새로고침 | route return·query·URL 기반 상태 계약 및 직접 조작 근거 | 모든 화면 모든 브라우저 조합 미확인 |
| 긴 내용·많은 데이터 | 입력 상한·pagination·합성 긴 이름·overflow 측정 | 최대 운영 규모 부하·장기 누적 수치 미측정 |
| 모바일·태블릿·PC | 320/390/820/1440 등 실제 실행된 CSS viewport만 기록 | iPhone/Safari·Android 실기기와 같다고 표시하지 않음 |
| 키보드·접근성 | 이름·focus·semantics·motion-reduction·axe/직접 조작 근거 | 스크린리더·고대비·전체 WCAG 인증 미실행 |
| 외부 연동 장애 | fake adapter 및 bounded retry/degraded 상태; 실제 provider는 별도 | Riot RSO 승인, Kakao 실기기 수신, 제공자 경보 수신은 외부 확인 필요 |

## 추가 범위와 기능 추가 판단

사이트의 주된 목적은 참가·모집 → 팀 편성 → 결과 제출 → 전적·기록의 연속 흐름이며, 공개 메뉴·계정·관리자·job으로 필요한 기능은 이미 구현되어 있다. 이 목록만으로 사용성 공백이 없다고 단정하지 않는다. 기존 연결과 상태 안내를 먼저 개선하고, 일반 회원의 새로운 게시판·채팅·모집 시스템처럼 유지 비용이 큰 신규 기능은 현재 확인된 과업 방해 원인이나 사용자 요구가 없으므로 추가하지 않는다. 커뮤니티 소식은 관리자가 하이라이트·갤러리를 발행하고 일반 회원은 문의 경로로 자료를 전달하는 현행 정책을 평가 대상으로 삼는다.

이 JSON에는 현재 렌더되는 모든 인스턴스가 아니라 소스의 조작 위치를 기록했다. label이 식인 항목은 실행 시 이름 검증이 필요하며 소스 이름이 비었다고 곧바로 접근성 오류로 판정하지 않는다. 구현 검사와 실제 확인은 독립적인 결과다.

## 운영 확인 후속 기록 — 2026-10-06

검증한 source `73b2ee70`의 운영 배포와 공개 HTTP 31개·기본 14개/이미지 해시 검사가 통과했다. 공개 브라우저 6개 화면 × 4개 너비(24조건), MMR 이동/필터/초기화·랭킹 조건 복귀·홈 슬라이드 클릭/키보드·접수 코드 로그인 링크를 확인했다. 위 문서 작성 시점의 배포 예정 상태는 [최종 운영 근거](production.md)로 갱신한다. 로컬 확인창 이후 저장 E2E와 실기기·외부 연동은 여전히 별도이며, 기존 V1 MMR의 공식 전환 승인과 최신 집계는 완료로 표시하지 않는다.
