# K-LOL.GG V2

**멸망전 1.1.0 운영 반영**: 칼바람·증바람은 포지션 없이 총인원으로 모집하고 팀당 5명을 경매로 편성합니다. 협곡의 포지션별 규칙은 유지합니다. 7단계 클릭 조회와 카드·포인트·효과음을 확인했습니다. [운영 검증과 변경 내용](docs/qa-evidence/destruction-modes-v1.1.0-2026-09-25/README.md).

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
