# K-LOL.GG V2

V1 코드를 복사하지 않고 사용자 기능 계약부터 다시 구현한 독립 V2 프로젝트입니다.

현재 운영은 **내전 자동 회원 연결·최신 양식 1.0.0**, source `4ed4f5f1`, Vercel `dpl_ArFdxfuNKAcJMJap6mmBF5kB1G89`입니다. 일치하는 활성 회원을 자동 연결하고 저장 후 최신 편집 양식을 바로 반환합니다. [검증·배포 근거](docs/qa-evidence/inhouse-auto-link-v1.0.0-2026-09-22/README.md)를 확인하세요.

## 현재 범위

- 공개·계정·관리자 영역의 App Router 화면과 API
- 가입·로그인·TOTP, 플레이어·시즌·경기·통계·MMR·팀 도구·대회·징계·미디어·운영 기능
- PostgreSQL 18과 Drizzle 스키마, 전진 migration의 현재 head는 [migration journal](drizzle/meta/_journal.json) 참조
- Riot·Kakao·Blob 경계를 운영 자격증명과 분리해 검증할 수 있는 adapter·보안 계약
- V1 호환 경로와 Kakao V4 명령/양식 흐름, PWA와 반응형 사용자·관리자 셸

이전 통합 활성화 기준은 **사이트 알림·Riot API·운영 진단 1.0.0**, source `c3442ace`, Vercel `dpl_BdpAWrcHPKAchNU9K644dHfajNxu`, DB `0044`입니다. API 직접 연결·주기 갱신, 관리자 연동 진단과 사이트 충원 서버 알림을 활성화했습니다. 계약·단위·격리 DB·339개 화면·운영 경계와 실제 Riot 상태 API 결과는 [릴리스 QA](docs/qa-evidence/integrations-activation-v1.0.0-2026-09-22/README.md)에 기록했습니다. 이전 파티·통계·마감·Blob 검증은 [운영 준비 QA](docs/qa-evidence/operational-readiness-v1.0.0-2026-09-22/README.md)를 따릅니다.

사이트 충원 별도 봇은 실제 내전 구인 오픈채팅에서 그룹 표시 값이 꺼져 응답이 차단된 것을 확인했습니다. [1.0.3 호환 수정 후보](docs/qa-evidence/site-notice-companion-v1.0.3-2026-09-22/README.md)의 실기기 버전·진단 응답과 초기화 READY를 확인했으며 실제 등록·충원 수신은 미확인입니다. 사용자가 명시 연결한 Riot 계정의 실제 전적 확인과 별도 RSO 승인도 남아 있습니다. 운영 API 키만으로 Riot 로그인 소유권 인증 상태를 만들지 않습니다. 소스·서버·DB·외부 기기 상태는 [STATUS](docs/STATUS.md)를 확인합니다.

카카오 편집·보호 정책은 승인된 [파티 ADR0011](docs/architecture/0011-kakao-party-editable-copy-flow.md)과 [내전 ADR0012](docs/architecture/0012-kakao-inhouse-editable-copy-flow.md)를 따릅니다. 사용자 확인 앱 버전은 MessengerBot R **0.7.29a**, 일반 봇은 **R25**입니다. 사이트 충원 알림용 [별도 companion](integrations/messengerbot-r/site-notices/README.md)은 일반 봇과 분리해 설치하고 그룹 세션을 명시 등록합니다. 서버 ON과 실제 수신 완료는 구분합니다.

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
