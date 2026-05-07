관리자 팀 구성 드래그 교환 적용본

적용 내용:
1. 이벤트 내전 관리 상세 페이지의 드래그 팀 구성에서 팀원 카드끼리 드롭하면 서로 교환됩니다.
2. 멸망전 관리 상세 페이지의 드래그 팀 구성에서도 팀원 카드끼리 드롭하면 서로 교환됩니다.
3. 빈 팀 영역에 드롭하면 기존처럼 이동합니다.
4. 이벤트 내전은 저장 전 각 팀 5명 조건을 프론트에서 먼저 검증합니다.
5. 멸망전 팀장은 팀장 고정 상태로 유지되며 드래그/교환 대상에서 제외됩니다.
6. /api/rankings dynamic server usage 로그를 줄이기 위해 force-dynamic 처리했습니다.

적용 방법:
1. dev 서버 종료: Ctrl + C
2. 프로젝트 루트에서 기존 src/prisma 삭제
   Remove-Item -LiteralPath "src" -Recurse -Force
   Remove-Item -LiteralPath "prisma" -Recurse -Force
   Remove-Item -LiteralPath ".next" -Recurse -Force -ErrorAction SilentlyContinue
3. ZIP 안의 src, prisma, eslint.config.mjs를 프로젝트 루트에 붙여넣기
4. 실행
   npx prisma generate
   npm run lint
   npm run build
   npm run dev

사용법:
- 빈 영역에 놓기: 해당 참가자를 그 팀으로 이동
- 다른 참가자 카드 위에 놓기: 두 참가자가 서로 팀/위치를 교환
- 저장 버튼 클릭 전까지 DB에는 반영되지 않음
