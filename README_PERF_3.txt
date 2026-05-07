K-LOL.GG 속도 개선 3안 적용본

포함 내용
1. src/ 전체
2. prisma/ 전체
3. eslint.config.mjs
4. PERF_3_APPLY_AND_CHECK.ps1

적용 순서
1. 기존 프로젝트에서 src 폴더 삭제
2. 기존 프로젝트에서 prisma 폴더 삭제
3. 이 ZIP의 src, prisma를 프로젝트 루트에 복사
4. eslint.config.mjs도 프로젝트 루트에 덮어쓰기
5. 아래 명령 실행

Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run build

중요
- 이번 수정은 PlayerSeasonStat에 participationCount 컬럼과 통계용 인덱스를 추가합니다.
- 따라서 배포/로컬 모두 npx prisma migrate deploy 실행이 필요합니다.
- 기존 데이터가 있으면 관리자 페이지의 통계 재계산 또는 /api/admin/stats/recalculate 호출로 통계 테이블을 한 번 채워야 합니다.
- 첫 랭킹/API 접근 시 통계가 비어 있고 경기 데이터가 있으면 자동 재계산을 시도합니다.

주요 개선
- 홈 Top3, 랭킹, 플레이어 목록을 MatchParticipant 전체 계산 방식에서 PlayerSeasonStat 기반으로 변경
- 공개 목록 페이지 revalidate 60초 적용
- /api/rankings, /api/stats/top에 Cache-Control 및 Server-Timing 헤더 추가
- 500ms 이상 걸리는 API는 [PERF_SLOW] 로그 출력
- 내전 등록/수정/삭제 시 시즌 통계 자동 재계산
- ESLint 9/Next flat config 방식으로 eslint.config.mjs 복구 및 tools/** 제외
