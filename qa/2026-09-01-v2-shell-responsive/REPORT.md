# V2 공통 셸 모바일 경계 검수

## 범위

- 공개 플레이어 목록의 390×844 모바일 최하단
- 고정 하단 내비게이션과 푸터의 겹침 여부
- 전체 기능 네이티브 대화상자의 배경 스크롤과 스크롤 체이닝
- 홈 인디케이터가 있는 기기의 `safe-area-inset-bottom`

## 확인된 결과

- 프로덕션 빌드의 `/players`를 실제 390×844 브라우저에서 최하단까지 스크롤했다.
- 최하단에서 푸터 하단은 `756.09px`, 고정 내비게이션 상단은 `766px`로 측정되어 9.91px 간격이 있었다.
- 기존 full-page 스티칭 캡처에서 보이던 겹침은 실제 최하단 레이아웃 결함이 아니었다.
- 대화상자 열림 상태에서 `body overflow: hidden`, 대화상자 `overscroll-behavior: contain`을 확인했다.
- 대화상자는 뷰포트 `42px`부터 `802px`까지 표시되고, 긴 메뉴는 대화상자 내부에서만 스크롤된다.
- 검색 대화상자를 열면 활성 요소가 `type=search` 입력칸으로 이동해 키보드 사용자가 즉시 입력할 수 있음을 확인했다.
- 초기 검사는 `innerWidth`만 비교해 고전형 세로 스크롤바가 차지하는 15px을 놓쳤다. 후속 캡처에서 `root clientWidth=305`, `scrollWidth=320`과 가로 스크롤바를 재현했다.
- 원인은 `body min-width: 320px`였으며 이를 제거한 뒤 같은 320px 뷰포트에서 root/body `clientWidth=scrollWidth=305`, `min-width=0`, `scrollX=0`을 확인했다.

## 수정

- 모바일 본문 하단 여백을 `88px + safe-area-inset-bottom`으로 계산한다.
- 사용자 대화상자가 열리면 배경 문서 스크롤을 잠근다.
- 대화상자 끝에서 배경으로 스크롤이 전달되지 않게 한다.

## 증거

- `players-mobile-bottom-390x844.png`
- `mobile-menu-scroll-lock-390x844.png`
- `search-initial-focus-320x800.png`
- `home-320-classic-scrollbar-fixed.png`
- `npm run lint`: 통과
- `npm run typecheck`: 통과
- `npm run build`: Next.js 16.3.4 프로덕션 빌드 통과

## 남은 제한

- 현재 브라우저의 안전 영역 환경값은 `0px`이므로, 홈 인디케이터 실기기 시각 검수는 릴리스 전 별도 장치 매트릭스에서 다시 수행한다.
- 이 보고서는 공통 셸 경계만 다루며 V2 전체 페이지 기능 완성을 의미하지 않는다.
