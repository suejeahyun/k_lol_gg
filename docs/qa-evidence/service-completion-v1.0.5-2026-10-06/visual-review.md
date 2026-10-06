# 공개 화면 시각·접근성 재검토

## 기준과 범위

- 기준 커밋: `ca242292`, 운영 기능 버전 `1.0.4`. 시작 시 작업 트리 clean 확인.
- `AGENTS.md`, `PROJECT_RULES.md`, 공통 컴포넌트 원장과 설치된 Next CSS·접근성 문서를 읽었다.
- 현재 소스와 v1.0.4 운영 홈·모바일 로그인 스크린샷을 대조했다. 홈 순서, 단일 랭킹 캐러셀, 생성 이미지 테마, 불필요한 설명을 제거한 화면은 유지한다.
- 이 문서의 최초 기록은 읽기 전용 감사다. 실제 브라우저는 root가 담당하며, 측정을 요청한 항목을 통과로 쓰지 않는다. 새 디자인 샘플·패키지·시각 효과를 추가할 근거는 없다.

## 발견 및 검증 상태

| 항목 | 영향과 원인 | 근거·측정 | 상태·최소 개선안 |
|---|---|---|---|
| V-01 검색어 줄바꿈 | 긴 닉네임을 그대로 표시하는 링크의 줄바꿈 후보 | 초기 `globals.css` 단독 조사에서 후보로 분류했으나, 실제 `ux.css:27`에 `overflow-wrap:anywhere`가 이미 존재. root 운영 CUA 320px·공백 없는 영문 80자에서 링크 좌우 40..280px, 정상 줄바꿈 확인. [기존 상태 화면](search-before.jpg) | **재현 안 됨·수정 불필요**. 공통 CSS 전체를 대조해 기존 구현으로 해소된 상태임을 확인 |
| V-02 키보드 포커스 대비 | 랭킹·MMR·전적·미디어 등의 개별 CSS가 공통 `--ring`을 옅은 투명 외곽선으로 덮어 키보드 위치 파악이 어려움 | 랭킹 `rgba(103,166,227,.45)` 흰 배경 합성 대비 **1.49:1**, MMR `.4` **1.69:1**, 미디어 `.38` **1.56:1**, 계정 탭 `.32` **1.51:1**, 검색 결과 `.16` **1.19:1**. root 운영 CUA에서 실제 순위 로드 후 Shift+Tab으로 최소 참여 입력에 focus, 해당 RGBA/solid 3px/흰 배경 재현 | **수정·소스 회귀 통과**. 기존 공통 `--ring`/계정 focus 토큰으로 변경. 랭킹·MMR·미디어 카드·검색 결과는 흰 배경 대비 **4.92:1**. 이미지 위 링크는 흰 외곽선과 파란 안쪽 경계. 수정 후 실제 브라우저는 통합 단계 |
| V-03 순위 숫자 대비 | 전체 순위 1~3위 및 내 순위 표시에 작은 흰 글자를 밝은 배지 위에 표시 | `rankings.module.css:46,50–53`: 14px 흰 숫자 / 금 `#c79324` **2.75:1**, 은 `#7893ab` **3.20:1**, 동 `#ad7056` **4.02:1**. 9px `나` / `#628fc4` **3.36:1** | **수정·소스 회귀 통과**. 금은동 색 계열을 보존하며 `#8d6419`/`#536b81`/`#8a533d`로 변경해 **5.29/5.54/6.20:1**. 내 순위는 공통 primary 쌍과 11px로 조정해 **4.92:1** |
| V-04 긴 플레이어 이름 | 전체 랭킹에서 공백 없는 긴 영문 이름이 성적 칸과 겹치고 카드 경계에서 잘림 | root의 새 격리 fixture 실제 320px: `W×16` 링크 width137/scrollWidth240, strong width240·overflow-wrap normal, 이름 x69..309와 성적 x218이 겹침. 한글16은 정상 줄바꿈. [수정 전 화면](ranking-long-before.jpg). MMR은 이미 `min-width:0; overflow-wrap:anywhere` 사용 | **재현·최소 수정 완료, 수정 후 브라우저 대기**. 전체 순위 링크와 동일 원인의 상위 순위 카드 링크 두 규칙에 기존 MMR 방식 추가. 이름/ID를 생략하지 않고 칸 안에서 줄바꿈 |

색 대비는 CSS의 sRGB 채널을 선형화한 상대 휘도로 계산했다. 투명 외곽선 계산은 흰 배경을 가정한 소스 측정이며, 이미지·반투명 실제 배경 전체의 통과 판단이 아니다. 숫자 배지는 불투명한 단색 CSS로 계산했다. 기준 참고: [W3C 비텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [리플로](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## 수정 및 focused 검사

- 기존 CSS 12개만 수정: `globals.css`, 공개 랭킹/MMR/전적/결과 제출/미디어/팀 도구/가이드/도움말/이벤트/참가 신청 CSS와 `account-access.module.css`. 계정 토큰과 전역 토큰을 재사용했다. 기능·권한·집계·문구·자산·DOM 순서 변경 없음.
- 마우스 hover 효과와 키보드 focus를 검색 결과·홈 소식 링크에서 분리했다. 마우스 hover는 기존 색, 키보드에서만 선명한 표시를 사용한다. 이미지 위 링크는 배경 이미지의 밝기에 따라 하나의 색이 사라지지 않도록 기존 이미지 안쪽에 두 색을 표시한다. 강제 색상 모드 규칙은 보존했다.
- `tests/design-tokens.test.mjs`의 기존 휘도 계산을 재사용하여 작은 배지와 실제 CSS 외곽선 색을 측정하는 회귀 두 개를 추가했다. [수정 전](contrast-before.log) 신규 2개 실패(1위 2.75:1, 랭킹 focus 1.49:1) → [수정 후](contrast-after.log) 4/4 통과. 기대 CSS 문자열만 바꾸지 않고 계산 결과를 검사한다.
- [전후 계산 원본](contrast-measurements.json): 기준 커밋의 CSS와 수정 CSS를 직접 읽은 수치. 새 성능 수치·전체 WCAG 통과를 의미하지 않는다.
- [관련 focused 검사](visual-focused.log): 디자인 토큰, 홈 단일 랭킹/키보드/수동 조작, 미디어 이미지 실패·모션 감소·44px, 팀 도구, 이벤트, 계정 활동 **24/24 PASS**. [수정 테스트 ESLint](visual-eslint.log) exit 0. PostCSS로 변경 CSS 12개 구문 파싱 성공, `git diff --check` exit 0.
- 전체 검사·build·DB·commit·배포는 이 담당에서 실행하지 않았다. root 통합 단계로 남긴다.

### 긴 이름 재현 후 회귀

- 실제 320px 격리 fixture에서 표시된 W 16자의 이름과 승률이 겹치는 화면을 확인했다. 문서 작성 시점에는 원인 후보였지만 root의 DOM 측정과 화면으로 제품 결함을 확정했다. 운영 회원을 수정하지 않았다.
- `rankings.module.css`의 `.board li a`와 `.podium a`에만 `min-width:0; overflow-wrap:anywhere`를 추가했다. 기존 카드/이미지 테마/대비/44px/집계/순서는 유지한다. 상위 카드는 같은 grid·긴 이름 표시 원인 범위로 함께 보완했다.
- `tests/rankings-long-names.test.mjs`가 실제 페이지 SSR에 W16·한글16·Riot ID를 넣어 세 분류 모두 전체 식별자/선수 링크/별도 성적 셀을 유지하는지 확인한다. CSS는 PostCSS로 실제 선언을 읽고 320/390/768/1280 조건에서 두 링크가 줄어들고 임의 위치 줄바꿈을 허용하는지 검사한다. CSS 검사는 브라우저의 픽셀 측정을 대체하지 않는다.
- [수정 전](ranking-long-test-before.log): SSR PASS, CSS 회귀 FAIL. [수정 후 관련 계약](ranking-long-test-after.log): 신규2 + 디자인 토큰4 + 홈 랭킹4 = **10 PASS**. [집계·뷰 unit](ranking-long-unit.log) **5 PASS**, [ESLint](ranking-long-eslint.log) exit0. 수정 후 실제320px 카드/표의 scrollWidth·이름/성적 간격은 root의 새 빌드 fixture에서 다시 확인한다.

## 유지 판단과 경계

- 현재 홈·모바일 로그인 증거에서 글/주요 버튼/폼의 위계와 기존 이미지 테마는 일관된다. 주제나 전체 배치를 교체할 근거는 발견하지 않았다.
- 기본 버튼·홈 캐러셀·로그인 입력·랭킹 필터 등의 44px 조작 크기, 제목과 label, `prefers-reduced-motion` 및 forced-colors 대응을 기존 소스에서 확인했다. 모든 실기기에서 검증했다는 뜻은 아니다.
- v1.0.4 `browser-layout.json`의 `/rankings` 행은 title이 `불러오는 중`이다. 이 행만으로 데이터가 표시된 순위의 긴 이름 안전성을 판단하지 않는다.
- Safari 실기기, 실제 보조기기, 임의 사용자 설정과 외부 Riot·카카오 동작은 별도 경계다. 이번 감사에서 운영 데이터·계정·신청·경기를 변경하지 않았다.
