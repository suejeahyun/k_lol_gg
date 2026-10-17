# K-LOL.GG V2

**2026-10-18 추가 조정 실험 기각·기존 운영 유지**: 이전과 겹치지 않는 실제 선수 1,000조합·936,747,904배치를 확인했습니다. 초과 격차 우선 후보는 500개 비교에서 동일 454개·상충 46개, 개별 악화 상한 위반 45개로 기각했습니다. 신규 계산식 배포 없이 2.0.2 운영 source와 HTTP 12조건을 재확인했습니다. [추가 보고](docs/qa-evidence/balance-severity-2026-10-18/README.md), [운영 상태](docs/qa-evidence/balance-severity-2026-10-18/production.md). 점수 0.1 변화에 대한 경계 민감도는 남아 있습니다.

**2026-10-18 실제 자료 비교·표본 진단 2.0.2 운영 반영**: 1,000개 고유 조합·921,331,808개 배치를 조사했습니다. 새 선택 후보는 효과 없음 또는 5.6% 악화로 기각하여 기존 추천 계산식을 유지하고, 표본 0건 누락 진단만 정정했습니다. source `131abbf7`, 후보·운영 HTTP 각 12조건 및 source CI 확인. [전체 보고](docs/qa-evidence/balance-research-2026-10-18/README.md), [배포·복구](docs/qa-evidence/balance-research-2026-10-18/production.md). 실제 승률 개선을 주장하지 않습니다.

**2026-10-18 내전 점수 표시 2.0.1 운영 반영**: 신규 참가자를 일괄 기본 50점으로 보이게 하던 카드를 실제 배정 점수로 수정하고 티어·표본을 분리했습니다. 임의 문자열을 정상 티어로 계산하는 입력 검증도 보완했습니다. source `48e82aef`, 운영 READY·HTTP 8조건·실제 소유 초안 10개 점수 카드 확인. 누락 티어를 보완한 로컬 조합 비교와 운영 자료 저장 상태는 구분합니다. [변경 안내](docs/patch-notes/inhouse-fairness-v2.0.1.md), [검증·배포·남은 작업](docs/qa-evidence/inhouse-newcomer-score-2026-10-18/production.md).

**2026-10-16 내전 자동 조정 2.0.0 운영 반영**: 포지션·바텀 조건 충돌로 팀 생성이 멈추지 않도록 필요한 조건을 최소 조정해 추천하고 저장까지 연결했습니다. 기존 가능한 조합·개인 점수·등록 포지션은 보존합니다. source `1bf379ed`, 운영 READY·HTTP 12조건·source CI 확인. [변경 안내](docs/patch-notes/inhouse-fairness-v2.0.0.md), [검증·배포·복구](docs/qa-evidence/inhouse-auto-balance-2026-10-16/production.md). 시간별 예약이 아니라 팀 계산 시 적용됩니다.

**2026-10-16 사이트·카카오 안정성 1.0.1 운영 반영**: 경기 입력 보존, 내전 예비삭제, 자모 닉네임과 팀 조회·충돌 복구 6건을 수정했습니다. source `daab5eb4`, 운영 READY·health·HTTP12·서명조회2 확인. [배포·검증·복구](docs/qa-evidence/repeat-audit-2026-10-16/production.md). 휴대폰 R29 파일은 변경하지 않았습니다.

**2026-10-15 내전 공정성 1.1.0 운영 반영**: 조합 규칙 1→6 우선순위, 교환 전후 전력 미리보기, 미검증 예상 승률 표시 제거. 개인 점수·저장 이력·바텀 3등급 필수 제한 유지. [규칙 설명](docs/inhouse-balance-rules.md), [검증·배포](docs/qa-evidence/inhouse-fairness-v1.1.0-2026-10-15/production.md).


**2026-10-15 내전 공정성 규칙 1.0.0 운영 반영**: 허용 포지션 고정, 바텀 큰 등급 3단계 제한, 팀·포지션 동시 탐색과 수동 선택·저장 검사를 적용했습니다. source `3e8a84f5`, main READY·동일 SHA·운영 주소·health와 HTTP 8조건을 확인했습니다. [내전 규칙](docs/inhouse-balance-rules.md), [변경 안내](docs/patch-notes/inhouse-fairness-v1.0.0.md), [배포·검증·복구](docs/qa-evidence/inhouse-fairness-2026-10-15/production.md).

**2026-10-14 사이트·카카오 봇 안정성 1.0.0 운영 반영**: 재점검 9건을 수정했습니다. 고정 코드 복사, 신청 대상·재전송 보호, 예비 등록, 초안 복구와 설정 저장을 보완했습니다. source `cf32d4f9`, main READY·운영 health·HTTP/서명 조회 확인 완료. **휴대폰 R29 파일 교체는 대기 중입니다.** [변경 안내](docs/patch-notes/site-kakao-reliability-v1.0.0.md), [배포·검증·복구](docs/qa-evidence/site-kakao-reliability-2026-10-14/production.md). 아래는 이전 릴리스의 시점별 기록입니다.

**2026-10-10 내전 점수 관리 1.1.0 운영 반영**: 티어·LP 계산, 점수 미리보기·입력 확인·변경 이력·관리 목록·티어별 실제 평균/중앙값을 개선했습니다. source `8ce5e7aa`, main READY·동일 SHA·운영 도메인·health와 HTTP33조건 확인. [검증](docs/qa-evidence/team-score-insights-2026-10-10/README.md), [배포·복구](docs/qa-evidence/team-score-insights-2026-10-10/production.md), [남은 외부 조건](docs/qa-evidence/team-score-insights-2026-10-10/external-conditions.md). 아래는 이전 릴리스의 시점별 기록입니다.

**2026-10-09 내전 팀 편성 점수 관리자 편집 1.0.0 운영 반영**: 일반 관리자 점수 저장 권한과 검색·점수 비교·초기화·재시도 화면을 개선했습니다. source `69d83366`, 운영 READY·health·31개 HTTP 점검 확인. [배포·검증·복구](docs/qa-evidence/team-balance-admin-2026-10-08/production.md).

**2026-10-07 관리자 표시·MMR 요청 복구 1.0.8 운영 반영**: 이벤트 단계·참가자 표시를 한국어로 정리하고 MMR 응답 확인·동일 요청 재시도·중복 전송/갱신 중 잠금을 보완했습니다. [전체 기능 원장](docs/qa-evidence/service-completion-v1.0.8-2026-10-07/README.md), [배포·검증·미확인 조건](docs/qa-evidence/service-completion-v1.0.8-2026-10-07/production.md), [변경 안내](docs/patch-notes/2026-10-07-service-completion-1.0.8.md). 실제 최고관리자 인증·확인창 뒤 조작·외부 계정/기기가 남아 전체 완료는 보류입니다.

**2026-10-07 홈 이름·Riot 진단 1.0.7 운영 반영**: 좁은 화면의 긴 선수명, Riot 부분 동기화의 원인 기록, 응답 시간 초과 분류와 실제 연결 방식 표시를 보완했습니다. [현재 전체 원장](docs/qa-evidence/service-completion-v1.0.7-2026-10-07/README.md), [배포·검증·미확인 조건](docs/qa-evidence/service-completion-v1.0.7-2026-10-07/production.md), [변경 안내](docs/patch-notes/2026-10-07-service-completion-1.0.7.md). 전체 완료 판정은 실제 최고관리자 인증·브라우저 조작 제약·외부 기기/계정 확인과 분리합니다.

**2026-10-07 서비스 이용·관리 흐름 1.0.6 운영 반영**: 미디어 페이지 이동·전체 필터, 경기 검토 저장/재시도·현재 팀 명단 불러오기, 준비 중 이벤트 설정과 해소 과제 업로드 복구를 개선했습니다. [전체 기능군·문제 원장](docs/qa-evidence/service-completion-followup-2026-10-07/README.md), [배포·검증·남은 조건](docs/qa-evidence/service-completion-followup-2026-10-07/production.md), [변경 안내](docs/patch-notes/2026-10-07-service-completion-1.0.6.md). 아래는 이전 릴리스 기록입니다.

**2026-10-06 핵심 과업·저장 복구 1.0.5 운영 반영**: 수동 팀의 실제 저장/복사 일치, 문의 관리 저장, 관리자 생성의 재시도·중복 방지, 이벤트 동시 저장, 갤러리 완료 표시와 긴 이름 랭킹을 개선했습니다. [현재 운영·검증·미완료 조건](docs/qa-evidence/service-completion-v1.0.5-2026-10-06/production.md), [18기능군 점검 원장](docs/qa-evidence/service-completion-v1.0.5-2026-10-06/coverage-gaps.md), [변경 안내](docs/patch-notes/2026-10-06-service-completion-1.0.5.md). 아래는 이전 릴리스의 시점별 기록입니다.

**2026-10-03 전체 화면·조회 복구 개선 1.0.0 운영 반영**: 대회/제출 검색 오류, 팀 결과 이동, 오류 재시도와 좁은 화면을 보완했습니다. 전체 check·DB·HTTP·486개 화면 조건 검증 완료. [운영 검증](docs/qa-evidence/quality-completion-v1.0.0-2026-10-03/production.md), [업데이트 안내](docs/patch-notes/2026-10-03-quality-completion.md).

**2026-10-03 이용 동선 개선 1.0.0 운영 반영**: 홈 참가 버튼, 모바일 로그인·경기 필터, 모집 정원 안내, 메뉴·랭킹 조작과 생성 이미지를 다듬었습니다. [운영 검증](docs/qa-evidence/ux-refinement-v1.0.0-2026-10-03/production.md), [변경 안내](docs/patch-notes/2026-10-03-ux-refinement.md).

**2026-10-03 이미지 테마 1.0.0 운영 반영**: 전체 페이지의 메뉴·상태 아이콘을 생성 이미지로 교체하고, 판타지 배경과 패널 질감을 적용했습니다. [운영 검증](docs/qa-evidence/image-theme-v1.0.0-2026-10-03/production.md), [업데이트 안내](docs/patch-notes/2026-10-03-image-theme.md), [이미지·프롬프트](docs/design/image-theme-v1.json).


**2026-10-03 홈 랭킹 쇼케이스 1.0.1 운영 반영**: 요청 순서의 홈, 시상대 랭킹 슬라이드, 모바일 조작과 화면 전환 보완. [운영 검증](docs/qa-evidence/home-ranking-showcase-v1.0.1-2026-10-03/production.md), [홈 개편 안내](docs/patch-notes/2026-10-03-home-ranking-showcase.md).

**2026-10-02 목적 중심 탐색 개선 1.0.0**: 홈·메뉴·검색·신청·문의·검색 노출을 개선했습니다. [전체 분석과 검증](docs/qa-evidence/ux-discoverability-v1.0.0-2026-10-02/README.md), [배포 상태](docs/qa-evidence/ux-discoverability-v1.0.0-2026-10-02/production.md), [사용자 안내](docs/patch-notes/2026-10-02-ux-discoverability.md). 아래 이전 릴리스 기록과 현재 배포 상태를 구분합니다.

**멸망전 판수 평가 1.6.0 운영 반영**: 판수 30·솔랭 50·협곡 내전 10·챔피언 5·도전과제 5. 총 판수 300판에서 100점, 승률 미반영. [운영 검증](docs/qa-evidence/destruction-modes-v1.6.0-2026-09-28/production.md).

**멸망전 1.2.0 운영 반영**: 세 모드 참가 신청 시 일반 선수/주장 지원 선택, 모집 심사·주장 선정 목록 표시. 기존 심사 큐·경매 연출 유지. [검증·배포 근거](docs/qa-evidence/destruction-modes-v1.2.0-2026-09-25/README.md).

V1 코드를 복사하지 않고 사용자 기능 계약부터 다시 구현한 독립 V2 프로젝트입니다.

최근 서버 패치는 **Riot 플레이어 상세 1.1.0**, source `49c8c232`입니다. PC에서 요약과 최근 경기를 좌우로 배치하고 보조 분석·필터는 펼쳐 볼 수 있습니다. 함께한 소환사는 실제 Riot ID를 기본 표시하며 모바일·이름 정렬·SSR 검증을 통과했습니다. DB 0045 유지. 활성142명 중 연결106명 전체 동기화가 접수됐고, 2026-09-24T23:44:29.942Z 기준 27명 작업 성공·나머지 순차 처리 중입니다. 등록 ID 확인 필요36명은 별도입니다. [화면·배포 검증](docs/qa-evidence/riot-player-detail-v1.1.0-2026-09-25/README.md), [전체 동기화 진행](docs/qa-evidence/riot-all-sync-2026-09-25/README.md), [참고 기능과의 차이](docs/parity/RIOT_PLAYER_DETAIL_PARITY.md). 기존 MMR 공식 전환은 최고 관리자 확인 대기이며 아직 점수를 재계산하지 않았습니다.

## 현재 범위

- 공개·계정·관리자 영역의 App Router 화면과 API
- 가입·로그인·TOTP, 플레이어·시즌·경기·통계·MMR·팀 도구·대회·징계·미디어·운영 기능
- PostgreSQL 18과 Drizzle 스키마, 전진 migration의 현재 head는 [migration journal](drizzle/meta/_journal.json) 참조
- Riot·Kakao·Blob 경계를 운영 자격증명과 분리해 검증할 수 있는 adapter·보안 계약
- V1 호환 경로와 Kakao V4 명령/양식 흐름, PWA와 반응형 사용자·관리자 셸

이전 통합 활성화 기준은 **사이트 알림·Riot API·운영 진단 1.0.0**, source `c3442ace`, Vercel `dpl_BdpAWrcHPKAchNU9K644dHfajNxu`, DB `0044`입니다. API 직접 연결·주기 갱신, 관리자 연동 진단과 사이트 충원 서버 알림을 활성화했습니다. 계약·단위·격리 DB·339개 화면·운영 경계와 실제 Riot 상태 API 결과는 [릴리스 QA](docs/qa-evidence/integrations-activation-v1.0.0-2026-09-22/README.md)에 기록했습니다. 이전 파티·통계·마감·Blob 검증은 [운영 준비 QA](docs/qa-evidence/operational-readiness-v1.0.0-2026-09-22/README.md)를 따릅니다.

사이트 충원 별도 봇은 실제 내전 구인 오픈채팅에서 그룹 표시 값이 꺼져 응답이 차단된 것을 확인했습니다. [1.0.3 호환 수정 후보](docs/qa-evidence/site-notice-companion-v1.0.3-2026-09-22/README.md)의 실기기 버전·진단 응답과 초기화 READY를 확인했으며 실제 등록·충원 수신은 미확인입니다. Riot 상세 이력은 연결된 계정에서 순차 수집 중이며 전체 요청 상태는 최신 QA를 따릅니다. 별도 RSO 승인은 남아 있습니다. 운영 API 키만으로 Riot 로그인 소유권 인증 상태를 만들지 않습니다. 소스·서버·DB·외부 기기 상태는 [STATUS](docs/STATUS.md)를 확인합니다.

카카오 편집·보호 정책은 승인된 [파티 ADR0011](docs/architecture/0011-kakao-party-editable-copy-flow.md)과 [내전 ADR0012](docs/architecture/0012-kakao-inhouse-editable-copy-flow.md)를 따릅니다. 사용자 확인 앱 버전은 MessengerBot R **0.7.29a**, 일반 봇은 **R27** 설치가 확인됐습니다. 사이트 충원 알림용 [별도 companion](integrations/messengerbot-r/site-notices/README.md)은 일반 봇과 분리해 설치하고 그룹 세션을 명시 등록합니다. 서버 ON과 실제 수신 완료는 구분합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm test
npm run check
npm run test:db
npm run verify:auth-http
```

`npm run check`는 lint, 타입 검사, ERD 드리프트 검사, 일반 계약·단위 테스트, 여성 챔피언 이미지 검사, Next.js 프로덕션 빌드를 순서대로 실행합니다. `test:db`는 강한 안전 가드를 통과한 일회성 PostgreSQL에서만 실행되며, `verify:auth-http`는 실제 HTTP 경계의 관리자 인증 계약을 검증합니다.

문서와 코드의 우선순위는 `AGENTS.md`와 `PROJECT_RULES.md`, 현재 상태는 `docs/STATUS.md`, V1 기준점은 `docs/cutover/V1_BLUEBLACK_BASELINE.md`를 확인합니다. 역할 분배와 통합 기준은 `docs/TEAM_WORKFLOW.md`에 고정합니다.

구조 문서는 `docs/database/README.md`와 `docs/database/ERD.md`, 프런트엔드 재사용 기준은 `docs/frontend/COMPONENT_REUSE.md`, 기능별 버전·태그·QA·배포 연결은 `docs/releases/README.md`와 `docs/releases/registry.json`을 기준으로 합니다.
