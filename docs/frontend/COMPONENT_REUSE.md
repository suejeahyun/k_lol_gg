# 공통 컴포넌트와 점진 추출 기준

이 문서는 K-LOL.GG 프런트엔드의 공통 컴포넌트 원장이다. 새 UI를 만들거나 큰 화면을 나눌 때는 먼저 이 목록과 실제 호출부를 `rg`로 대조한다.

## 현재 기준

- 조사 기준: `src/components`와 `src/modules/*/ui`
- `src/components`: 50개 파일 (`.tsx` 36개, `.css` 14개)
- 모듈 소유 UI: `src/modules/players/ui` 2개 파일
- 별도의 `atoms/`, `molecules/`, `organisms/`, `templates/` 디렉터리는 없다.
- 현재 분류는 기술 계층보다 `ui` 원시 컴포넌트, shell, 기능/도메인 소유권을 우선한다.

아래 수치는 AST 분석이 아니라 `rg`로 확인한 호출 지표다. 원시 태그는 `<button>` 207회, `<input>` 154회, `<select>` 86회, `<textarea>` 20회, `<table>` 16회다. 반면 `@/components/ui` import는 `Button` 7개 파일, `Input` 4개 파일, `Badge` 5개 파일, `Card` 1개 파일이다. 이 차이는 일괄 치환 근거가 아니라, 새 코드에서 기존 원시 컴포넌트를 먼저 검토하고 기능별로 안전하게 채택할 근거다.

## 50개 파일 인벤토리

이 표의 수는 파일 수다. 한 파일이 여러 React 컴포넌트를 export할 수 있고, CSS module은 바로 위의 TSX와 함께 하나의 표현 계약을 이룬다.

### UI 원시 컴포넌트 — 4개

| 파일 | 역할과 공개 API |
|---|---|
| `src/components/ui/button.tsx` | `Button`, `buttonVariants`; variant와 size를 갖는 기본 버튼 |
| `src/components/ui/input.tsx` | `Input`; 공통 입력 focus, invalid, disabled 표현 |
| `src/components/ui/badge.tsx` | `Badge`, `badgeVariants`; 상태·범주용 작은 라벨 |
| `src/components/ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |

### 사이트 공통·shell·navigation — 8개

| 파일 | 역할 |
|---|---|
| `src/components/site-shell.tsx` | 공개 사이트 shell |
| `src/components/navigation/user-site-navigation.tsx` | 데스크톱·모바일 사용자 내비게이션과 fallback |
| `src/components/status-panel.tsx` | 전체 화면 loading/error/not-found 상태 패널 |
| `src/components/site-feature-state.tsx` | 일시 중단·설정 불가 기능 상태 화면 |
| `src/components/site-feature-state.module.css` | 기능 상태 화면 스타일 |
| `src/components/site-ai-assistant.tsx` | 사이트 AI 도우미 클라이언트 UI |
| `src/components/site-ai-assistant.module.css` | 사이트 AI 도우미 스타일 |
| `src/components/pwa-registration.tsx` | PWA 등록 경계 |

### 계정·인증 — 11개

| 파일 | 역할 |
|---|---|
| `src/components/accounts/account-auth-forms.tsx` | 사용자 로그인·가입·비밀번호 복구 폼 |
| `src/components/accounts/account-password-form.tsx` | 로그인 사용자의 비밀번호 변경 폼 |
| `src/components/accounts/account-player-form.tsx` | 계정의 플레이어 정보 폼 |
| `src/components/accounts/account-logout-button.tsx` | 사용자 로그아웃 버튼 |
| `src/components/accounts/account-access.module.css` | 사용자 계정 화면·폼 공통 스타일 |
| `src/components/auth/admin-login-form.tsx` | 관리자 로그인 폼 |
| `src/components/auth/admin-login-form.module.css` | 관리자 로그인 폼 스타일 |
| `src/components/auth/admin-login-page.tsx` | 관리자 로그인 페이지 표현 |
| `src/components/auth/admin-login-page.module.css` | 관리자 로그인 페이지 스타일 |
| `src/components/auth/admin-totp-security-panel.tsx` | 관리자 TOTP 설정·해제 패널 |
| `src/components/auth/admin-totp-security-panel.module.css` | 관리자 TOTP 패널 스타일 |

### 관리자 공통·기능 UI — 14개

| 파일 | 역할 |
|---|---|
| `src/components/admin/admin-shell.tsx` | 관리자 shell |
| `src/components/admin/admin-shell.module.css` | 관리자 shell·내비게이션 스타일 |
| `src/components/admin/admin-navigation.tsx` | 데스크톱·모바일 관리자 내비게이션 |
| `src/components/admin/admin-logout-button.tsx` | 관리자 로그아웃 버튼 |
| `src/components/admin/admin-workspace-page.tsx` | 준비 중인 관리자 작업 공간 템플릿; 현재 호출부 없음 |
| `src/components/admin/admin-workspace-page.module.css` | 작업 공간 템플릿 스타일 |
| `src/components/admin/accounts/admin-account-actions.tsx` | 계정 상태·역할·비밀번호·삭제 관리 작업 |
| `src/components/admin/players/admin-player-form.tsx` | 플레이어 생성·수정·비활성화·재활성화 |
| `src/components/admin/players/admin-players.module.css` | 플레이어와 계정 관리자 화면의 공유 스타일 |
| `src/components/admin/media/admin-media-form.tsx` | 하이라이트·갤러리 관리자 폼 |
| `src/components/admin/media/admin-media-pages.tsx` | 관리자 미디어 목록·생성·편집 페이지와 `AdminContentTabs` |
| `src/components/admin/media/admin-private-asset-pages.tsx` | 비공개 자산 목록·상세 페이지 |
| `src/components/admin/media/admin-private-asset-delete.tsx` | 비공개 자산 삭제 요청 UI |
| `src/components/admin/media/admin-media.module.css` | 미디어·챔피언 관리자 화면의 공유 스타일 |

### 도메인 소유 UI — 13개

| 파일 | 역할 |
|---|---|
| `src/components/champions/champion-portrait.tsx` | 챔피언 이미지와 fallback |
| `src/components/champions/champion-portrait.module.css` | 챔피언 초상화 스타일 |
| `src/components/discipline/admin-discipline-actions.tsx` | 징계 관리자 작업 |
| `src/components/discipline/admin-discipline-create-form.tsx` | 징계 등록 폼 |
| `src/components/discipline/owner-discipline-tasks.tsx` | 사용자 징계 해소 과제 |
| `src/components/discipline/discipline.module.css` | 공개·관리자 징계 화면 공유 스타일 |
| `src/components/home/home-guide-art.tsx` | 홈 안내 챔피언 아트 |
| `src/components/operation-forms/admin-operation-form-actions.tsx` | 운영 신청서 상태 변경 |
| `src/components/operation-forms/admin-operation-form-list.tsx` | 운영 신청서 목록과 필터 |
| `src/components/operation-forms/operation-forms.module.css` | 운영 신청서 화면 스타일 |
| `src/components/riot/riot-admin-actions.tsx` | 관리자 Riot 연결·동기화 작업 |
| `src/components/riot/riot-owner-actions.tsx` | 사용자 Riot 연결 작업 |
| `src/components/riot/riot-workspace.module.css` | 공개·관리자 Riot 화면 공유 스타일 |

### 모듈 소유 UI — 별도 2개

| 파일 | 역할 |
|---|---|
| `src/modules/players/ui/player-result-card.tsx` | 공개 플레이어 검색 결과 카드; `Card`, `Badge`, `ChampionPortrait`, `TierEmblem` 조합 |
| `src/modules/players/ui/tier-emblem.tsx` | 플레이어 티어 엠블럼 |

## 재사용 순서

1. `src/components/ui`의 `Button`, `Input`, `Badge`, `Card`로 표현 가능한지 확인한다.
2. shell, `StatusPanel`, `SiteFeatureStatePanel`, `ChampionPortrait`처럼 이미 의미가 정해진 공통 컴포넌트를 확인한다.
3. 같은 도메인의 컴포넌트와 CSS module을 확장할 수 있는지 확인한다.
4. 실제로 두 곳 이상에서 DOM 순서, 키보드 동작, 상태 의미가 같은 패턴만 새 컴포넌트로 추출한다.
5. 모양만 같고 권한, mutation, revision, 비밀정보 수명주기가 다르면 표현 shell만 공유하고 동작은 호출부에 둔다.

## 승격 기준

### `src/components/ui`로 승격

다음을 모두 만족할 때만 승격한다.

- 서로 다른 도메인에서 2개 이상 실제 호출부가 있다.
- 비즈니스 용어와 API endpoint를 props에 포함하지 않는다.
- HTML 의미, focus, disabled, invalid, 키보드 동작이 동일하다.
- 색·간격 차이는 기존 token 또는 작은 variant 집합으로 설명할 수 있다.
- server component를 불필요하게 client component로 바꾸지 않는다.

### 도메인 컴포넌트로 추출

- 같은 도메인의 2개 이상 화면에서 반복된다.
- 데이터 수명주기와 권한 계약이 같다.
- 공통 컴포넌트는 controlled props와 slot을 받고 fetch, router refresh, revision 판단은 소유 화면에 남긴다.
- 세 번째 도메인 사용처가 생기기 전에는 전역으로 올리지 않는다.

### 추출하지 않는 경우

- 같은 `header`, `card`, `state`, `form` class 이름만 공유하고 실제 구조나 의미가 다르다.
- 한 곳에서만 사용되며 다음 사용처가 추정에 불과하다.
- boolean prop을 계속 늘려야 두 화면을 합칠 수 있다.
- 보안 확인, 일회성 비밀값, `If-Match`, 멱등성 처리까지 범용 UI 안으로 숨겨야 한다.
- 일괄 치환 때문에 문구, DOM 순서, 모바일 표의 `data-label`, focus 복원 또는 live-region 역할이 달라진다.

## 상태·표·폼 계약

- `role="alert"`: 사용자가 즉시 알아야 하는 실패에만 쓴다.
- `role="status"`와 `aria-live="polite"`: 비동기 진행·성공·일시적 사용 불가에 쓴다. 단순한 최초 empty에는 자동으로 부여하지 않는다.
- 상태 패널 API는 `icon`, `title`, `description`, `action`, `tone`, `role`을 기본 축으로 삼고 heading level과 id를 호출부가 제어할 수 있어야 한다.
- 표 공통화는 먼저 overflow frame과 pagination만 추출한다. column/row 데이터까지 범용화해 공개 표의 `scope`나 모바일 `data-label`을 잃지 않는다.
- 폼 필드는 label과 control의 명시적 연결, hint/error id, `aria-describedby`, invalid, pending을 보존한다.
- destructive dialog는 focus 진입·복원, Escape, focus trap, typed confirmation이 같은 경우에만 공유한다.

## 확인된 반복과 점진 추출 순서

한 패치에 한 패턴만 다룬다. 아래 순서는 위험과 재사용 효과를 함께 본 권장 순서다.

### 0. 기존 컴포넌트 재사용 — 낮은 위험

- 비공개 자산 화면의 자체 `tabs()`는 `AdminContentTabs`와 같은 네 개 링크를 중복했다.
- `AdminContentTabs active="private-assets"`를 사용하고 새 API를 만들지 않는다.
- 확인점: 비공개 자산 탭에 `aria-current="page"`와 `data-active`가 유지되는지 본다.

### 1. `BoundedPicker` 위치 승격 — 낮음~보통

- 구현은 `src/app/(admin)/admin/matches/bounded-picker.tsx`에 있지만 경기 편집 외에도 징계, Riot, MMR, 이벤트전, 멸망전에서 사용한다.
- 새 추상화를 만들지 말고 기존 파일을 `src/components/admin` 아래로 옮긴 뒤 import만 갱신한다.
- 현재 API인 `ariaLabel`, `value`, `options`, `disabledValues`, `placeholder`, `remoteEndpoint`, `onChange`를 먼저 보존한다.
- 위험: route-local CSS 의존, 원격 검색 abort/focus/키보드 동작이므로 이동 패치에서 동작 변경을 섞지 않는다.

### 2. 관리자 플레이어·계정 목록 frame — 낮음~보통

- `src/app/(admin)/admin/players/page.tsx`와 `src/app/(admin)/admin/users/page.tsx`는 같은 `admin-players.module.css`를 사용하며 header, 조회 상태, `tableWrap`, pagination 구조가 반복된다.
- 먼저 `AdminRegistryHeader`, `AdminRegistryState`, `PaginationNav`처럼 작은 server-safe 표현 컴포넌트만 같은 관리자 영역에 둔다.
- 권장 API:
  - `AdminRegistryHeader({ eyebrow, title, description, action })`
  - `AdminRegistryState({ icon, title, description, tone, role, action })`
  - `PaginationNav({ ariaLabel, currentPage, totalPages, hrefForPage })`
- 위험: 각 목록의 query parameter 보존과 모바일 `td[data-label]`이 다르다. 범용 column schema는 만들지 않는다.

### 3. 계정 폼 피드백 — 낮음

- `account-auth-forms.tsx`, `account-password-form.tsx`, `account-player-form.tsx`가 같은 CSS module과 `data-tone`/`alert`/`status` 패턴을 반복한다.
- 권장 API: `AccountFormMessage({ message, fallback, tone, live = "polite" })`.
- error일 때만 `alert`, success/idle은 `status` 또는 일반 설명으로 구분하고 현재 문구를 바꾸지 않는다.

### 4. 공개 미디어 상태 패널 — 낮음

- 이미지와 하이라이트 목록은 동일한 로컬 `State({ icon, title, body, alert })`를 각각 선언한다.
- `media` 기능 폴더에 `MediaState` 하나를 두고 같은 CSS module을 사용한다.
- 위험: loading/not-found/detail 화면까지 한 번에 바꾸지 말고 우선 두 목록 페이지만 전환한다.

### 5. 홈의 반복 section — 보통

- 홈에는 같은 `section-heading` 구조가 4번, `home-feed-panel` 구조가 4번 반복된다.
- 먼저 `HomeSectionHeading({ eyebrow, title, aside, titleId })`를 추출하고, 다음 패치에서 `HomeFeedPanel({ icon, title, count, href, children, empty })`을 검토한다.
- 서로 다른 feed item을 하나의 거대한 union 데이터 모델로 합치지 않는다. 목록 내용은 children으로 남긴다.

### 6. 경기 관리자 피드백과 검증 요약 — 보통

- `match-editor.tsx`, `submission-review.tsx`, `admin-import-panel.tsx`가 같은 `styles.message`, `data-error`, `alert/status` 패턴을 쓴다.
- 권장 API: `MatchMutationMessage({ message, error })`와 `ValidationSummary({ title, items, success })`.
- fetch, revision 충돌 해결, 저장 가능 조건은 호출부에 둔다.

### 7. 경기별 로스터 편집 frame — 보통~높음

- `match-editor.tsx`와 `submission-review.tsx`가 게임 헤더, 승리 팀·진행 시간, 플레이어/챔피언 picker, K/D/A 입력을 반복한다.
- 첫 패치에는 `MatchGameControls`만 추출하고, 검증 뒤 `MatchRosterFields`를 분리한다.
- 권장 API는 controlled value와 callback 중심으로 두고 `headerAction`, `rowLead`, `rowTrailing` slot으로 삭제 버튼과 OCR·사람 확인 UI를 분리한다.
- 위험: 일반 편집은 게임 삭제를 지원하지만 검토 화면은 OCR 후보, 행별 원본 대조, 저장 전 확인 상태를 추가한다. state와 mutation을 공통 컴포넌트로 옮기지 않는다.

## 당장 공통화하지 않을 대상

- `Card`와 이름이 같은 37개 `styles.card`: 도메인별 정보 밀도와 interaction이 달라 일괄 전환하지 않는다.
- `AdminAccountActions`: 네 action panel의 외형은 비슷하지만 권한, typed confirmation, revision, 일회성 비밀번호 수명주기가 다르다. 필요하면 내부 표현 wrapper만 추출한다.
- `TeamBalanceBuilder`: 10개 행은 이미 데이터 기반으로 렌더링하고 `SingleChoice`도 파일 내부에서 재사용한다. 크기만으로 분리하지 않는다.
- `AdminWorkspacePage`: 현재 호출부가 없는 준비 중 템플릿이다. 새 화면에서 사용하기 전에 실제 계약을 확인하며, 미래 사용을 가정해 옵션을 늘리지 않는다.

## 변경 검증 체크리스트

- 기존 텍스트, DOM 순서, role, label, `aria-current`, `aria-live`가 유지되는가?
- 키보드 탐색, focus 진입·복원, disabled/pending이 유지되는가?
- 360px 전후 화면과 넓은 화면에서 overflow와 줄바꿈이 유지되는가?
- server/client 경계와 bundle이 불필요하게 커지지 않았는가?
- 변경 파일 lint와 typecheck가 통과하는가?
- 관련 테스트가 없으면 최소한 정적 계약 검사 또는 렌더링 QA 근거를 남겼는가?
