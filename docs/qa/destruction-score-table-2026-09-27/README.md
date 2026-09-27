# 멸망전 점수표 · 로컬 검증

2026-09-27. 운영 소스 작업 폴더 `destruction-production-20260925`에 반영. 운영 배포·Git push·release tag 생성은 수행하지 않았다.

## 변경

- 공개 멸망전 상세에 `?tab=score-table` 점수표 메뉴 추가. 로그인 없이 열람 가능.
- 칼바람·증바람: S/A/B/C/D 보정 승률, 최소 입찰가, 주장 시작 포인트, 선수별 전적·등급·출처·표본 상태 표시. 평가 대기 상태도 안내.
- 협곡: 38개 티어·LP 구간 × 5포지션의 기존 지급 점수표 복원. 팀별 확정 시작·사용·잔여 포인트 및 선수별 실제 낙찰가, 참가자·팀 미확정 상태 표시.
- 협곡 기준값 데이터의 출처는 V1 `src/lib/destruction/captain-points.ts`의 `POINT_TABLE`. UI/계산 구현은 복사하지 않고 V2 도메인 함수와 기존 공개 DTO를 사용했다. 38개 행의 기준값 190개 및 최종 포인트 190개를 V1 공개 표와 전체 대조해 모두 일치함을 확인했다.
- 기존 평가 산식·점수·공개 DTO·권한·저장 규칙 유지. 최소 입찰가 상수는 계산과 표에서 함께 사용.
- 기존 표 스타일 재사용, 좁은 화면에서는 표 영역만 가로 스크롤. 스크롤 영역에 키보드 포커스와 접근 가능한 이름 제공.

## 검증

- `npm run typecheck`: PASS.
- 변경 TypeScript/TSX 파일과 QA 실행 스크립트 ESLint: 오류·경고 0.
- `node --import tsx --test tests/competition-navigation.test.ts tests/destruction-aram.test.ts`: 9 PASS.
- 협곡 확장 후 `node --import tsx --test tests/destruction-domain.test.ts tests/destruction-aram.test.ts tests/competition-navigation.test.ts`: 17 PASS.
- `node --test tests/destruction-ui-contract.test.mjs`: 3 PASS.
- `npm run build`: PASS.
- `node --import tsx scripts/test-db/run-destruction-browser-qa.ts --score-tables-only`: PASS. 격리 PostgreSQL 계약 1 PASS, 운영용 Next 빌드에서 비로그인 화면 12개 HTTP 200·가로 넘침 없음·오류 화면 없음.
- 협곡 완료·주장 선정·모집 중, 칼바람·증바람 경매·평가 대기 상태 × 390/1440px: [캡처 결과](screenshots/index.json).
- 협곡 확장 후 PC·모바일 완료 캡처를 직접 확인. 38개 티어 행, 팀별 확정 포인트, 선수별 낙찰가 정상. 좁은 화면의 티어 열을 고정해 좌우 스크롤 시 기준 행을 확인할 수 있다. axe 자동 접근성 검사는 이번 점수표 범위에서 실행하지 않았다.
- `git diff --check`: PASS.

브라우저 데이터는 일회성 합성 fixture다. 운영 데이터와 실제 Riot API 조회는 사용하지 않았으며 실행 후 테스트 서버와 DB를 종료했다.
