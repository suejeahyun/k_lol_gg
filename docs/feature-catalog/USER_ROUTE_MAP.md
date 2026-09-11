# V2 사용자 정보 구조와 V1 73개 경로 전환표

## 1. 목적과 판정 원칙

이 문서는 `USER_INVENTORY.md`의 V1 비관리자 화면 73개를 V2의 단일 반응형 사용자 경험으로 재편한다. 목표는 기능을 잃지 않으면서 V1의 데스크톱/모바일 복제 트리와 흩어진 별칭을 제거하는 것이다.

- 정확한 기준: V1 `8d4d2a491fd8647186502505054d68883a09a834`
- 최신 상향 기준: V1 `origin/main` `3e6a9f1a28fb01c91f4b4c00b7ea02a77d45295a`
- 기준 수량: 비관리자 화면 `73/73`, 비관리자 namespace Route Handler `112/112`
- 인증 원칙: 익명·로그인·승인·본인·관리자·bot·job 권한을 서버에서 판정한다.
- URL 원칙: 데스크톱·모바일·PWA가 같은 canonical URL을 사용한다.
- 호환 원칙: 동적 ID와 허용된 filter/query는 보존하되 외부 `next`, backslash, control character, 중복 slash는 거부한다.
- 완료 원칙: 각 canonical 화면의 ready/empty/loading/error/권한 상태와 아래 73개 전환이 검수되기 전에는 호환 경로를 제거하지 않는다.

### 1.1 판정 용어

| 판정 | 기능 처리 | V1 URL 처리 |
|---|---|---|
| **유지** | URL과 고유 기능을 V2 canonical 화면으로 유지 | 같은 경로 제공 |
| **통합** | 기능은 보존하되 상위 화면의 탭·패널·drawer로 합침 | 대상 canonical로 308, 동적 ID·허용 query 보존 |
| **redirect** | 모바일 복제·기존 별칭·경로 이동 | canonical로 308, POST API에는 사용하지 않음 |
| **폐기** | 고유 기능도 호환 가치도 없는 경로 | 한 버전 안내 뒤 접근 로그 0일 때만 410 |

이번 조사에서는 사용자 경로를 즉시 폐기할 근거가 없다. 따라서 **폐기 0개**이며, 기능 동등성과 실제 접근 로그를 확인한 뒤에만 다음 버전에서 재평가한다.

## 2. V2 사용자 셸과 정보 구조

### 2.1 데스크톱

```text
┌────────────────────────────────────────────────────────────────────────┐
│ K-LOL.GG  [홈] [플레이어] [경기·랭킹] [대회] [구인]   [검색] [계정]   │
├──────────────────┬─────────────────────────────────────────────────────┤
│ 현재 영역 보조 탐색│ breadcrumb · 제목 · 상태/기간 · 대표 CTA            │
│ 최근/저장한 항목   ├─────────────────────────────────────────────────────┤
│ 상황별 필터        │                                                     │
│ 도움말             │               사용자 작업 콘텐츠                    │
│                    │       목록 ↔ 상세 / 탭 / dialog / drawer            │
└──────────────────┴─────────────────────────────────────────────────────┘
```

상단바는 여섯 개 1차 영역과 전역 검색·계정만 담당한다. 사이드바는 항상 고정하지 않고, 플레이어 필터·대회 단계·팀 draft처럼 같은 영역 안에서 재사용할 보조 탐색이 있을 때만 표시한다.

### 2.2 모바일·PWA

- 상단: 뒤로가기/브랜드, 짧은 제목, 검색, 계정.
- 하단 5개: `홈`, `플레이어`, `경기`, `대회`, `메뉴`.
- 구인·랭킹·팀 도구·미디어·도움말·설치는 `메뉴` sheet와 전역 검색에서 접근한다.
- 표는 축소하지 않고 핵심 필드 카드/행으로 바꾸며 상세는 full-screen sheet 또는 같은 canonical 상세 URL을 사용한다.
- 입력 화면은 safe-area sticky CTA, 44px 터치 대상, 키보드·screen reader·reduced-motion을 지원한다.
- 화면 너비만으로 `/app/**`로 강제 이동하지 않는다.

### 2.3 canonical 영역

| 영역 | 대표 canonical URL | 포함 기능 |
|---|---|---|
| 홈·빠른 시작 | `/`, `/start` | 최근 현황, 개인 요약, 결과/증거 제출 시작 |
| 계정 | `/account`, `/account/riot`, `/account/discipline` | 상태, 플레이어, 비밀번호, Riot, 징계 과제 |
| 플레이어 | `/players`, `/players/[playerId]` | 검색, 프로필, 시즌/솔랭 탭 |
| 경기·랭킹 | `/matches`, `/rankings`, `/rankings/mmr` | 경기, 결과 제출, 통계, 랭킹, MMR |
| 팀 도구 | `/tools/team-balance`, `/tools/random-team`, `/tools/coin-toss` | 팀 계산, draft, 추천, 추첨 |
| 대회·신청 | `/competitions`, `/applications` | 시즌 참가, 이벤트전, 멸망전 전 단계 |
| 구인 | `/recruits` | 공개 구인 현황 |
| 미디어 | `/highlights`, `/images` | 영상·갤러리 |
| 도움말·설치 | `/help/kakao`, `/help/recruits`, `/help/riot`, `/install` | 연동 안내, 명령 도움말, PWA/APK |
| 정책 | `/terms`, `/privacy` | 약관·개인정보 |

73개 V1 경로는 query/tab을 제외한 **V2 target route template 38개**로 수렴한다. 이 가운데 사용자 canonical은 37개이고, V1에서 사용자 namespace에 놓였던 실시간 경매 화면 1개만 관리자 canonical로 이동한다.

| target 구분 | 수량 | route template |
|---|---:|---|
| 홈·계정 | 6 | `/`, `/start`, `/account`, `/account/password`, `/account/riot`, `/account/discipline` |
| 인증·정책·도움말·설치 | 9 | `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`, `/help/kakao`, `/help/recruits`, `/help/riot`, `/install` |
| 플레이어·경기·랭킹 | 7 | `/players`, `/players/[playerId]`, `/matches`, `/matches/[matchId]`, `/matches/submit`, `/rankings`, `/rankings/mmr` |
| 팀 도구 | 5 | `/tools/team-balance`, `/tools/team-balance/drafts`, `/tools/team-balance/drafts/[draftId]`, `/tools/random-team`, `/tools/coin-toss` |
| 대회·신청 | 4 | `/applications`, `/competitions`, `/competitions/events/[eventId]`, `/competitions/destruction/[tournamentId]` |
| 구인·징계·미디어 | 6 | `/recruits`, `/discipline`, `/highlights`, `/highlights/[highlightId]`, `/images`, `/images/[imageId]` |
| 관리자 이동 | 1 | `/admin/progress/destruction/[tournamentId]` |
| **합계** | **38** | **사용자 37 + 관리자 1** |

## 3. V1 73개 사용자 경로 전환표

`권한`은 화면의 핵심 기능 기준이다. 공개 화면 안에서 로그인한 본인 정보만 추가하는 경우 `PUBLIC + SESSION`으로 표시한다.

### 3.1 홈·계정·MMR (6/73)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 001 | `/` | 유지 | 반응형 사용자 홈. 공개 현황과 로그인 본인 요약 | PUBLIC + SESSION | S00 |
| 002 | `/account` | 유지 | 계정 상태·연결 플레이어·징계 과제의 기본 탭 | SESSION | S01/S02/S11 |
| 003 | `/account/password` | 유지 | 현재 비밀번호 확인 후 변경·세션 폐기 | SESSION | S01 |
| 004 | `/account/tier` | 통합 | `/account?tab=player`; 연결 플레이어·티어 편집 | APPROVED+OWNER | S02 |
| 005 | `/ai-balance` | 통합 | `/rankings/mmr`; 공개 MMR 요약 | PUBLIC+GATE | S05 |
| 006 | `/ai-balance/players` | 통합 | `/rankings/mmr?view=players`; 선수별 공개 MMR | PUBLIC+GATE | S05 |

### 3.2 모바일 복제 트리 (17/73, 누계 23)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 007 | `/app` | redirect | `/`; `source=pwa` 등 허용 query 보존 | PUBLIC + SESSION | S14 |
| 008 | `/app/account` | redirect | `/account` | SESSION | S14 |
| 009 | `/app/coin-toss` | redirect | `/tools/coin-toss` | PUBLIC | S14 |
| 010 | `/app/install` | redirect | `/install` | PUBLIC | S14 |
| 011 | `/app/login` | redirect | `/login`; 내부 `next`를 canonical로 변환 | PUBLIC | S14 |
| 012 | `/app/matches` | redirect | `/matches`; `tab`, 기간 filter allowlist 보존 | PUBLIC | S14 |
| 013 | `/app/matches/[matchId]` | redirect | `/matches/[matchId]`; ID 보존 | PUBLIC | S14 |
| 014 | `/app/me` | redirect | `/account` | SESSION | S14 |
| 015 | `/app/me/riot` | redirect | `/account/riot` | APPROVED+OWNER | S14 |
| 016 | `/app/players` | redirect | `/players`; 검색 query 보존 | PUBLIC | S14 |
| 017 | `/app/players/[playerId]` | redirect | `/players/[playerId]` | PUBLIC | S14 |
| 018 | `/app/progress/destruction/[tournamentId]` | redirect | `/competitions/destruction/[tournamentId]` | PUBLIC | S14 |
| 019 | `/app/progress/destruction/[tournamentId]/mvp-vote` | redirect | `/competitions/destruction/[tournamentId]?tab=mvp` | APPROVED | S14 |
| 020 | `/app/progress/event/[eventId]` | redirect | `/competitions/events/[eventId]` | PUBLIC | S14 |
| 021 | `/app/random-team` | redirect | `/tools/random-team` | PUBLIC | S14 |
| 022 | `/app/rankings` | redirect | `/rankings` | PUBLIC + SESSION | S14 |
| 023 | `/app/recruits` | redirect | `/recruits` | PUBLIC | S14 |

### 3.3 도구·징계·인증·미디어·도움말 (18/73, 누계 41)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 024 | `/balance` | redirect | `/tools/team-balance`; 기존 별칭 | APPROVED | S06 |
| 025 | `/coin-toss` | redirect | `/tools/coin-toss` | PUBLIC | S06 |
| 026 | `/destruction-auction-live/[tournamentId]` | redirect | `/admin/progress/destruction/[tournamentId]?tab=auction&mode=live`; 사용자 셸 밖 관리자 기능 | ADMIN | S08/S14 |
| 027 | `/discipline` | 유지 | 익명화된 징계 현황·정책·통계 | PUBLIC | S11 |
| 028 | `/discipline/evidence` | 통합 | `/account/discipline`; 내 과제·여러 장 업로드·이어하기 | APPROVED+OWNER | S11 |
| 029 | `/forgot-password` | 유지 | 존재 여부를 숨긴 관리자 초기화 요청 | PUBLIC | S01 |
| 030 | `/highlights` | 유지 | 게시 영상 목록 | PUBLIC | S10 |
| 031 | `/highlights/[highlightId]` | 유지 | 게시 영상 상세·404 | PUBLIC | S10 |
| 032 | `/images` | 유지 | 공개 갤러리 목록 | PUBLIC | S10 |
| 033 | `/images/[imageId]` | 유지 | 공개 갤러리 상세·404 | PUBLIC | S10 |
| 034 | `/install` | 유지 | Android APK/PWA/iOS 설치 안내·release 상태 | PUBLIC | S14 |
| 035 | `/kakao` | 통합 | `/help/kakao`; 실제 활성 명령과 공개 검색 안내 | PUBLIC | S09 |
| 036 | `/login` | 유지 | 비밀번호 로그인, 안전한 내부 `next` | PUBLIC | S01 |
| 037 | `/matches` | 유지 | 경기 목록·시즌/기간/filter | PUBLIC | S04 |
| 038 | `/matches/[matchId]` | 유지 | 시리즈·세트·참가자·MVP 상세·404 | PUBLIC | S04 |
| 039 | `/matches/submit` | 유지 | 내 결과 제출 생성·이미지·이어하기 | APPROVED+OWNER | S04 |
| 040 | `/me/player` | redirect | `/account?tab=player` | APPROVED+OWNER | S02 |
| 041 | `/me/riot` | redirect | `/account/riot` | APPROVED+OWNER | S12 |

### 3.4 참가 신청 (7/73, 누계 48)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 042 | `/participation` | redirect | `/applications`; 시즌·이벤트·멸망전 신청 허브 | PUBLIC + APPROVED actions | S03 |
| 043 | `/participation/destruction/[tournamentId]` | redirect | `/competitions/destruction/[tournamentId]?action=apply` | PUBLIC + APPROVED actions | S08 |
| 044 | `/participation/destruction/[tournamentId]/captain-points` | 통합 | `/competitions/destruction/[tournamentId]?tab=captain-points` | PUBLIC | S08 |
| 045 | `/participation/destruction/[tournamentId]/participants` | 통합 | `/competitions/destruction/[tournamentId]?tab=participants` | PUBLIC | S08 |
| 046 | `/participation/destruction/[tournamentId]/participants/[playerId]` | 통합 | 같은 참가자 탭의 `player=[playerId]` 상세 drawer/deep link | PUBLIC | S08 |
| 047 | `/participation/event/[eventId]` | redirect | `/competitions/events/[eventId]?action=apply` | PUBLIC + APPROVED actions | S07 |
| 048 | `/participation/season` | 통합 | `/applications?type=season`; 오늘 신청·수정·취소 | PUBLIC + APPROVED+OWNER | S03 |

### 3.5 플레이어·팀 도구 (8/73, 누계 56)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 049 | `/players` | 유지 | 플레이어 검색·filter·pagination | PUBLIC | S02 |
| 050 | `/players/[playerId]` | 유지 | 시즌 전적·포지션·챔피언·최근 경기 프로필 | PUBLIC | S02/S05 |
| 051 | `/players/[playerId]/riot` | 통합 | `/players/[playerId]?tab=riot`; 공개 Riot 요약 | PUBLIC | S12 |
| 052 | `/players/balance` | redirect | `/tools/team-balance` | APPROVED+GATE | S06 |
| 053 | `/players/balance/drafts` | redirect | `/tools/team-balance/drafts` | APPROVED+GATE | S06 |
| 054 | `/players/balance/drafts/[draftId]` | redirect | `/tools/team-balance/drafts/[draftId]` | APPROVED+GATE | S06 |
| 055 | `/players/balance/drafts/[draftId]/recommendations` | redirect | `/tools/team-balance/drafts/[draftId]?tab=recommendations` | APPROVED+GATE | S06 |
| 056 | `/players/balance/recommendations` | redirect | `/tools/team-balance/drafts?view=recommendations`; `draftId`, `team` allowlist 보존 | APPROVED+GATE | S06 |

### 3.6 정책·대회 진행 (9/73, 누계 65)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 057 | `/privacy` | 유지 | 개인정보 처리 목적·보존·권리·쿠키·연동 | PUBLIC | S01 |
| 058 | `/progress` | 통합 | `/competitions`; 이벤트전·멸망전 통합 목록 | PUBLIC | S07/S08 |
| 059 | `/progress/destruction` | 통합 | `/competitions?type=destruction` saved view | PUBLIC | S08 |
| 060 | `/progress/destruction/[tournamentId]` | 통합 | `/competitions/destruction/[tournamentId]`; 단계형 상세 | PUBLIC | S08 |
| 061 | `/progress/destruction/[tournamentId]/images` | 통합 | 상세의 `gallery` 탭 | PUBLIC | S08/S10 |
| 062 | `/progress/destruction/[tournamentId]/images/[imageIndex]` | 통합 | gallery lightbox/deep link, index 검증 | PUBLIC | S08/S10 |
| 063 | `/progress/destruction/[tournamentId]/mvp-vote` | 통합 | 상세의 `mvp` 탭 | APPROVED | S08 |
| 064 | `/progress/event` | 통합 | `/competitions?type=event` saved view | PUBLIC | S07 |
| 065 | `/progress/event/[eventId]` | 통합 | `/competitions/events/[eventId]`; 모집·팀·대진·결과 | PUBLIC | S07 |

### 3.7 기타 사용자 진입 (8/73, 누계 73)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 | 순서 |
|---:|---|---|---|---|---:|
| 066 | `/random-team` | redirect | `/tools/random-team` | PUBLIC | S06 |
| 067 | `/rankings` | 유지 | 시즌 랭킹·내 순위 | PUBLIC + SESSION | S05 |
| 068 | `/recruit` | redirect | `/recruits`; 공개 구인 현황 | PUBLIC | S09 |
| 069 | `/recruit-helper` | 통합 | `/help/recruits`; 명령·양식·상태별 안내 | PUBLIC | S09 |
| 070 | `/riot-api` | 통합 | `/help/riot`; 기능 상태·개인정보·연결 안내 | PUBLIC | S12 |
| 071 | `/signup` | 유지 | 약관·개인정보 동의 가입 | PUBLIC | S01 |
| 072 | `/start` | 유지 | 결과·증거·관리자 등록을 역할별 안내 | PUBLIC + SESSION | S00/S04/S11 |
| 073 | `/terms` | 유지 | 이용약관·승인·연동·제한 정책 | PUBLIC | S01 |

### 3.8 수량 대조

| 판정 | 수량 |
|---|---:|
| 유지 | 21 |
| 통합 | 20 |
| redirect | 32 |
| 폐기 | 0 |
| **합계** | **73** |

## 4. 경로 호환과 redirect 계약

1. GET/HEAD 화면만 308 redirect한다. mutating API는 redirect하지 않고 application service를 호출하는 호환 adapter를 사용한다.
2. `[playerId]`, `[matchId]`, `[eventId]`, `[tournamentId]`, `[draftId]`, `[imageIndex]`는 양의 정수로 검증한 뒤 그대로 전달한다.
3. 허용 query를 route별 allowlist한다. 예: 검색어, 페이지, 시즌, 기간, 탭, 팀(`RED|BLUE`).
4. `next`는 한 개의 `/`로 시작하는 내부 경로만 허용한다. `//`, `\\`, percent-decoded backslash, scheme, userinfo, control character는 기본 화면으로 치환한다.
5. fragment는 서버에 전달되지 않으므로 클라이언트 상태의 유일한 근거로 사용하지 않는다.
6. redirect loop, 두 번 encode/decode, 동적 ID 손실, 권한 상승을 계약 테스트로 확인한다.
7. 기존 URL 접근 로그를 개인정보 없는 집계로 확인하고 한 릴리스 이상 0일 때만 호환 경로 종료를 제안한다.

## 5. 구현 순서와 사용자 수용 기준

### S00 기반

- 단일 responsive shell, skip link, 전역 navigation/search, 공통 loading/error/not-found를 만든다.
- `/`와 `/players` 합성 fixture는 repository port를 통해서만 읽는다.
- 320/375/768/820/1024/1440px, 키보드, screen reader 이름, reduced-motion을 확인한다.

### S01 인증·권한

- 신규 플레이어 가입 → 즉시 APPROVED 로그인, 기존 플레이어 claim → PENDING 로그인 → 수동 승인, REJECTED 안내를 실제 DB 세션으로 검수한다.
- 비밀번호 변경, 로그아웃, `authVersion` 철회, 삭제 계정, rate limit, 외부 `next`를 검수한다.
- 관리자와 일반 사용자 세션은 같은 계정 상태 원본을 쓰되 관리자 TOTP assurance를 별도로 요구한다.

### S02 플레이어 등록부

- 공개 검색·목록·상세, 중복 Riot ID, 비활성 플레이어, 내 프로필 수정, 404/빈 결과를 검수한다.
- 공개 응답에서 실명·계정·Discord·내부 보정 정보가 0건임을 schema/contract test로 확인한다.

### S03 시즌·참가

- 활성 시즌 없음/있음, 신청 생성·수정(upsert)·본인 취소, 타인 취소 거부, reserve/rejected 표시를 검수한다.
- 사이트와 Kakao source가 섞여도 같은 사람·날짜·회차 중복 규칙이 깨지지 않아야 한다.

### S04 경기·결과

- 목록/filter/detail/404, 다중 세트와 MVP, 제출 생성·이어하기·이미지 순서·중복·소유권·검토 상태를 검수한다.
- private 이미지가 공개 URL·로그·trace·HTML에 노출되지 않아야 한다.

### S05 통계·랭킹

- 원본 경기 합계와 projection을 대조하고 동점·최소 경기 수·시즌 변경·내 순위·빈 시즌을 검수한다.
- MMR 공개값과 내부 학습/보정 데이터를 DTO 수준에서 분리한다.

### S06 팀 도구

- 10명 이하/초과, 중복 선수, 포지션 부족, 재계산, draft 저장·복원, 추천, 솔랭 cache 실패를 검수한다.
- 랜덤 팀/코인토스는 seed 가능한 단위 테스트와 사용자용 재실행 상태를 제공한다.

### S07 이벤트전

- 모집 전/중/후 신청, 팀 편성, bracket, 결과, 완료까지 상태 전이와 잘못된 순서의 409를 검수한다.
- 공개 화면은 관리자 mutation control을 렌더링하거나 호출할 수 없어야 한다.

### S08 멸망전

- 신청, 자동 예비, 주장/포인트, 경매 invariant, 예선 형식, 본선, 교체, MVP 1인 1표/재투표, gallery, 완료를 검수한다.
- `/destruction-auction-live` 익명/USER 접근은 로그인/403으로 끝나고 경매 데이터 mutation은 관리자 API만 허용한다.

### S09 구인·Kakao

- 공개 현황과 bot command를 분리하고 create/update/join/finish/reset 재전송이 중복 행을 만들지 않게 한다.
- 잘못된 HMAC, 만료 timestamp, 허용되지 않은 방/발신자, bot 자체 메시지, 외부 장애를 fixture로 검수한다.

### S10 미디어

- 게시/비게시, 정렬, 외부 썸네일 실패, gallery 다중 이미지, home 노출을 검수한다.
- 사용자 페이지는 게시된 자산만 읽고 관리자 쓰기는 별도 namespace를 사용한다.

### S11 징계

- 익명 통계는 identity를 노출하지 않는다. 본인 과제, 필요한 장수, 부분 업로드, 이어하기, 보완, 승인, 기한을 검수한다.
- task code를 알아도 다른 계정은 403/404 동일 외형으로 원본 존재를 추론하지 못한다.

### S12 Riot

- 미연결, 직접 연결, RSO state 1회성, 잘못된 callback, 본인/타인, cooldown, 429, timeout, partial sync, unlink를 fake adapter로 검수한다.
- production API 미승인 상태에서는 기능 잠금과 안내만 제공한다.

### S13 운영·AI

- 공개 site settings allowlist, 최소 health, AI feature gate/hard-disable, role scope, 비용·rate limit을 검수한다.
- job·bot·관리자 API가 사용자 브라우저 세션만으로 호출되지 않아야 한다.

### S14 PWA·호환·이관

- 32개 redirect와 20개 통합 경로의 ID/query/권한을 전수 검수한다.
- manifest start/shortcut, install prompt, static-only service worker cache, APK checksum/signature 상태를 검수한다.
- V1 읽기 전용 추출 → V2 적재 → row/count/hash/도메인 invariant 대조 후에만 전환 후보로 판정한다.

## 6. 역할·상태 E2E 매트릭스

| 시나리오 | 익명 | PENDING/REJECTED | APPROVED 본인 | APPROVED 타인 | ADMIN TOTP | BOT/JOB |
|---|---:|---:|---:|---:|---:|---:|
| 공개 목록·상세 | ✓ 안전 DTO | ✓ | ✓ | ✓ | ✓ | 해당 없음 |
| `/account` | 로그인 이동 | ✓ 상태만 | ✓ | 본인만 | 본인 계정 | 해당 없음 |
| 참가·팀 계산 | 401/로그인 | 403 | ✓ | 본인 신청만 | 정책상 ✓ | 해당 없음 |
| 결과/증거 제출 | 401/로그인 | 403 | ✓ owner | 403/404 | 검토용 별도 API | 해당 없음 |
| Riot 본인 연결 | 401 | 403 | ✓ | 403 | 관리자 별도 API | 해당 없음 |
| 공개 namespace 관리자 mutation | 401/403 | 403 | 403 | 403 | 호환 adapter만 | 해당 없음 |
| Kakao webhook | 401 | 401 | 401 | 401 | 401 | 유효 서명만 ✓ |
| Cron/job | 401 | 401 | 401 | 401 | UI에서 실행 시 별도 SUPER command | 유효 서명만 ✓ |
| private asset 원본 | 404/403 | 404/403 | owner 목적만 | 404/403 | 목적 정책 | 업로드 adapter만 |

각 canonical 페이지는 허용 역할의 ready·empty·error와 최소 한 개의 거부 역할을 E2E로 실행한다. 각 mutation은 UI가 숨겨져 있어도 직접 API 요청으로 401/403/409를 검증한다.

## 7. PWA·모바일 검수 매트릭스

| 항목 | 수용 기준 |
|---|---|
| canonical | 같은 작업이 데스크톱·모바일에서 같은 URL/데이터를 사용 |
| navigation | mobile bottom nav 5개, menu sheet, focus trap·ESC·뒤로가기 |
| safe area | iOS/Android 상하단 inset에서 CTA·내용 가림 없음 |
| form | 키보드가 열려도 현재 필드·오류·제출 버튼 접근 가능 |
| table | 가로 축소 대신 우선순위 카드/행, 전체 값은 상세에서 접근 |
| offline | icon/manifest만 cache; 개인 HTML/API/private asset cache 0 |
| install | installable/non-installable/iOS/APK unavailable 상태 각각 안내 |
| compatibility | `/app/**` 17개가 canonical로 한 번만 이동, query/ID 보존 |

## 8. 완료 판정

사용자 영역은 다음 수치가 모두 0일 때만 기능 동등성 완료로 판정한다.

- 미분류 V1 사용자 페이지 또는 Route Handler
- 소유 application service가 없는 사용자 mutation
- 공개 DTO의 금지 필드
- 본인이 아닌 제출·신청·플레이어·private asset 접근 성공
- 모바일/데스크톱 기능 차이 또는 `/app` redirect loop
- loading/empty/error/권한 상태가 없는 canonical 화면
- 실제 외부 서비스/운영 credential에 의존하는 자동 테스트
- 실패하거나 실행 증거가 없는 route·role·viewport E2E 행
- V1 source count와 V2 이관 count/hash/domain invariant 불일치

## 9. 주요 근거

- `docs/feature-catalog/USER_INVENTORY.md`
- `src/app/(user)/**/page.tsx`
- `src/app/app/**/page.tsx`
- `src/components/UserSidebar.tsx`
- `src/components/UserMobileNav.tsx`
- `src/components/app-mobile/AppBottomNav.tsx`
- `src/lib/navigation/catalog.ts`
- `src/lib/navigation/mobile-app-route.ts`
- `public/manifest.json`, `public/sw.js`
- `src/proxy.ts`, `src/lib/auth/**`, `src/lib/security/**`
