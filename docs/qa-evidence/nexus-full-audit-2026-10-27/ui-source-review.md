# NEXUS 전체 UI 소스 감사

- 날짜: 2026-10-27
- 기준 HEAD: f07b2275 및 이번 작업의 미커밋 수정
- 작업 위치: E:\k-LOL.GG\worktrees\nexus-gg-20261027
- 담당 범위: 공개·관리자 테마, 폼·표·버튼 대비, 상태 표시, CSS 선택자, 경로 목록 연결
- 구현 변경: src/app/nexus-theme.css와 NEXUS 전용 CSS Module 마커 PostCSS 플러그인·등록·회귀 테스트. 권한·라우트·저장·요청 처리 코드는 변경하지 않음.
- 브라우저 조작·빌드·전체 검사는 루트 담당. 이 감사에서는 소스 읽기, 실제 PostCSS/Lightning CSS 컴파일, 마커 회귀 및 기존 경로 테스트를 실행함.

## 확인 범위와 방법

USER_ROUTE_MAP.md, ADMIN_ROUTE_MAP.md, 실제 App Router 파일과 CSS Modules를 함께 확인했다. 현재 page.tsx는 108개다. 공개 그룹 45개, 관리자 그룹 61개, 별도 인증 그룹 2개이며 canonical 탐색 항목 수와는 다르다. CSS Module 45개를 열거하여 밝은 배경, 고정 글자색, 상태·hover 선택자와 JSX 클래스 조합을 조사했다.

빈 DB에서 보이지 않는 내부 폼·목록의 문제는 JSX와 CSS 연결로 확인했다. 루트가 제공한 합성 관리자 브라우저 결과 [ui-before.json](ui-before.json)과 계정 화면 결과 [account-before.json](account-before.json)도 참고했다. 관리자 파일의 27개 저대비 패턴 중 sr-only와 비활성 버튼은 실제 가시 텍스트 문제와 구분했다.

| 영역 | 대표 경로 | 확인 요소 |
| --- | --- | --- |
| 공통·계정 | /, /login, /signup, /account/** | 셸, 메뉴·검색 dialog, 계정 탭, 메시지, 입력·focus |
| 안내·설치 | /start, /help/**, /install, 정책 페이지 | 단계 카드, 안내 패널, 이미지 overlay, 설치 동작 주변 |
| 플레이어·경기 | /players/**, /matches/**, /rankings/** | 티어 필터, 경기·승리팀·MVP, 업로드·재개·접수 이력, Riot 표 |
| 참가·대회 | /applications, /competitions/**, /recruits | 통계, 포지션 선택, 참가자, 단계·선택 상태, 상태 배지 |
| 도구 | /tools/team-balance/**, /tools/random-team, /tools/coin-toss | 후보·팀 배치·비교·수동 이동·저장 초안·밴픽 추천 |
| 관리자 사람·시즌 | /admin, /admin/players/**, /admin/users/**, /admin/seasons/** | 운영 상태, 신원 fieldset, facts, 시즌 카드·설정·신청 표 |
| 관리자 경기·밸런스 | /admin/matches/**, /admin/balance/**, /admin/balance-ai | 경기 editor, 자동완성, 검수 상태, 통계·수동 조정 |
| 관리자 운영·미디어 | /admin/operation-forms/**, /admin/discipline/**, /admin/site-settings, /admin/highlights/**, /admin/images/**, /admin/champions/** | 필터·생성·보관, 설정 체크, 업로드·선택 파일·목록 |
| 관리자 연동·대회 | /admin/kakao/**, /admin/riot, /admin/progress/**, /admin/usage | 상태·통계 패널, 단계 표시, 반복 표·카드 |

## 확인한 문제와 수정

### UI-01 — 복수 클래스에서 공통 surface 선택자 누락

기존 class 속성의 끝을 검사하는 선택자는 대상 클래스가 마지막일 때만 일치했다. 실제 예는 admin-import-panel.tsx:250의 paste wide, admin-operation-form-actions.tsx:54의 panel form, 결과 제출의 panel resumePanel이다. 브라우저에서도 /admin/matches/new의 paste wide 영역은 밝은 배경에 밝은 글자색으로 관측됐다.

마지막 토큰과 공백 앞 토큰을 함께 검사하도록 수정했다. 최종 안정 마커 기준 예: :is([class$="--panel"], [class*="--panel "]). 마지막 공백은 panelTitle 같은 다른 로컬 클래스를 잘못 매칭하지 않도록 한다. 모든 CSS Module 로컬 클래스 대응 선택자에 적용했다.

### UI-02 — 텍스트 강조색을 버튼 배경으로도 사용

admin-operations.module.css:7은 --admin-accent를 버튼 배경에 사용한다. NEXUS에서 이 토큰은 텍스트용 밝은 파랑 #9dbbff이므로 흰 글자 대비가 1.91:1이었다. 실제 화면은 /admin/operation-forms의 필터 적용, /admin/discipline의 생성 링크, /admin/discipline/new의 제출 버튼이다. champions.module.css:1의 --text-accent 배경 버튼도 같은 문제였다.

해당 작업 버튼의 배경을 #315bd4, 글자색을 흰색으로 분리했다. 새 대비는 5.87:1이다. 삭제·보관 버튼은 짙은 분홍 배경과 밝은 분홍 글자를 사용하며, 비활성 경기 제출 버튼의 흐린 상태도 유지한다.

최종 대표 화면 재검증에서 이벤트 상세의 신청 버튼이 기존 #4b78bd 배경으로 4.45:1을 보여, events의 application 내부 submit 버튼에도 같은 검증된 파랑을 적용했다. 취소 등 보조 버튼은 이 선택자에 포함하지 않는다.

### UI-03 — 중첩된 밝은 패널과 전역 밝은 글자색 충돌

admin-players.module.css:46의 identityGroup과 상세 facts div는 밝은 배경을 유지했으나 label/legend/dt/dd에는 NEXUS 공통 글자색이 적용됐다. /admin/players/new의 관측 대비는 1.11:1, /admin/seasons의 facts는 1.06:1, 미디어 목록과 생성 폼은 약 1.15:1이었다.

추가 소스 사례는 applications의 통계·포지션·참가자, events의 신청·facts·세부 패널, team-tools의 후보·수동 편성·비교, matches-admin의 경기 editor·선택 목록, mmr-admin 조정 폼의 상위 actions다. 이 내부 표면과 관련 hover를 NEXUS 네이비로 지정했다. 양식 구조와 행·열·반응형 레이아웃은 보존했다.

대표 새 조합은 본문 #e9efff / #17253d 13.34:1, 보조 글자 #a8b8d3 / #17253d 7.65:1이다.

계정 브라우저 결과의 /matches/submit optionalGrid는 자체 배경 없이 optionalFields(details) 안에 있으므로 optionalFields 배경 수정으로 해결된다. /matches/submissions의 historyFilters도 직접 대응한다.

### UI-04 — 선택된 탭·단계의 시각적 상태 소실

공통 탭 skin은 aria-current·aria-selected만 처리했으나 실제 관리자 경기 메뉴는 data-active="true"를 사용한다. matches/page.tsx:54–55, matches/[matchId]/page.tsx:39의 선택된 링크도 일반 탭과 같은 배경으로 덮였다.

data-active와 도구 버튼의 aria-pressed·data-selected를 해당 컨트롤에 맞게 처리했다. 이벤트 단계의 data-state="current"/"done"과 관리자 단계 current 클래스도 구별한다. 선택 상태에는 배경과 테두리/하단 표시를 함께 사용한다. 선택·드래그·키보드 이동 기능 자체는 변경하지 않았다.

### UI-05 — 어두운 표면에 고정된 어두운 글자색 잔존

관리자 홈 page.module.css:71의 중첩 notice p는 기존 direct-child override를 벗어났다. 브라우저 관측은 #5c6c83 / #18253c, 2.87:1이었다. 운영 상태·health 본문, 역할 표시, 일부 상세 facts·미디어 설명도 고정 색을 사용했다.

notice의 중첩 문단과 해당 관리자·운영 영역의 본문·보조·강조 글자를 NEXUS 토큰에 연결했다. Riot 작은 글자에서 버튼용 --primary를 쓰던 결과·스킬·시간·액션은 밝은 텍스트 강조색을 사용한다. Riot 표의 data-self 행은 일반 셀 배경에 가려지지 않도록 자기 행 표시도 유지한다.

### UI-06 — 체크된 설정과 중요한 상태의 대비

operations.module.css:30의 체크된 설정이 밝은 #eef5ff 배경을 유지했다. /admin/site-settings에서 보조 글자와의 대비는 1.83:1이었다. 기본 체크 영역과 체크된 상태를 각각 어두운 표면과 파란 선택 표면으로 지정했다.

admin-media.module.css:56의 보관 버튼은 기존 !important 어두운 빨강이 남으므로 서비스·컴포넌트·버튼에 한정한 override를 추가했다. 이벤트 상태 배지도 기존 !important 글자색을 같은 방식으로 처리하며 모집·완료·취소 의미를 유지한다.

### UI-07 — 설치 안내의 밝은 이미지 overlay와 빈 높이

guide.module.css:24의 가로 흰색 gradient와 모바일 세로 gradient가 NEXUS에도 적용됐다. 루트가 /install의 흰 띠를 시각적으로 확인했다.

네이비 overlay로 전환하고 이미지 영역의 최소 높이를 기본 220px, 860px 이하 180px로 조정했다. 이미지·대체 텍스트·설치 버튼·설치 이벤트 처리는 그대로다. 홈 랭킹 캐러셀의 흰 아이콘 배경, 미디어 fallback·캐러셀 컨트롤도 네이비 표면에 맞췄다.

### UI-08 — 데이터가 채워진 팀 초안의 점수·선수 정보

저장된 합성 팀 초안의 추가 브라우저 검사에서 team-tools.module.css:983의 evaluationOverview strong, 1027의 manualPlayerInfo strong, 1031의 manualAssignmentInfo strong이 어두운 표면 위에 기존 어두운 색으로 남았다. 1006의 BLUE 수동 팀 header는 밝은 배경에 밝은 h3를 표시하여 약 1.05:1이었다.

원본 모듈의 모든 색·배경·상태 선언과 실제 팀 초안 JSX를 다시 대조했다. 현재 평가·후보 점수, 선수 이름·티어·배정 근거, 라인 차이·추천/밴 정보의 글자색, BLUE 수동 팀 header를 해당 로컬 클래스에 한정해 수정했다. 입력 완료·저장·평가·보관 상태, 추천 선택·키보드 선택·드롭 대상, RED 팀과 큰 차이/작은 차이 의미를 보존했다. 이 도구의 주요 흰 글자 gradient 버튼도 검증된 파랑으로 변경했다.

### UI-09 — Next 16.4.3의 CSS Module 산출물 이름 변경

보안 업데이트 후 실제 빌드에서 이전 team-tools-module__hash__manualPlayerInfo 형태가 hash_manualPlayerInfo로 바뀌어 파일명 기반 테마 선택자가 일치하지 않았다. Next 16.4.3의 공식 Turbopack 설정과 로컬 config schema에는 이 명명 형식을 고정하는 옵션이 없었다.

scripts/postcss/nexus-module-markers.cjs를 postcss.config.mjs에 등록했다. NEXT_PUBLIC_SERVICE_ID=nexus일 때만 src 안의 .module.css에 global composition을 추가한다. 원래 해시 클래스와 함께 nexus-team-tools--manualPlayerInfo 같은 고정 마커를 export하므로 테마는 번들러의 해시나 이름 형식에 의존하지 않는다. JSX나 원본 CSS Module 파일은 변경하지 않는다.

CSS 선택자 parser로 지역 클래스만 추출하고 함수형 :global과 keyframes를 제외한다. @media 안의 지역 클래스, 쉼표 뒤 클래스, escape된 식별자도 처리한다. basename 중복은 빌드를 실패시키며, Turbopack이 지원하지 않는 비함수형 :global/:local도 잘못된 마커를 만들기 전에 실패시킨다. 마커는 원래 해시 뒤에 추가될 수 있으므로 파일명 접두 검사도 class 속성의 첫 위치에 의존하지 않는다. 클래스 suffix 검사와 상태 선택자의 우선순위는 유지했다.

실제 전체 45개 모듈과 928개 지역 클래스 export를 PostCSS와 Lightning CSS로 검증했다. 추가 composition이 남기는 선언 없는 빈 규칙을 제외하면 기존 컴파일 결과의 선택자·선언·순서는 동일하다. K-LOL/default 모드는 45개 파일 모두 원본 CSS와 바이트 단위로 동일하다. 모듈 basename을 재사용할 필요가 생기면 먼저 고정 마커 네임스페이스 계약을 확장해야 한다.

제한: 현재 45개 모듈에 없는 :global(... :local(...)) 중첩 scope는 지원 범위가 아니다. 독립 리뷰의 합성 입력에서 Lightning CSS의 원본 export와 플러그인의 지역 클래스 판정이 다를 수 있음을 확인했다. 이런 중첩 문법을 도입하기 전에는 컴파일러 기준 scope 처리와 회귀 검증을 추가해야 한다. 현재 실제 소스의 export 동등성에는 영향이 없으며, 이번 변경에서 이 가상 문법까지 지원을 확장하지 않았다.

## 중복 h1 후보 판정

/start/page.tsx:22와 /tools/coin-toss/page.tsx:19는 각각 본문 h1이 하나다. CoinTossTool의 추가 제목은 h2이며 셸과 workflow navigation에도 h1이 없다.

(public)/loading.tsx가 사용하는 StatusPanel에는 h1인 "불러오는 중"이 있다. 따라서 스트리밍 중 원시 DOM의 h1 개수만 2개로 잡힌 관측은 표시·접근성 트리 확인이 필요하다. 현재 소스에서는 최종 화면의 중복 h1 문제로 확정하지 않았다.

## 경로·기능 누락 점검

- canonical 사용자 탐색 39개: 중복 없음, page-contract 경로가 실제 파일에 연결됨.
- V1 사용자 호환 경로: redirect 32개와 통합 20개의 기존 계약 검사 통과.
- 관리자 V1 81개 전환 ledger, 허용 목적지와 매개변수 계약 검사 통과.
- 실제 관리자 canonical App Router 페이지와 HTTP guard matrix의 누락 비교 검사 통과.
- 이 범위에서 새 경로 누락은 확인되지 않았다. 경로 존재·보안 매트릭스 검사는 각 업무의 성공적인 저장·외부 연동을 증명하지 않는다.

## 실행한 검증

1. PostCSS parse 및 모든 comma-separated 최상위 선택자의 NEXUS 경계 검사: 367개 전부 서비스 경계로 시작.
2. Lightning CSS 실제 컴파일: 통과, minified CSS 58,174 bytes.
3. git diff --check -- src/app/nexus-theme.css: 통과. Git의 CRLF 안내만 발생.
4. 기존 TypeScript 검사 19개 통과: user-navigation, team-tool-navigation, competition-navigation, admin-route-contracts, legacy-user-route-inventory.
5. 기존 admin-route-inventory.test.mjs 검사 1개 통과.
6. 주요 새 전경·배경 조합의 WCAG 상대 휘도 계산: 위에 대비 수치 기재. 특정 색 조합 검증이며 전체 화면의 접근성 합격 선언은 아니다.
7. node --test tests/nexus-module-markers.test.mjs: 6개 통과. 45개 모듈·928개 지역 클래스 global composition, K-LOL 원본 보존, 상태·선택자 선언 보존, 반복 변환, :global/keyframes, 중복 basename 실패, 서비스 경계·테마 컴파일 검증.
8. npx eslint scripts/postcss/nexus-module-markers.cjs postcss.config.mjs tests/nexus-module-markers.test.mjs: 통과.

K-LOL은 이 선택자들의 서비스 경계에 일치하지 않는다. 이번 감사에서 K-LOL 공통 CSS나 CSS Module 원본, 라우트, 인증 코드는 수정하지 않았다.

## 후속 시각 검증

변경 이후의 최종 build와 브라우저 재검증은 루트가 수행한다. 특히 합성 데이터가 필요한 관리자 편집·파일 선택·검수 팝업, 팀 후보·수동 이동·이벤트 단계, hover/focus/선택 상태를 다시 확인해야 한다. 그라디언트·이미지 배경, 숨겨진 스트리밍 fallback, 비활성 컨트롤을 단순 대비 스캐너의 수치와 혼동하지 않는다.

테마는 빌드가 생성하는 고정 global composition 마커를 사용한다. 향후 번들러 변경 시에도 실제 빌드와 브라우저에서 마커 export/DOM 적용을 확인한다. PostCSS/Lightning CSS 단위 검증만으로 Next의 최종 통합 빌드와 화면 검증을 대체하지 않는다.

## 루트 최종 통합 검증

Next 16.4.3 실제 production build에서 stable marker와 테마 적용을 확인했다. 320px 관리자 검색의 min-content 넘침을 minmax(0, 1fr)와 입력 최소 폭으로 보완해 clientWidth/scrollWidth 모두 305px로 확인했다. 모바일 계정 표 카드·보조 레이블·조회 버튼도 NEXUS 색으로 맞췄다. 최종 선택자 381개, minified CSS 59422 bytes. 최종 focused 6개 및 production build 통과. 320/390/1440px 대표 18조건 결과는 ui-final.json, 합성 팀 화면은 team-draft-desktop.png, 320px 관리자 화면은 admin-mobile-320.png에 있다. 최종 대표 조건의 직접 텍스트 단색 대비·이름 없는 조작 요소·깨진 이미지 문제는 발견되지 않았다. 이미지/gradient나 모든 업무 상태를 포함한 접근성 인증은 아니다.
