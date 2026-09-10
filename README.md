# K-LOL.GG V2

V1 코드를 복사하지 않고 사용자 기능 계약부터 다시 구현한 독립 V2 프로젝트입니다.

## 현재 범위

- 공개·계정·관리자 영역의 App Router 화면 103개와 API route 197개
- 가입·로그인·TOTP, 플레이어·시즌·경기·통계·MMR·팀 도구·대회·징계·미디어·운영 기능
- PostgreSQL 18과 Drizzle 기준 101개 테이블, 전진 migration 35개(head `0034_kakao_room_capability_profiles`)
- Riot·Kakao·Blob 경계를 운영 자격증명과 분리해 검증할 수 있는 adapter·보안 계약
- V1 호환 경로와 Kakao V4 명령/양식 흐름, PWA와 반응형 사용자·관리자 셸

2026-09-11 운영 검증 기준 커밋 `8dcbee42`의 Vercel Production 배포 및 health/DB 연결을 확인했습니다. 다만 Kakao R5 휴대폰 산출물은 아직 실제 MessengerBot R에 설치하지 않았고, 외부 연동별 실기기·실데이터 검증 범위도 서로 다릅니다. 정확한 소스·서버·DB·휴대폰 상태는 `docs/STATUS.md`에서 구분합니다.

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
