# V2 관리자 정보 구조와 V1 81개 경로 전환표

## 1. 목적과 적용 원칙

이 문서는 `ADMIN_INVENTORY.md`에서 확인한 V1 관리자 화면 81개를 V2의 보편적인 작업 공간 구조로 재편하는 설계다. 목표는 **기능을 하나도 잃지 않으면서 탐색 단계와 중복 화면을 줄이는 것**이다.

- 기준 Git ref: V1 `origin/main` = `3e6a9f1a28fb01c91f4b4c00b7ea02a77d45295a`
- 기준 수량: V1 관리자 `page.tsx` 81개
- 인증 원칙: 로그인이나 TOTP를 우회하지 않는다. 격리된 테스트 DB의 합성 계정으로 실제 인증 흐름을 통과한다.
- 권한 원칙: 메뉴를 숨기는 것만으로 권한을 구현하지 않는다. 페이지, application service, mutation API가 같은 서버 정책을 사용한다.
- 호환 원칙: V1 URL의 query, 동적 ID, 안전한 `next` 값을 보존한다. redirect loop와 외부 URL redirect는 허용하지 않는다.
- 화면 원칙: 목록·상세·생성 페이지를 무조건 나누지 않는다. 같은 업무 맥락이면 탭, 분할 보기, drawer, dialog로 통합한다.
- 완료 원칙: 아래 전환표가 `81/81`이고 각 대상 화면의 정상·빈 상태·오류·403/404·mutation 상태가 검수되기 전에는 V1 경로를 제거하지 않는다.

### 판정 용어

| 판정 | 의미 | V1 URL 처리 |
|---|---|---|
| **유지** | URL과 고유 업무를 V2의 정식 화면으로 유지 | 같은 경로를 canonical로 사용 |
| **통합** | 기능은 전부 보존하되 상위 화면의 탭·패널·dialog로 합침 | 이관 기간에는 대상 canonical로 redirect하고 상태를 query로 보존 |
| **redirect** | 원래부터 별칭이거나 고유 기능이 없는 호환 경로 | 서버 308, 동적 ID와 허용 query 보존 |
| **폐기** | 런타임 화면으로 유지할 이유가 없는 중복/정적 화면 | 한 버전 동안 안내 redirect 후 접근 로그가 0이면 410; 기능/문서는 명시된 위치에 보존 |

`통합`과 `폐기`는 기능 삭제를 뜻하지 않는다. `통합`은 동일 화면 안으로 이동하는 것이고, `폐기`는 고유 기능이 없는 **경로만** 수명 종료하는 것이다.

## 2. V2 관리자 셸

### 2.1 데스크톱

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ K-LOL.GG Admin  / 현재 작업 경로  [전체 검색 ⌘K] [빠른 작업 +] [알림] [계정] │
├──────────────────┬───────────────────────────────────────────────────────┤
│ 고정/최근 작업    │ 페이지 제목 · 설명                 상태/권한 배지       │
│                  │ 검색 · 필터 · 기간 · 보기 설정      주요 CTA            │
│ 1. 홈             ├───────────────────────────────────────────────────────┤
│ 2. 인물·계정      │                                                       │
│ 3. 시즌·참가      │                 작업 콘텐츠                           │
│ 4. 경기·결과      │       목록 ↔ 상세 분할 보기 / 탭 / drawer              │
│ 5. 팀·AI          │                                                       │
│ 6. 대회           │                                                       │
│ 7. 커뮤니티       │                                                       │
│ 8. 콘텐츠·자료    │                                                       │
│ 9. 연동           │                                                       │
│ 10. 운영·감사     │                                                       │
└──────────────────┴───────────────────────────────────────────────────────┘
```

상단바는 전역 맥락만 담당한다.

- 브랜드/운영 환경 배지: `LOCAL`, `TEST`, `PREVIEW`, `PRODUCTION`을 색과 글자로 함께 표시한다.
- breadcrumb: 현재 작업 공간과 대상 이름을 표시하고 이전 목록으로 돌아갈 수 있다.
- 전체 검색/명령 팔레트: 플레이어, 계정, 경기, 시즌, 대회의 **허용된 결과만** 검색한다.
- 빠른 작업: 플레이어 등록, 경기 등록, 이벤트 생성 등 권한에 맞는 작업만 노출한다.
- 알림: 검토 대기, 실패한 동기화, 충돌 작업을 모으되 각 원본 화면으로 deep link한다.
- 계정 메뉴: 역할, TOTP 상태, 보안 설정, 로그아웃을 제공한다.

사이드바는 10개 작업 공간만 1차 항목으로 둔다. 현재 공간의 탭/필터는 콘텐츠 헤더에 둔다. 접을 수 있는 사이드바에는 아이콘과 현재 위치 tooltip을 남기며, badge는 실제 조치가 필요한 대기 건수에만 사용한다. `SUPER` 전용 공간/작업은 ADMIN에게 비활성 메뉴로 보여주지 않고, 직접 URL은 서버가 403으로 거부한다.

### 2.2 모바일과 태블릿

- 상단: 뒤로가기, 짧은 페이지명, 검색, 계정만 유지한다.
- 하단 4개: `홈`, `작업`, `검색`, `메뉴`를 고정한다. 10개 작업 공간은 `메뉴` sheet 안에서 최근/전체로 나눈다.
- `작업`은 모바일에서 가능한 빠른 등록·승인만 보여준다. 위험한 일괄 작업은 작은 화면에서도 확인 문구와 현재 대상 수를 요구한다.
- 목록은 넓은 표를 축소하지 않고 우선순위 필드가 있는 카드/행으로 바꾼다. 상세는 같은 URL의 full-screen sheet로 연다.
- 필터는 bottom sheet, 주요 저장 CTA는 safe-area를 고려한 sticky footer, 보조 동작은 overflow menu를 사용한다.
- 마우스 hover에만 의존하지 않고 44px 이상의 터치 대상, 키보드 탐색, focus-visible, reduced-motion을 보장한다.

### 2.3 공통 페이지 구성

각 작업 화면은 가능한 한 같은 순서를 쓴다.

1. 제목, 한 문장 설명, 환경/상태/권한 배지
2. 대표 KPI 또는 현재 단계(필요할 때만)
3. 검색·필터·저장된 보기
4. 주 작업 목록 또는 편집 영역
5. 선택한 대상의 상세/이력/연관 자료
6. 위험 작업 확인과 결과 요약

모든 비-redirect 화면에는 `loading`, `ready`, `empty`, `forbidden/not-found`, `error/retry` 상태가 있어야 한다. mutation은 `idle → confirming → submitting → success | field-error | conflict | server-error`를 공통 계약으로 사용한다.

## 3. 10개 작업 공간

| # | 사이드바 이름 | 대표 경로 | 포함 기능 | 기본 권한 |
|---:|---|---|---|---|
| 1 | 홈 | `/admin` | KPI, 검토 대기, 시스템 상태, 최근 활동, 빠른 작업 | ADMIN, 일부 SUPER |
| 2 | 인물·계정 | `/admin/players`, `/admin/users` | 플레이어 CRUD, 계정 승인·역할·보안, 개인 MMR/Riot 탭 | ADMIN, 민감 작업 SUPER |
| 3 | 시즌·참가 | `/admin/seasons` | 시즌 수명주기, 참가 신청 검토 | ADMIN |
| 4 | 경기·결과 | `/admin/matches` | 경기 CRUD, 결과 접수, 증거, 경기별 AI 리뷰 | ADMIN |
| 5 | 팀·AI | `/admin/balance`, `/admin/balance-ai` | 팀 구성, draft, MMR 프로필·리뷰·재계산 | ADMIN |
| 6 | 대회 | `/admin/progress/event`, `/admin/progress/destruction` | 이벤트전과 멸망전의 전 수명주기 | ADMIN |
| 7 | 커뮤니티 | `/admin/kakao`, `/admin/operation-forms` | 구인, 스크림, Kakao, 운영 신청 | ADMIN, 자동화/초기화 SUPER |
| 8 | 콘텐츠·자료 | `/admin/champions`, `/admin/highlights`, `/admin/images`, `/admin/private-assets` | 챔피언·영상·갤러리·권한 기반 비공개 자료 | ADMIN, 자료 목적별 제한/SUPER |
| 9 | 연동 | `/admin/riot` | Riot 계정 연결, 동기화, 로그, 운영 상태 | ADMIN, 일괄 연결/전체 동기화 SUPER |
| 10 | 운영·감사 | `/admin/discipline`, `/admin/logs`, `/admin/site-settings` | 징계, 감사, AI 요청, 설정, 백업·정비 | ADMIN, 감사·설정·백업 SUPER |

`/admin/login`과 `/admin/security`는 업무 공간이 아니라 관리자 셸 앞의 인증 진입점이다.

## 4. 권한 표시와 행동 계약

- 페이지 헤더: 현재 세션 역할을 `ADMIN` 또는 `SUPER` 텍스트 배지로 표시한다.
- 위험 버튼: `SUPER` 전용이면 버튼에 작은 `SUPER` 배지와 제한 이유를 함께 둔다. ADMIN에게는 업무 이해에 필요한 읽기 데이터만 노출하고 민감 값은 응답 DTO에서 제거한다.
- 대상별 제약: ADMIN은 일반 사용자 승인/거절만, SUPER는 허용된 관리자 대상까지 처리한다. SUPER_ADMIN 대상의 역할 변경·삭제는 누구에게도 허용하지 않는다.
- 비공개 자료: ADMIN은 허용 목적만, SUPER는 정책상 전체를 볼 수 있다. 403/404 응답은 자료 존재 여부를 유추할 수 없게 동일한 외형을 쓴다.
- 일괄/복구/삭제/재계산/동기화: 대상 수와 영향 범위를 확인하고 idempotency, 중복 클릭 방지, 감사 로그를 적용한다.
- 읽기와 쓰기 권한을 각각 서버에서 판단한다. `MIXED` 화면의 SUPER action은 UI를 조작해 호출해도 API가 403을 반환해야 한다.

## 5. V1 81개 경로 전환표

아래 표의 `V2 위치`는 사용자가 도착하는 canonical 화면 또는 통합된 탭/행동이다. `권한`은 화면을 여는 최소 권한이며 괄호 안은 제한된 작업 권한이다.

### 5.1 인증·홈·운영 (8/81)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 001 | `/admin/login` | 유지 | 실제 비밀번호 → TOTP 2단계 로그인, 안전한 `next` 보존 | PUBLIC |
| 002 | `/admin/security` | 유지 | TOTP 등록·상태·해제와 재로그인 안내 | ENROLL / ADMIN |
| 003 | `/admin` | 유지 | 10개 공간의 운영 홈, KPI·대기 업무·시스템 상태 | ADMIN (재계산 SUPER) |
| 004 | `/admin/site-settings` | 유지 | 운영·감사 공간의 설정 화면. 기능 플래그와 브랜드/운영 설정 | SUPER |
| 005 | `/admin/ai-requests` | 통합 | `/admin/logs?view=ai-requests` 탭, 검색·필터·페이지 유지 | SUPER |
| 006 | `/admin/logs` | 유지 | 운영·감사의 감사 이벤트 기본 탭 | SUPER |
| 007 | `/admin/logs/stats` | 통합 | `/admin/logs?view=stats` 통계 탭 | SUPER |
| 008 | `/admin/logs/kakao` | redirect | `/admin/kakao?tab=logs`; 허용된 기간·상태 query 보존 | ADMIN |

### 5.2 인물·계정·징계 (13/81, 누계 21)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 009 | `/admin/players` | 유지 | 인물·계정의 플레이어 목록, 검색·필터·선택 상세 | ADMIN |
| 010 | `/admin/players/new` | 유지 | 플레이어 등록 full page/dialog, 중복 검사 유지 | ADMIN |
| 011 | `/admin/players/[playerId]` | 유지 | 프로필·연결 계정·활동 이력을 묶은 상세 | ADMIN (역할·비밀번호·2FA SUPER) |
| 012 | `/admin/players/[playerId]/edit` | redirect | `/admin/players/[playerId]?mode=edit`, `playerId` 보존 | ADMIN |
| 013 | `/admin/players/[playerId]/balance` | 통합 | `/admin/players/[playerId]?tab=balance`, 라인별 MMR·보정 이력 | ADMIN |
| 014 | `/admin/players/[playerId]/riot` | 통합 | `/admin/players/[playerId]?tab=riot`, 연결·해제·동기화 | ADMIN (일괄 작업 SUPER) |
| 015 | `/admin/player-approvals` | redirect | `/admin/users?status=pending`; 승인 대상은 계정 업무로 단일화 | ADMIN |
| 016 | `/admin/users` | 유지 | 계정 목록, 상태·역할·승인 대기 보기 | ADMIN |
| 017 | `/admin/users/[userAccountId]` | 유지 | 계정 상세·승인/거절·복구·보안 작업 | ADMIN (역할·삭제·복구·비밀번호·2FA SUPER) |
| 018 | `/admin/discipline` | 유지 | 운영·감사의 징계 기록·접수·작업·재검토 tabs | ADMIN |
| 019 | `/admin/discipline/new` | 유지 | 대상 검색을 포함한 조치 등록 | ADMIN |
| 020 | `/admin/discipline/[id]` | 유지 | 기록 상세·증거·수정·삭제 | ADMIN (초기화 SUPER) |
| 021 | `/admin/operation-forms/warnings` | redirect | `/admin/discipline`; 과거 경고 별칭을 영구 308 | ADMIN |

### 5.3 경기·랭킹·밸런스 (15/81, 누계 36)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 022 | `/admin/matches` | 유지 | 경기·결과의 경기 목록과 필터 | ADMIN |
| 023 | `/admin/matches/new` | 유지 | 선수·세트·결과 등록 | ADMIN |
| 024 | `/admin/matches/[matchId]/edit` | 유지 | 경기 상세 편집과 충돌 처리 | ADMIN |
| 025 | `/admin/matches/submissions` | 통합 | `/admin/matches?view=submissions`, 대기→검토→반영 workflow | ADMIN |
| 026 | `/admin/matches/[matchId]/ai-review` | 통합 | `/admin/matches/[matchId]/edit?tab=ai-review`, 재분석·피드백 | ADMIN |
| 027 | `/admin/balance` | 유지 | 팀·AI의 실시간 팀 구성 작업대 | ADMIN |
| 028 | `/admin/balance/drafts` | 유지 | 저장된 draft 목록과 필터 | ADMIN |
| 029 | `/admin/balance/drafts/[draftId]` | 유지 | draft 상세·배치·AI 리뷰·피드백 | ADMIN |
| 030 | `/admin/balance/drafts/[draftId]/recommendations` | redirect | `/admin/balance/drafts/[draftId]?tab=recommendations` | ADMIN |
| 031 | `/admin/balance/recommendations` | redirect | `/admin/balance/drafts?view=recommendations` | ADMIN |
| 032 | `/admin/balance-ai` | 유지 | AI/MMR 요약과 상태 | ADMIN |
| 033 | `/admin/balance-ai/players` | 통합 | `/admin/balance-ai?tab=players`, 필터·페이지 유지 | ADMIN |
| 034 | `/admin/balance-ai/recalculate` | 통합 | `/admin/balance-ai?action=recalculate`, 영향 확인 dialog | ADMIN |
| 035 | `/admin/balance-ai/reviews` | 통합 | `/admin/balance-ai?tab=reviews`, 리뷰 목록 | ADMIN |
| 036 | `/admin/balance-ai/reviews/[reviewId]` | 통합 | `/admin/balance-ai?tab=reviews&review=[reviewId]`, 상세 drawer/deep link | ADMIN |

### 5.4 이벤트전·멸망전 (7/81, 누계 43)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 037 | `/admin/progress` | redirect | `/admin/progress/event`; 대회 작업 공간의 최근 보기로 이동 | ADMIN |
| 038 | `/admin/progress/event` | 유지 | 이벤트전 목록 | ADMIN |
| 039 | `/admin/progress/event/new` | 유지 | 이벤트전 생성 | ADMIN |
| 040 | `/admin/progress/event/[eventId]` | 유지 | 모집→참가자→팀→대진→결과→완료 단계형 작업대 | ADMIN |
| 041 | `/admin/progress/destruction` | 유지 | 멸망전 목록 | ADMIN |
| 042 | `/admin/progress/destruction/new` | 유지 | 멸망전 생성 | ADMIN |
| 043 | `/admin/progress/destruction/[tournamentId]` | 유지 | 신청→팀→경매→예선→본선→교체/MVP→완료 작업대 | ADMIN |

### 5.5 Kakao·구인·운영 신청 (20/81, 누계 63)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 044 | `/admin/kakao` | 유지 | 커뮤니티 운영 요약·설정 상태·최근 구인 | ADMIN |
| 045 | `/admin/kakao/recruits` | 통합 | `/admin/kakao?tab=recruits`, 진행 구인·이력 | ADMIN (reset·자동화 SUPER) |
| 046 | `/admin/kakao/recruits/logs` | 통합 | `/admin/kakao?tab=logs`, 필터·페이지 유지 | ADMIN |
| 047 | `/admin/kakao/recruits/settings` | 통합 | `/admin/kakao?tab=health`, 진단·복구·자동화 설정 | ADMIN (복구·reset 설정 SUPER) |
| 048 | `/admin/kakao/scrims` | 통합 | `/admin/kakao?tab=scrims`, 스크림 구인 목록 | ADMIN |
| 049 | `/admin/kakao/season-apply` | 통합 | `/admin/seasons/kakao-pending`, Kakao 자동 일치 보류를 시즌 신청으로 안전하게 연결 | ADMIN 조회, SUPER 변경 |
| 050 | `/admin/kakao/settings` | 통합 | `/admin/kakao?tab=settings` | ADMIN |
| 051 | `/admin/kakao/stats` | 통합 | `/admin/kakao?tab=stats`, 기간·상태 보존 | ADMIN |
| 052 | `/admin/kakao/operation-forms` | redirect | `/admin/operation-forms`; 중복 분류 허브 제거 | ADMIN |
| 053 | `/admin/kakao/operation-forms/friends` | redirect | `/admin/operation-forms?type=friends` | ADMIN |
| 054 | `/admin/kakao/operation-forms/leaves` | redirect | `/admin/operation-forms?type=leaves` | ADMIN |
| 055 | `/admin/kakao/operation-forms/meetups` | redirect | `/admin/operation-forms?type=meetups` | ADMIN |
| 056 | `/admin/kakao/operation-forms/suggestions` | redirect | `/admin/operation-forms?type=suggestions` | ADMIN |
| 057 | `/admin/operation-forms` | 유지 | 유형·상태·대기 건수를 한 목록에서 관리 | ADMIN |
| 058 | `/admin/operation-forms/friends` | 통합 | `/admin/operation-forms?type=friends`; 친구 신청 saved view | ADMIN |
| 059 | `/admin/operation-forms/leaves` | 통합 | `/admin/operation-forms?type=leaves`; 탈퇴 신청 saved view | ADMIN |
| 060 | `/admin/operation-forms/meetups` | 통합 | `/admin/operation-forms?type=meetups`; 모임 신청 saved view | ADMIN |
| 061 | `/admin/operation-forms/suggestions` | 통합 | `/admin/operation-forms?type=suggestions`; 건의 saved view | ADMIN |
| 062 | `/admin/operation-forms/[formType]/[id]` | 유지 | 신청 상세·상태·관리 메모·삭제 deep link | ADMIN |
| 063 | `/admin/recruits` | 폐기 | 고유 기능 없음. 한 버전 `/admin/kakao/recruits` 안내 redirect 후 410 | ADMIN |

### 5.6 콘텐츠·시즌 (10/81, 누계 73)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 064 | `/admin/champions` | 유지 | 콘텐츠·자료의 챔피언 목록 | ADMIN |
| 065 | `/admin/champions/new` | 유지 | 챔피언 등록 | ADMIN |
| 066 | `/admin/champions/[championId]/edit` | 유지 | 챔피언 편집·삭제 | ADMIN |
| 067 | `/admin/highlights` | 유지 | 하이라이트 목록 | ADMIN |
| 068 | `/admin/highlights/new` | 유지 | 영상·썸네일 등록 | ADMIN |
| 069 | `/admin/highlights/[highlightId]/edit` | 유지 | 하이라이트 편집·삭제 | ADMIN |
| 070 | `/admin/images` | 유지 | 갤러리 이미지와 홈 노출 관리 | ADMIN |
| 071 | `/admin/images/new` | 유지 | 이미지 등록 | ADMIN |
| 072 | `/admin/images/[imageId]/edit` | 유지 | 이미지 편집·삭제 | ADMIN |
| 073 | `/admin/seasons` | 유지 | 시즌 생성·편집·복제·활성·종료·삭제와 참가 신청 탭 | ADMIN |

### 5.7 Riot·비공개 자료 (8/81, 누계 81)

| ID | V1 경로 | 판정 | V2 위치/처리 | 권한 |
|---:|---|---|---|---|
| 074 | `/admin/riot` | 유지 | 연동 작업 공간의 요약·상태 | ADMIN (일부 SUPER) |
| 075 | `/admin/riot/accounts` | 통합 | `/admin/riot?tab=accounts`, 계정 필터·연결 상태 | ADMIN (추가 제어 SUPER) |
| 076 | `/admin/riot/accounts/bulk-link` | 통합 | `/admin/riot?tab=accounts&action=bulk-link`, preview→확인→결과 dialog | SUPER |
| 077 | `/admin/riot/sync` | 통합 | `/admin/riot?tab=sync`, 작업 이력·재시도 | ADMIN (전체 동기화 SUPER) |
| 078 | `/admin/riot/logs` | 통합 | `/admin/riot?tab=logs`, API·동기화·감사 필터 | ADMIN |
| 079 | `/admin/riot/application` | 폐기 | 정적 신청 문서는 `/docs/operations/riot-production-application`로 이동; 한 버전 안내 후 410 | ADMIN |
| 080 | `/admin/private-assets` | 유지 | 콘텐츠·자료의 목적·상태별 비공개 자료 목록 | ADMIN 목적별 제한 / SUPER |
| 081 | `/admin/private-assets/[id]` | 유지 | 권한 검사 뒤 스트리밍·메타데이터·연관 업무 | ADMIN 목적별 제한 / SUPER |

### 5.8 수량 대조

| 판정 | 수량 |
|---|---:|
| 유지 | 43 |
| 통합 | 24 |
| redirect | 12 |
| 폐기 | 2 |
| **합계** | **81** |

폐기 2개도 고유 기능을 잃지 않는다. `/admin/recruits`는 정식 Kakao 구인 화면과 완전히 중복되고, `/admin/riot/application`의 정적 내용은 버전 관리되는 운영 문서로 이동한다.

## 6. 주요 사용자 작업 흐름

### 6.1 관리자 로그인과 TOTP

```text
로그인 진입
  → 아이디·비밀번호 검증
  → TOTP 미등록: /admin/security 등록 전용 세션
      → status → setup → QR/설정 키 → enable → 세션 무효화 → 재로그인
  → TOTP 등록: 현재 6자리 코드 검증
  → 역할·승인 상태·authVersion 재확인
  → 안전한 next 또는 /admin
```

실패 시 비밀번호/TOTP 어느 값이 틀렸는지 계정 탐색에 악용할 상세를 노출하지 않는다. 같은 time-step의 TOTP 재사용, 철회된 `authVersion`, 미승인 관리자, 일반 사용자, 로그아웃 쿠키를 각각 거부한다.

### 6.2 플레이어 등록과 계정 연결

`인물·계정 → 플레이어 검색 → 새 플레이어 → 중복 확인 → 저장 → 상세 → 계정/Riot/MMR 탭` 순서다. 목록으로 되돌아가지 않고 상세 안에서 연관 업무를 끝낸다. 역할·비밀번호·2FA 초기화는 SUPER 확인과 감사 사유를 요구한다.

### 6.3 경기 접수 검토와 반영

`경기·결과 → 결과 접수 탭 → 대기 건 선택 → 비공개 증거 권한 확인 → 값 검증 → 반영/반려 → 경기 상세 → AI 리뷰`로 이어진다. 접수와 생성 경기 간 deep link를 유지하고, 중복 반영은 conflict로 막는다.

### 6.4 팀 밸런스와 AI 검토

`팀·AI → 팀 구성 → 선수 선택 → 제안 생성 → 수동 배치 → draft 저장 → 리뷰/추천 → 피드백` 흐름이다. 전체 재계산은 별도 페이지 대신 영향 범위와 예상 대상 수를 보여주는 확인 dialog로 제공한다.

### 6.5 시즌·대회 운영

시즌은 `생성 → 참가 신청 검토 → 활성 → 종료/복제`로 운영한다. 대회는 이벤트전과 멸망전을 분리하되 같은 단계 UI를 쓰고, 각 상세에서 현재 단계·다음 필수 작업·되돌릴 수 없는 작업을 명확히 표시한다.

### 6.6 Kakao·운영 신청

`커뮤니티 → Kakao 상태 확인 → 구인/스크림/신청 선택 → 필터된 목록 → 상세 drawer → 상태/메모 처리` 순서다. 자동 reset, 번호 reset, 안전 복구는 SUPER만 실행하며 실행 전 현재 대상을 preview한다.

### 6.7 징계와 비공개 자료

`운영·감사 → 징계 → 기록/접수/작업/재검토 → 대상 상세 → 허용 목적의 증거 조회 → 처리 → 감사 로그`로 연결한다. ADMIN에게 허용되지 않은 자료는 검색 결과, 개수, 파일명에도 나타나지 않는다.

### 6.8 Riot 연동

`연동 → 상태 → 계정 → 단일 연결/동기화 → 실패 재시도 → 로그` 흐름이다. bulk-link와 sync-all은 SUPER 전용이며 preview, 대상 수 확인, 비동기 진행률, 부분 실패 재시도를 제공한다.

### 6.9 SUPER 운영 점검

`홈 → 경고 카드 → 운영·감사 → 감사/AI 요청/설정 → 필요 시 백업·정비·재계산`으로 이동한다. 다운로드와 정비 API는 모든 실행을 감사하고, 브라우저에 비밀값이나 장기 보관 가능한 직접 스토리지 URL을 노출하지 않는다.

## 7. 점진 구현 순서와 통과 조건

각 단계는 이전 단계의 인증·권한·공통 상태 테스트를 재실행한다. V1 운영 코드는 그대로 유지하고 V2 preview 환경에서만 구현·검수한다.

| 단계 | 구현 범위 | 통과 조건 |
|---:|---|---|
| A0 | 관리자 셸, 10개 작업 공간 IA, 공통 상태/권한 컴포넌트 | desktop/mobile 키보드·터치 탐색, 403/404 경계, 환경 배지 |
| A1 | 로그인·TOTP·세션·role fixture | 실제 로그인/TOTP E2E, 재사용·미승인·철회 세션 거부, 우회 코드 0 |
| A2 | 인물·계정 | 플레이어/계정 CRUD, 대상별 ADMIN/SUPER 매트릭스, 감사 로그 |
| A3 | 시즌·참가 | 시즌 수명주기와 참가 신청 통합, 충돌/빈 상태 |
| A4 | 경기·결과 | 경기 CRUD, 접수·증거·AI 리뷰 연결, 중복 반영 방지 |
| A5 | 팀·AI | balance/draft/MMR/review/recalculate, 위험 작업 확인 |
| A6 | 대회 | 이벤트전·멸망전 전체 단계와 상태 전이 |
| A7 | 커뮤니티 | Kakao fake adapter, 구인·스크림·운영 신청, SUPER reset 정책 |
| A8 | 콘텐츠·자료·징계 | 미디어 CRUD, 비공개 자료 목적 정책, 징계 workflow |
| A9 | Riot 연동 | fake adapter에서 단일/일괄/실패 재시도, 운영 credential 미사용 |
| A10 | 운영·감사 | dashboard, 로그, AI 요청, 설정, 백업·정비 SUPER 정책 |
| A11 | 경로 전환 | 81개 mapping E2E, query/ID 보존, redirect loop 0, 접근 로그 관찰 |
| A12 | 회귀·전환 준비 | 전체 권한/상태/접근성/성능 회귀, V1과 기능 수 대조, rollback 문서 |

이 단계에서 `폐기` 후보는 바로 410으로 바꾸지 않는다. 최소 한 버전의 안내 redirect와 접근 로그를 확인하고, 북마크·운영 문서·자동화에 사용되지 않는다는 근거가 있을 때만 종료한다.

## 8. 로그인/TOTP 관리자 검수 진입점

### 8.1 격리 fixture

운영 DB·Blob·JWT/TOTP secret은 사용하지 않는다. 테스트 실행 시 일회성 DB에 아래 계정을 seed하고, 운영과 같은 해시·암호화·세션 코드를 통과시킨다.

| 계정 fixture | 기대 진입점 | 확인 목적 |
|---|---|---|
| `e2e_user_approved` | `/admin/login`으로 복귀 | 일반 사용자 관리자 접근 거부 |
| `e2e_admin_enroll` | `/admin/security?setup=required&next=...` | 실제 TOTP 등록과 재로그인 |
| `e2e_admin` | `/admin` | ADMIN 10개 공간과 제한된 action |
| `e2e_super` | `/admin` | SUPER 전용 작업과 전체 매트릭스 |
| `e2e_admin_pending` | 로그인 거부 | 승인 상태 재검증 |
| `e2e_admin_revoked` | 기존 storageState 거부 | `authVersion` 철회 확인 |

### 8.2 권장 Playwright 진입 순서

1. 일회성 DB migration과 합성 도메인 dataset을 만든다.
2. `e2e_admin_enroll`로 `/admin/login → /admin/security → setup → enable → 재로그인`을 실제 UI/API로 실행한다.
3. `e2e_admin`, `e2e_super`는 실제 `/api/admin/login`의 비밀번호 단계와 현재 TOTP 단계로 HttpOnly 쿠키를 발급받는다.
4. role별 storageState를 분리하고 trace의 Cookie/Authorization/TOTP 입력을 마스킹한다.
5. `/admin`의 sidebar에서 10개 작업 공간을 순회한다. 해당 역할이 볼 수 없는 응답 데이터가 payload에 없는지도 검사한다.
6. 전환표 001~081의 직접 URL을 role별로 실행하고 canonical, status, query/ID 보존, 정상·빈·오류 상태를 기록한다.
7. mutation은 UI 버튼과 직접 API 요청을 둘 다 실행해 ADMIN/SUPER 정책이 같은지 확인한다.
8. 로그아웃과 `authVersion` 증가 뒤 모든 기존 storageState가 거부되는지 확인한다.
9. 종료 시 storageState·trace·일회성 DB·Blob emulator를 폐기한다.

검수 convenience를 위한 인증 우회 header, 고정 관리자 cookie, TOTP 생략 환경 변수, 운영 secret 복사는 금지한다. fixture가 동작하지 않으면 우회하지 않고 인증 구현 또는 seed를 수정한다.

## 9. V2 관리자 완료 판정

다음 값이 모두 0이고 근거가 남아야 관리자 영역을 완료로 판정한다.

- 전환표에서 누락되거나 중복 집계된 V1 페이지
- 소유 application service가 없는 mutation
- 권한 없는 UI 또는 직접 API 접근 성공
- 인증/TOTP/세션을 건너뛰는 테스트 코드
- loading·empty·error·403/404 상태가 없는 비-redirect 화면
- 동적 ID 또는 허용 query를 잃는 redirect
- redirect loop 또는 열린 외부 redirect
- 감사 로그가 없는 민감 작업
- 운영 DB·Blob·자격 증명에 의존하는 E2E
- V1에서 가능했지만 V2에서 끝까지 완료할 수 없는 사용자 작업 흐름

최종 전환 증거에는 `81/81` route 결과, ADMIN/SUPER 권한 매트릭스, 모바일/데스크톱 핵심 흐름, mutation 결과, 성능·접근성 회귀, rollback 가능 버전을 함께 기록한다.
