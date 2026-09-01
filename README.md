# K-LOL.GG V2

V1 코드를 복사하지 않고 기능 계약부터 다시 구현하는 독립 Greenfield 프로젝트입니다.

## 현재 범위

- S00 기반·디자인 시스템·공통 상태 UI·CI
- S02 플레이어 등록부를 미리 검증하는 합성 fixture 계약 시제품
- 운영 DB·Blob·외부 연동 없음
- 구현 경로: `/`, `/players`

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm test
npm run check
```

`npm run check`는 lint, 타입 검사, Node 회귀 테스트, Next.js 프로덕션 빌드를 순서대로 실행합니다. 같은 명령을 GitHub Actions CI에서도 실행합니다.

진행 상태와 V1 기준점은 `docs/STATUS.md`와 `docs/cutover/V1_BLUEBLACK_BASELINE.md`를 확인합니다. 역할 분배와 통합 기준은 `docs/TEAM_WORKFLOW.md`에 고정합니다.
