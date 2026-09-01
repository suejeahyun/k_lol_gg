# V2 사용자 영역 1차 파동 QA

## 판정

- 상태: **로컬 구현·검증 통과 / V1 사용자 기능 동등성 미완료 / 운영 미반영**
- 검증 기준 worktree: `feature/v2-user-foundation-wave1`
- 운영 API·외부 DB·비밀정보·배포·push는 사용하지 않았다.

## 범위

- 공개 홈 `/`
- 플레이어 목록 `/players`
- 플레이어 상세 `/players/[playerId]`
- 확정된 legacy 308 `/app`, `/app/players`
- 공개 셸, modal search/menu, 데스크톱 상단 탐색, 모바일 하단 5개 진입점
- `USER_ROUTE_MAP.md` canonical 사용자 경로 37개의 실행 가능한 manifest

`page-contract`는 ready/empty/error/loading 페이지 상태를 구현했다는 뜻이며 V1 기능 동등성이나
운영 준비 완료를 뜻하지 않는다.

## 자동 검증

- `npm run check`: 통과
  - ESLint 통과
  - TypeScript `tsc --noEmit` 통과
  - 계약 테스트 6/6, 단위 테스트 29/29 통과
  - Next.js 16.3.4 production build 통과
- `npm run test:db`: 격리 PostgreSQL 18 계약 8/8 통과
  - 공개 회원명 검색 결과 0건 회귀 포함
  - active-only, pagination, 공개 projection 계약 포함
- production server HTTP smoke
  - `GET /` → 200
  - `GET /players` → 200
  - 데이터 소스 미설정 상세 → 200과 명시적인 unavailable 화면
  - `GET /app?source=pwa&token=...&next=...` → 308 `/?source=pwa`
  - `HEAD /app/players?q=Ahri%2322&page=2&token=...` → 308 `/players?q=Ahri%2322&page=2`
  - `GET /app/players/42` → 404, `Location` 없음
  - `POST /app/players` → 405, `Allow: GET,HEAD`

## 브라우저 검수

- 로컬 production build를 1440×1000, 390×844에서 직접 렌더링했다.
- 홈·목록·상세 모두 H1 1개, 수평 overflow 없음.
- 데스크톱 header 핵심 조작부는 최소 높이 44px.
- 모바일 하단 메뉴는 정확히 5개이며 각 항목은 66×52px 이상.
- 검색 modal은 열릴 때 검색 input으로 포커스되고 ESC 후 원래 검색 trigger로 복귀한다.
- 전체 메뉴 modal은 닫기 버튼으로 포커스되고 ESC 후 원래 메뉴 trigger로 복귀한다.
- skip link는 `#main-content`로 연결되고 banner/main/contentinfo landmark를 제공한다.
- 데이터 source 미설정 시 홈·목록·상세는 샘플 대신 명시적인 unavailable 상태를 표시한다.
- 브라우저 개발 로그: 오류·경고 0건.
- `prefers-reduced-motion`에서는 animation/transition을 축소한다.

## 캡처

- `home-desktop-1440.jpg`
- `home-mobile-390.jpg`
- `search-dialog-desktop.jpg`
- `mobile-menu-390.jpg`
- `players-desktop-1440.jpg`
- `players-mobile-390.jpg`
- `players-mobile-bottom-390.jpg`
- `player-detail-unavailable-desktop-1440.jpg`
- `player-detail-unavailable-mobile-390.jpg`

## 남은 위험과 다음 파동

1. 실제 운영 PostgreSQL 화면 smoke는 하지 않았다. 격리 DB 계약만 확인했다.
2. V1 숫자 ID → V2 UUID 영속 mapping이 없어 `/app/players/[playerId]` redirect는 의도적으로 미구현이다.
3. 시즌·경기·포지션·챔피언·Riot 요약 read model과 고급 검색/정렬이 미완료다.
4. canonical 37개 중 34개는 `planned`이며 화면 링크처럼 동작하지 않는다.
5. 사용자 인증, 역할별 전체 E2E, 실제 데이터 migration count/hash/invariant 검증이 남았다.

따라서 이 파동을 V2 완성 또는 운영 반영으로 판정하지 않는다.
