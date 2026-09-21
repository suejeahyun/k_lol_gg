# K-LOL.GG V2

V1 코드를 복사하지 않고 사용자 기능 계약부터 다시 구현한 독립 V2 프로젝트입니다.

## 현재 범위

- 공개·계정·관리자 영역의 App Router 화면과 API
- 가입·로그인·TOTP, 플레이어·시즌·경기·통계·MMR·팀 도구·대회·징계·미디어·운영 기능
- PostgreSQL 18과 Drizzle 스키마, 전진 migration의 현재 head는 [migration journal](drizzle/meta/_journal.json) 참조
- Riot·Kakao·Blob 경계를 운영 자격증명과 분리해 검증할 수 있는 adapter·보안 계약
- V1 호환 경로와 Kakao V4 명령/양식 흐름, PWA와 반응형 사용자·관리자 셸

현재 운영은 **운영 준비 보완 1.0.0**, source `c5cbbcd8`, Vercel `dpl_7FHerKERF1CKe4kFvN5DQkvUHX8k`, DB `0044`입니다. 파티 목록·직접 상세·초안 취소, 통계 자동 갱신, 명단 보존 마감, 회원 연결 검토와 팀 보정·운영 진단을 반영했습니다. 전체 코드·DB·339개 화면·운영 읽기·실제 Blob 검사는 [릴리스 QA](docs/qa-evidence/operational-readiness-v1.0.0-2026-09-22/README.md)에 기록했습니다.

사이트 충원 카카오 알림과 Riot 최근 경기 공급은 서버 코드까지 반영했으며, 휴대폰 설치와 Riot 자격·실계정 확인이 남아 비활성 상태입니다. 소스·서버·DB·외부 기기 상태는 [STATUS](docs/STATUS.md)를 확인합니다.

카카오 편집·보호 정책은 승인된 [파티 ADR0011](docs/architecture/0011-kakao-party-editable-copy-flow.md)과 [내전 ADR0012](docs/architecture/0012-kakao-inhouse-editable-copy-flow.md)를 따릅니다. 기존 R24 서버 호환과 실제 기기 설치는 구분하며, 사용자 확인 앱 버전은 MessengerBot R **0.7.29a**입니다. 사이트 충원 알림용 [별도 companion](integrations/messengerbot-r/site-notices/README.md)은 기본 OFF이며 대상 세션 등록·실기기 확인 후 활성화합니다.

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
