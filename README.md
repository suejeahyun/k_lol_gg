# K-LOL.GG V2

V1 코드를 복사하지 않고 기능 계약부터 다시 구현하는 독립 Greenfield 프로젝트입니다.

## 현재 범위

- S00 기반·디자인 시스템·공통 상태 UI·CI
- V1 사용자 73개·관리자 81개 화면과 비관리자 API 112개의 전환 목록
- PostgreSQL 18 기준 전진 migration, 인증·플레이어·감사 repository 계약
- 비운영 합성 계정으로만 검증하는 비밀번호 → TOTP → 관리자 세션 흐름
- 보호된 관리자 10개 작업 공간의 A0 셸과 사용자 플레이어 검색 시제품

운영 인증, 운영 데이터, Blob, Riot·Kakao 같은 외부 연동은 아직 연결하지 않았습니다. 현재 구현은 기능 동등성이 완료된 V2가 아니라 독립 기반과 검수 하네스입니다.

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

`npm run check`는 lint, 타입 검사, 일반 계약·단위 테스트, Next.js 프로덕션 빌드를 순서대로 실행합니다. `test:db`는 강한 안전 가드를 통과한 일회성 PostgreSQL에서만 실행되며, `verify:auth-http`는 실제 HTTP 경계의 관리자 인증 계약을 검증합니다.

진행 상태와 V1 기준점은 `docs/STATUS.md`와 `docs/cutover/V1_BLUEBLACK_BASELINE.md`를 확인합니다. 역할 분배와 통합 기준은 `docs/TEAM_WORKFLOW.md`에 고정합니다.
