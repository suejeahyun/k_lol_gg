# V1 사용자 기능 전수 목록과 V2 기능 계약

## 1. 조사 범위와 기준

이 문서는 V1의 **관리자 화면을 제외한 모든 화면과 `/api/admin` 밖의 모든 Route Handler**를 소스 근거로 분류한다. 공개 URL에 남아 있는 관리자 전용 mutation, Kakao 봇 webhook, Cron도 누락하지 않고 실효 행위자를 따로 표시한다.

| 기준 | Git ref / 상태 | 비관리자 `page.tsx` | `/api/admin` 밖 `route.ts` |
|---|---|---:|---:|
| 정확한 Vercel 블루·블랙 기준 | `8d4d2a491fd8647186502505054d68883a09a834` | 73 | 112 |
| 최신 원격 V1 | `origin/main` = `3e6a9f1a28fb01c91f4b4c00b7ea02a77d45295a` | 73 | 112 |
| 최신 작업 폴더 | `E:/k-LOL.GG/0.k_lol_gg`, 기존 변경을 포함한 읽기 전용 조사 | 73 | 112 |

112개 Route Handler는 `/api/**` 111개와 `/apk` 1개다. 블루·블랙 기준과 최신 원격 사이에 사용자 경로의 추가·삭제는 없다. 최신 코드는 공개 DTO 축소, 접근성, 제출 소유권, 외부 요청 보호가 강화됐으므로 V2의 기능 기준은 **블루·블랙의 기능 범위 + 최신 코드의 보안·개인정보 보호 수준**으로 잡는다.

실효 행위자 기준으로는 사용자/공개 읽기 또는 사용자 행동이 있는 Handler가 61개(그중 `/api/**` 60개 + `/apk` 1개), 공개 namespace에 남은 순수 관리자 Handler가 29개, 순수 bot/job Handler가 22개다. `61 + 29 + 22 = 112`이며 혼합 Handler의 관리자 method는 첫 번째 61개에 포함한 뒤 method 수준에서 분리했다.

관리자 전용 `page.tsx` 81개와 `/api/admin` 72개는 `ADMIN_INVENTORY.md`, `ADMIN_ROUTE_MAP.md`가 담당한다. 이 문서는 공개 namespace에 섞인 관리자 API를 중복 기록하여 V2에서 관리자 namespace로 옮길 때 빠지는 기능이 없게 한다.

### 1.1 산정 규칙

- `src/app/(user)/**/page.tsx`, `src/app/app/**/page.tsx`, 루트의 `/install`, `/destruction-auction-live`를 센다.
- `src/app/(admin)/**`와 `src/app/app/admin/**`는 화면 수에서 제외한다.
- `src/app/**/route.ts` 가운데 `src/app/api/admin/**`만 제외한다.
- `route.impl.ts`는 별도 URL이 아니므로 수량에 더하지 않되 re-export된 method는 원래 Route Handler에 포함한다.
- 같은 기능의 데스크톱·모바일 복제 화면도 V1 URL 호환 대상으로 각각 센다.

## 2. 행위자와 권한 용어

| 코드 | 행위자 | 서버 판정 기준 |
|---|---|---|
| `PUBLIC` | 익명 포함 누구나 | 공개 DTO만 반환, rate limit·입력 길이 제한 적용 |
| `SESSION` | 로그인 계정 | 삭제되지 않은 계정과 `authVersion`이 일치하는 세션 |
| `APPROVED` | 승인 사용자 | `UserStatus=APPROVED`, 연결 플레이어가 필요한 기능은 `playerId`도 확인 |
| `OWNER` | 승인 사용자 본인 | 세션 계정과 제출·플레이어·신청의 소유권이 일치 |
| `ADMIN` | TOTP 검증 관리자 | 페이지와 application service, mutation API에서 동일하게 확인 |
| `SUPER` | TOTP 검증 최고 관리자 | 감사·로그·복구 등 제한 작업 |
| `BOT` | Kakao/Discord 서버 호출 | 운영에서 필수 HMAC 또는 회전 가능한 header secret, 방·발신자 정책 |
| `JOB` | 스케줄러 | 전용 서명/secret, 브라우저 세션과 분리 |

`PENDING`과 `REJECTED` 계정은 로그인과 계정 상태 확인은 가능하지만 제출·참가·밸런스·Riot 연결은 허용하지 않는다. UI 메뉴 숨김은 편의 기능일 뿐이며 API의 서버 권한 검사를 대신하지 않는다.

## 3. 사용자 기능 영역

### 3.1 인증·계정·시작 허브 — S01/S02

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/start`, `/login`, `/signup`, `/forgot-password`, `/account`, `/account/password`, `/account/tier`, `/app/login`, `/app/account`, `/app/me` |
| 핵심 흐름 | 약관·개인정보 동의 회원가입 → 기존 Riot ID 플레이어 연결 또는 새 플레이어 생성 → `PENDING` → 관리자 승인/거절 → 로그인 → 계정·연결 플레이어·징계 과제 확인 → 비밀번호 변경 후 세션 폐기 |
| 권한·상태 | 로그인은 승인 상태와 무관하게 가능. 제출 기능은 `APPROVED`. 비밀번호 찾기는 계정 존재 여부를 같은 202 응답으로 숨기고 관리자 초기화 요청만 기록 |
| 데이터 | `UserAccount`, `Player`, `UserDisciplineRecord`, `DisciplineResolutionTask`, `AdminLog`, `RateLimitLog` |
| 중요 상태 | `PENDING`, `APPROVED`, `REJECTED`; 삭제 계정; `authVersion` 불일치; 연결 플레이어 없음 |
| V1 근거 | `src/app/(user)/start/page.tsx`, `src/app/(user)/account/**`, `src/app/app/{login,account,me}/page.tsx`, `src/app/api/auth/**`, `src/lib/auth/**` |

V2 수용 기준:

1. 회원가입 중복 아이디/Riot ID, 약관 미동의, 길이 오류, 성공 후 승인 대기를 각각 검증한다.
2. 로그인 실패 응답은 계정 존재·삭제·비밀번호 오류를 구분해 노출하지 않는다.
3. 계정 상태나 `authVersion`이 바뀌면 기존 세션은 다음 요청부터 거부된다.
4. `/account`는 ready, 연결 플레이어 없음, 징계 과제 없음, 오류 상태를 갖는다.
5. 비밀번호 변경 성공 뒤 현재·관리자 쿠키가 제거되고 재로그인을 요구한다.

### 3.2 홈·탐색·공개 설정 — S00/S13

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/`, `/app`, 전역 검색/명령 팔레트 |
| 핵심 흐름 | 최근 경기, 시즌·구인·대회 현황, 개인 요약, 갤러리, 빠른 등록 진입을 한 화면에서 탐색 |
| 데이터 | `Season`, `MatchSeries`, `PlayerSeasonStat`, `RecruitParty`, `EventMatch`, `DestructionTournament`, `GalleryImage`, 공개 site settings |
| 권한 | 공개 요약 + 로그인 시 본인 요약. 관리자/개인 필드는 공개 응답에서 제외 |
| V1 근거 | `src/app/(user)/page.impl.tsx`, `src/app/app/page.tsx`, `src/lib/home/public-data.ts`, `src/lib/app/home-summary.ts`, `src/lib/navigation/catalog.ts`, `src/components/GlobalNavigationPalette.tsx` |

V2는 별도 모바일 URL을 만들지 않고 같은 URL에서 반응형 셸을 사용한다. 전역 검색은 사용자가 접근 가능한 결과만 반환하며 공개 검색 결과에서 실명, 사용자 아이디, Discord 정보, 내부 MMR 보정 이유를 노출하지 않는다.

### 3.3 플레이어 검색·프로필·내 프로필 — S02/S05

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/players`, `/players/[playerId]`, `/me/player`, `/app/players`, `/app/players/[playerId]` |
| 핵심 흐름 | 닉네임·태그 검색 → 목록 → 시즌 전적·포지션·챔피언·최근 경기 프로필 → 로그인 본인의 표시 정보 수정 |
| 데이터 | `Player`, `Season`, `MatchParticipant`, `PlayerSeasonStat`, `PlayerChampionStat`, `PlayerPositionStat`, `SeasonResult` |
| 권한 | 목록·프로필은 `PUBLIC` 안전 DTO, 수정은 `OWNER`. 비활성 플레이어와 비공개 필드는 제외 |
| V1 근거 | `src/app/(user)/players/**`, `src/app/app/players/**`, `src/app/api/players/**`, `src/app/api/my-player/route.ts`, `src/lib/public/player.ts` |

필수 공개 DTO는 `id`, 공개 표시명/Riot ID, 허용된 티어·집계 통계로 allowlist한다. `name`, `userAccountId`, 계정 아이디, Discord 식별자, 내부 보정 사유는 공개 DTO에 포함하지 않는다.

### 3.4 경기·결과 제출 — S04

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/matches`, `/matches/[matchId]`, `/matches/submit`, `/app/matches`, `/app/matches/[matchId]` |
| 핵심 흐름 | 시즌·기간별 경기 목록 → 시리즈/세트/참가자/KDA/MVP 상세. 승인 사용자는 날짜·주최자·회차·세트 수 입력 → 제출 생성 → 게임별 이미지 업로드 → 이어하기 → 관리자 검토 |
| 데이터 | `MatchSeries`, `MatchGame`, `MatchParticipant`, `Champion`, `Season`, `InhouseResultSubmission`, `InhouseResultImage`, `PrivateAsset`, `TeamBalanceDraft`, `KakaoFormTemplate` |
| 권한·소유권 | 조회 `PUBLIC`; 웹 제출·조회·이미지 업로드 `APPROVED+OWNER`, 관리자는 검토 목적 접근 |
| 상태 | 제출 `AWAITING_UPLOAD → PENDING_REVIEW → APPROVED/REJECTED`; 이미지 `PENDING → OCR 처리 결과`; 중복 `publicCode`, 이미지 번호·해시 보호 |
| 외부 부작용 | private Blob 저장, 이미지 메타데이터/해시, 관리자 검토 후 경기 생성 |
| V1 근거 | `src/app/(user)/matches/**`, `src/app/app/matches/**`, `src/app/api/inhouse-results/**`, `src/app/api/matches/**`, `src/lib/discipline/ownership.ts` |

### 3.5 시즌 랭킹·통계·MMR — S05

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/rankings`, `/ai-balance`, `/ai-balance/players`, `/app/rankings` |
| 핵심 흐름 | 시즌 선택 → 경기 수·승률·MVP·참여 랭킹 → 내 순위 → 공개 MMR 요약·선수별 지표 |
| 데이터 | `Season`, `PlayerSeasonStat`, `PlayerChampionStat`, `PlayerPositionStat`, `SeasonResult`, `PlayerBalanceProfile`, `BalanceMatchReview`, `PlayerBalanceMatchResult` |
| 권한 | 집계는 `PUBLIC`; 내 순위는 세션이 있으면 강조. 내부 학습 메모·보정 이유·민감 AI 입력은 비공개 |
| V1 근거 | `src/app/(user)/rankings/page.tsx`, `src/app/(user)/ai-balance/**`, `src/app/api/rankings/route.ts`, `src/app/api/stats/**`, `src/lib/stats/**` |

### 3.6 팀 도구·드래프트·밴픽 — S06

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/players/balance`, `/players/balance/recommendations`, `/players/balance/drafts/**`, `/balance`, `/random-team`, `/coin-toss`, 대응 `/app` 화면 |
| 핵심 흐름 | 참가자 검색·선택 → 포지션/역할 설정 → 팀 조합 계산·비교 → draft 저장 → 솔랭 캐시 동기화 → 밴픽/조합 추천. 랜덤 팀·코인토스는 DB 없는 독립 도구 |
| 데이터 | `TeamBalanceDraft`, `TeamBalanceDraftPlayer`, `PlayerBalanceProfile`, `BalanceMatchReview`, `PlayerSoloRankSnapshot`, 시즌 참가 신청 |
| 권한 | 검색 요약은 `PUBLIC`; 계산·draft·추천은 feature gate + `APPROVED`; 관리자 피드백은 `ADMIN` |
| V1 근거 | `src/app/(user)/players/balance/**`, `src/components/team-balance/**`, `src/app/api/team-balance/**`, `src/app/api/players/balance/**` |

### 3.7 시즌 참가 — S03

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/participation`, `/participation/season` |
| 핵심 흐름 | 활성 시즌·오늘 참가자 조회 → 승인 사용자가 주·부 포지션 신청/수정(upsert) → 본인 신청 취소 |
| 데이터 | `Season`, `SeasonParticipationApply`, `SeasonParticipationPendingApply`, `Player` |
| 상태 | `APPLIED`, `CONFIRMED`, `REJECTED`, `RESERVE`, `CANCELLED`; Kakao 신청과 사이트 신청의 source를 보존 |
| 권한 | 현황 `PUBLIC`; 신청·취소 `APPROVED+OWNER` |
| V1 근거 | `src/app/(user)/participation/season/page.tsx`, `src/app/api/participation{,/season}/route.ts` |

### 3.8 이벤트전 — S07

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/progress/event`, `/progress/event/[eventId]`, `/participation/event/[eventId]`, 대응 `/app` 상세 |
| 핵심 흐름 | 이벤트 목록 → 일정·모집·참가자·팀·대진·결과 상세 → 모집 중 주·부 포지션 참가 신청 |
| 데이터 | `EventMatch`, `EventTeam`, `EventParticipant`, `EventTournamentMatch`, `EventParticipationApply`, `GalleryImage` |
| 상태 | 이벤트 `PLANNED → RECRUITING → TEAM_BUILDING → IN_PROGRESS → COMPLETED/CANCELLED`; 신청 상태는 공통 참가 상태 |
| 권한 | 조회 `PUBLIC`; 신청 `APPROVED+OWNER`; 팀·대진·결과 mutation `ADMIN` |
| V1 근거 | `src/app/(user)/progress/event/**`, `src/app/(user)/participation/event/**`, `src/app/api/event-matches/**`, `src/app/api/participation/event/**` |

### 3.9 멸망전 — S08

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/progress/destruction/**`, `/participation/destruction/**`, `/destruction-auction-live/[tournamentId]`, 대응 `/app` 상세 |
| 핵심 흐름 | 목록 → 신청/참가자 검증 → 주장 포인트 → 팀·경매 → 예선/본선 대진·순위 → 선수 교체 → 게임별 MVP 투표/재투표 → 갤러리·우승 결과 |
| 데이터 | `DestructionTournament`, `DestructionTeam`, `DestructionParticipant`, `DestructionParticipantReplacement`, `DestructionMatch`, `DestructionMatchMvpVote`, `DestructionParticipationApply`, `GalleryImage` |
| 상태 | `PLANNED → RECRUITING → TEAM_BUILDING → AUCTION → PRELIMINARY → TOURNAMENT → COMPLETED/CANCELLED`; 경매 `PENDING/DRAWN/SOLD/HOLD/ASSIGNED` |
| 권한 | 현황 `PUBLIC`; 신청·취소와 MVP 투표 `APPROVED+OWNER`; 경매·팀·대진·결과 mutation `ADMIN`. `/destruction-auction-live`도 URL과 무관하게 `ADMIN` |
| V1 근거 | `src/app/(user)/progress/destruction/**`, `src/app/(user)/participation/destruction/**`, `src/components/destruction/**`, `src/app/api/destruction-*/**` |

### 3.10 구인·Kakao 자동화 — S09

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/recruit`, `/recruit-helper`, `/kakao`, `/app/recruits` |
| 핵심 흐름 | 진행 구인 공개 조회; Kakao 명령으로 파티/스크림 생성·수정·참가·확정·마감·초기화·현황; 시즌 신청·운영 신청·이미지 수신 |
| 데이터 | `RecruitParty`, `RecruitPartyMember`, `RecruitPartyLog`, `RecruitPartyDiscordMonitor`, `DestructionScrimRecruit`, `DestructionScrimRecruitLog`, 4종 Kakao operation form, `KakaoImageReceiveSession`, `KakaoInboundImage`, `KakaoOperationSetting` |
| 상태 | 파티 `DRAFT/IN_PROGRESS/FINISHED/CANCELED/RESET`; 스크림 `RECRUITING/MATCHED/CONFIRMED/COMPLETED/CANCELED`; request key·message hash로 멱등성 보장 |
| 외부 연동 | Kakao bot webhook, Discord 음성 채널 모니터, 예약 마감 job |
| 권한 | 웹 현황 `PUBLIC`; bot API `BOT`; reset·복구 정책은 관리자/스케줄러로 분리 |
| V1 근거 | `src/app/(user)/recruit/**`, `src/app/(user)/kakao/**`, `src/app/api/kakao/**`, `src/app/api/recruits/route.ts`, `src/lib/kakao/**` |

### 3.11 징계·증거 — S11

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/discipline`, `/discipline/evidence`, 계정의 미완료 과제 카드 |
| 핵심 흐름 | 익명화된 운영 징계 집계 조회 → 승인 사용자의 본인 과제 선택 → 필요한 수만큼 사진 업로드/이어하기 → 관리자 검토·보완 → 차감 승인 |
| 데이터 | `UserDisciplineRecord`, `DisciplineSubmission`, `DisciplineResolutionTask`, `DisciplineEvidence`, `DisciplineCautionConversion`, `DisciplineBanReview`, `PrivateAsset` |
| 상태 | 과제 `REQUIRED/AWAITING_UPLOAD/REJECTED → PENDING_REVIEW → APPROVED`; 기한·필요 장수·수신 장수·review note |
| 권한 | 공개 페이지는 개인 식별자를 제거한 통계만, 업로드는 `APPROVED+OWNER`, 원본 자산은 관리자 목적 기반 접근 |
| V1 근거 | `src/app/(user)/discipline/**`, `src/app/api/discipline/tasks/[publicCode]/evidence/route.ts`, `src/lib/discipline/**` |

### 3.12 미디어 — S10

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/highlights`, `/highlights/[highlightId]`, `/images`, `/images/[imageId]` |
| 핵심 흐름 | 공개된 YouTube 하이라이트와 갤러리 목록·상세, 홈 노출 이미지 |
| 데이터 | `Highlight`, `GalleryImage` |
| 권한 | 게시된 콘텐츠 조회 `PUBLIC`; 생성·편집·삭제·홈 노출은 `ADMIN` |
| 외부 연동 | YouTube thumbnail, 운영 설정에 허용된 원격 이미지 |
| V1 근거 | `src/app/(user)/highlights/**`, `src/app/(user)/images/**`, `src/app/api/{highlights,images,gallery-images}/**` |

### 3.13 Riot 계정·RSO·솔랭 — S12

| 항목 | V1 기능 계약 |
|---|---|
| 시작 URL | `/me/riot`, `/app/me/riot`, `/players/[playerId]/riot`, `/riot-api` |
| 핵심 흐름 | 본인 Riot ID 직접 연결 또는 RSO 소유권 확인 → 상태 조회 → 솔랭/최근 경기 동기화 → 해제. 공개 프로필은 허용된 요약만 표시 |
| 데이터 | `PlayerRiotAccount`, `RiotRsoVerificationState`, `PlayerSoloRankSnapshot`, `PlayerSoloMatch`, `RiotApiStatus`, `RiotApiRequestLog`, `RiotSyncJob`, `RiotAccountLinkLog` |
| 권한 | 공개 요약 `PUBLIC`; 본인 연결·동기화·해제 `APPROVED+OWNER`; 타인 단일/전체 작업은 `ADMIN/SUPER` |
| 외부 연동 | Riot Developer API, RSO OAuth, Data Dragon |
| V1 근거 | `src/app/(user)/{me/riot,players/[playerId]/riot,riot-api}/**`, `src/components/riot/**`, `src/app/api/riot/**`, `src/lib/riot/**` |

운영 API 승인 전 기능은 준비 화면과 명확한 비활성 사유를 제공해야 하며, 테스트는 fake adapter만 사용한다. 실제 Riot 자격 증명이나 운영 계정 호출은 별도 승인 전 금지한다.

### 3.14 도움말·정책·AI — S01/S09/S12/S13

- `/terms`, `/privacy`: 회원 데이터, 쿠키, Riot 기능, 관리자 승인, 보존·삭제 절차를 표시한다.
- `/kakao`, `/recruit-helper`, `/riot-api`: 실제 기능 상태와 일치하는 도움말로 통합한다.
- `/api/ai/chat`: 승인 사용자만 사용하며 feature gate와 production hard-disable을 존중한다. 일반 사용자의 관리자 전용 질문은 데이터 조회 전에 차단한다.
- 오류·보안 로그에는 비밀번호, 토큰, TOTP, 원본 private asset, bot secret을 남기지 않는다.

### 3.15 PWA·Android — S14

V1은 `/app/**` 복제 화면, `manifest.json`, 제한적 static asset service worker, 설치 가이드, `/apk`, Capacitor Android shell을 제공한다. service worker는 API·관리자·다운로드·HTML을 캐시하지 않고 manifest/icon만 캐시한다.

V2 원칙:

1. 데스크톱·모바일·PWA는 동일 canonical URL과 application service를 사용한다.
2. `/app/**`는 한 버전 호환 redirect만 유지하고 모바일 자동 강제 전환 스크립트를 제거한다.
3. manifest `start_url`은 `/`, shortcut은 canonical URL을 사용한다.
4. 인증 응답·개인 HTML·API·private asset은 service worker cache에 저장하지 않는다.
5. Android WebView는 HTTPS production URL만 허용하고 mixed content를 금지한다.
6. APK metadata의 버전·build number·SHA-256·서명 검증과 다운로드 실패 상태를 확인한다.

근거: `public/manifest.json`, `public/sw.js`, `src/components/ServiceWorkerRegister.tsx`, `src/components/app-mobile/KlolInstallGuide.tsx`, `src/app/apk/route.ts`, `capacitor.config.ts`.

## 4. `/api/admin` 밖 Route Handler 112개 전수 목록

`혼합`은 GET은 공개/사용자 계약이고 mutation은 관리자 계약인 V1 경로를 뜻한다. V2에서는 method마다 application service와 권한을 분리하고, 관리자 mutation은 `/api/admin/**`로 이동한다. POST/PUT/PATCH/DELETE 호환은 HTTP redirect하지 않고 한 버전짜리 서버 adapter가 같은 idempotency key와 오류 계약을 전달한다.

### 4.1 인증·공통·AI (12/112)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/ai/chat` | POST | APPROVED, feature gate·role scope·rate limit | 유지, AI adapter와 공개/관리자 context 분리 (S13) |
| `/api/auth/login` | POST | PUBLIC, 비밀번호 로그인·7일 user cookie | 유지, 계정 상태 재검증 세션 (S01) |
| `/api/auth/logout` | POST | PUBLIC/SESSION, 멱등 쿠키 제거 | 유지 (S01) |
| `/api/auth/me` | GET | PUBLIC, 없으면 null·있으면 안전한 세션 DTO | 유지 (S01) |
| `/api/auth/password` | PATCH | SESSION, 현재 비밀번호 확인·변경·세션 폐기 | 유지 (S01) |
| `/api/auth/password/forgot` | PATCH | PUBLIC, 동일 202 응답·관리자 reset 요청 | 유지 (S01) |
| `/api/auth/signup` | POST | PUBLIC, 계정/플레이어 생성·승인 대기 | 유지 (S01/S02) |
| `/api/health` | GET | PUBLIC, 최소 상태 응답 | 유지하되 DB/외부 상세 비공개 (S00) |
| `/api/rankings` | GET | PUBLIC, 랭킹 read model | 유지 (S05) |
| `/api/recruits` | GET | PUBLIC, 공개 구인 DTO | 유지, canonical `/api/recruits` (S09) |
| `/api/site-settings` | GET | PUBLIC, 허용된 브랜드·feature 설정 | 유지, allowlist DTO (S13) |
| `/apk` | GET | PUBLIC, 검증된 latest metadata의 APK redirect | 유지 (S14) |

### 4.2 플레이어·챔피언·통계·Riot (20/112, 누계 32)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/champions` | GET / POST | GET PUBLIC, POST ADMIN | GET 유지; POST `/api/admin/champions` (S10) |
| `/api/champions/[championId]` | GET / PATCH / DELETE | GET PUBLIC, mutation ADMIN | 읽기/관리자 쓰기 분리 (S10) |
| `/api/my-player` | GET / PATCH | APPROVED+OWNER, 내 연결 플레이어 조회·수정 | `/api/me/player`로 통합, 구 URL adapter (S02) |
| `/api/players` | GET / POST | GET PUBLIC 검색/목록, POST ADMIN | GET 유지; POST `/api/admin/players` (S02) |
| `/api/players/[playerId]` | GET / PATCH / DELETE | GET PUBLIC 안전 DTO, mutation ADMIN | 읽기/관리자 쓰기 분리 (S02) |
| `/api/players/search` | GET | PUBLIC, rate limit·최대 8건 | 유지 (S02) |
| `/api/players/balance` | POST | APPROVED, 팀 계산 | `/api/team-tools/balance/evaluate`로 통합 (S06) |
| `/api/players/balance/balance-search` | GET | PUBLIC+feature gate, 안전 DTO | `/api/players/search?scope=balance` 통합 (S06) |
| `/api/stats/player/[playerId]/recent` | GET | PUBLIC, 최근 경기 안전 DTO | 유지 (S05) |
| `/api/stats/player/[playerId]/summary` | GET | PUBLIC, 시즌 집계 안전 DTO | 유지 (S05) |
| `/api/stats/top` | GET | PUBLIC, 상위 통계 | 유지 (S05) |
| `/api/riot/me/link` | POST | APPROVED+OWNER, Riot ID 직접 연결 | `/api/me/riot/link` 통합 (S12) |
| `/api/riot/me/status` | GET | APPROVED+OWNER | `/api/me/riot` read model (S12) |
| `/api/riot/me/sync` | POST | APPROVED+OWNER, cooldown | `/api/me/riot/sync` (S12) |
| `/api/riot/me/unlink` | POST | APPROVED+OWNER | `/api/me/riot/unlink` (S12) |
| `/api/riot/player/[playerId]/summary` | GET | PUBLIC, 허용된 솔랭 요약 | 유지, 안전 DTO (S12) |
| `/api/riot/player/[playerId]/sync` | POST | APPROVED 본인 또는 ADMIN | 본인 `/api/me/riot/sync`, 관리자 namespace로 분리 (S12) |
| `/api/riot/player/[playerId]/sync-full` | POST | ADMIN | `/api/admin/riot/players/[id]/sync-full` (S12) |
| `/api/riot/rso/start` | GET | APPROVED+OWNER, state·returnTo 생성 | `/api/me/riot/rso/start`, 내부 next만 허용 (S12) |
| `/api/riot/rso/callback` | GET | APPROVED+OWNER, state 1회 소비 | `/api/me/riot/rso/callback` (S12) |

### 4.3 경기·제출·미디어 (11/112, 누계 43)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/matches` | GET / POST | GET PUBLIC, POST ADMIN | GET 유지; POST `/api/admin/matches` (S04) |
| `/api/matches/[matchId]` | GET / PATCH / DELETE | GET PUBLIC, mutation ADMIN | 읽기/관리자 쓰기 분리 (S04) |
| `/api/matches/import-lol-result` | POST | ADMIN, scoreboard 이미지 OCR/import | `/api/admin/matches/import` (S04) |
| `/api/inhouse-results/submissions` | GET / POST | APPROVED+OWNER 또는 ADMIN, 내 작성 중 목록·생성 | `/api/me/match-submissions` (S04) |
| `/api/inhouse-results/submissions/[publicCode]` | GET | APPROVED+OWNER 또는 ADMIN | `/api/me/match-submissions/[code]` (S04) |
| `/api/inhouse-results/submissions/[publicCode]/images` | POST | APPROVED+OWNER 또는 ADMIN, private 이미지 | 동일 소유권 계약으로 통합 (S04) |
| `/api/highlights` | GET / POST | GET PUBLIC, POST ADMIN | GET 유지; POST `/api/admin/highlights` (S10) |
| `/api/highlights/[highlightId]` | GET / PATCH / DELETE | GET PUBLIC, mutation ADMIN | 읽기/관리자 쓰기 분리 (S10) |
| `/api/images` | GET / POST | GET PUBLIC, POST ADMIN | 공개 gallery GET; POST `/api/admin/images` (S10) |
| `/api/images/[imageId]` | GET / PATCH / DELETE | GET PUBLIC, mutation ADMIN | 읽기/관리자 쓰기 분리 (S10) |
| `/api/gallery-images/[imageId]/home-display` | POST / PATCH | ADMIN, 홈 노출 토글 | `/api/admin/images/[id]/home-display` (S10) |

### 4.4 시즌·참가·팀 밸런스 (19/112, 누계 62)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/seasons` | GET / POST | GET PUBLIC, POST ADMIN | GET 유지; POST `/api/admin/seasons` (S03) |
| `/api/seasons/current` | GET | PUBLIC, 활성 시즌 | 유지 (S03) |
| `/api/seasons/[seasonId]` | PATCH / DELETE | ADMIN | `/api/admin/seasons/[id]` (S03) |
| `/api/seasons/[seasonId]/activate` | PATCH | ADMIN | 관리자 namespace (S03) |
| `/api/seasons/[seasonId]/clone` | POST | ADMIN | 관리자 namespace (S03) |
| `/api/seasons/[seasonId]/current` | GET | PUBLIC, 해당 시즌 현재 집계 | `/api/seasons/[id]/summary` 통합 (S03/S05) |
| `/api/seasons/[seasonId]/end` | PATCH | ADMIN | 관리자 namespace (S03) |
| `/api/participation` | GET | PUBLIC, 모집 중 시즌·이벤트·멸망전 | `/api/applications/available` (S03) |
| `/api/participation/season` | GET / POST / DELETE | GET PUBLIC+본인 표시, POST/DELETE APPROVED+OWNER | `/api/applications/season` (S03) |
| `/api/participation/event/[eventId]` | GET / POST | GET PUBLIC, POST APPROVED+OWNER | `/api/applications/events/[id]` (S07) |
| `/api/participation/destruction/[tournamentId]` | GET / POST / DELETE | GET PUBLIC+본인 상태, mutation APPROVED+OWNER | `/api/applications/destruction/[id]` (S08) |
| `/api/team-balance/drafts` | GET / POST | APPROVED, draft 목록·생성 | `/api/team-tools/drafts` (S06) |
| `/api/team-balance/drafts/latest` | GET | APPROVED, 최신 draft | `/api/team-tools/drafts/latest` (S06) |
| `/api/team-balance/drafts/[draftId]` | GET | APPROVED | `/api/team-tools/drafts/[id]` (S06) |
| `/api/team-balance/drafts/[draftId]/solo-rank/sync` | POST | APPROVED, draft 참가자 솔랭 캐시 동기화 | canonical team-tools 경로 (S06/S12) |
| `/api/team-balance/evaluate` | POST | APPROVED, 후보 조합 평가 | `/api/team-tools/evaluate` (S06) |
| `/api/team-balance/recalculate-layout` | POST | APPROVED, 조건 변경 재배치 | `/api/team-tools/recalculate` (S06) |
| `/api/team-balance/season-applies` | GET | APPROVED, 참가 신청 불러오기 | `/api/team-tools/candidates?source=season` (S06) |
| `/api/team-balance/feedback` | POST | ADMIN, 결과 피드백 | `/api/admin/team-tools/feedback` (S06) |

### 4.5 이벤트전 (9/112, 누계 71)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/event-matches` | GET / POST | GET PUBLIC, POST ADMIN | GET `/api/competitions/events`; POST 관리자 namespace (S07) |
| `/api/event-matches/[eventId]` | GET / PATCH / DELETE | GET PUBLIC, mutation ADMIN | 읽기/관리자 쓰기 분리 (S07) |
| `/api/event-matches/[eventId]/participants` | PUT | ADMIN | 관리자 namespace (S07) |
| `/api/event-matches/[eventId]/teams` | POST / PUT | ADMIN, 자동 생성·편집 | 관리자 namespace (S07) |
| `/api/event-matches/[eventId]/bracket` | POST | ADMIN | 관리자 namespace (S07) |
| `/api/event-matches/[eventId]/matches/[matchId]/result` | PATCH | ADMIN | 관리자 namespace (S07) |
| `/api/event-matches/[eventId]/result` | PATCH | ADMIN, 최종 결과 | 관리자 namespace (S07) |
| `/api/event-matches/[eventId]/complete` | PATCH | ADMIN | 관리자 namespace (S07) |
| `/api/event-matches/balance` | POST | ADMIN, 참가자 팀 계산 | `/api/admin/competitions/events/balance` (S07) |

### 4.6 멸망전 (16/112, 누계 87)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/destruction-matches/[matchId]/mvp/vote` | PUT | APPROVED+OWNER, 1인 1표·재투표 규칙 | `/api/competitions/destruction/matches/[id]/mvp-vote` (S08) |
| `/api/destruction-tournaments` | GET / POST | GET PUBLIC, POST ADMIN | GET `/api/competitions/destruction`; POST 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]` | GET / PATCH / DELETE | GET PUBLIC, mutation ADMIN | 읽기/관리자 쓰기 분리 (S08) |
| `/api/destruction-tournaments/[tournamentId]/participants` | PUT | ADMIN | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/participants/[participantId]/replace` | POST | ADMIN, 선수 교체 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/teams` | POST | ADMIN | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/assign-teams` | PUT | ADMIN | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/auction/draw` | POST | ADMIN, 추첨 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/auction/resolve` | PATCH | ADMIN, 낙찰/보류/배정 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/preliminary` | POST | ADMIN, 예선 생성 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/preliminary/manual` | PUT | ADMIN, 수동 그룹/라운드 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/preliminary/confirm` | PATCH | ADMIN | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/tournament` | POST / DELETE | ADMIN, 본선 생성/취소 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/matches/[matchId]/result` | PATCH | ADMIN | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/final` | POST | ADMIN, 결승 생성 | 관리자 namespace (S08) |
| `/api/destruction-tournaments/[tournamentId]/complete` | PATCH | ADMIN, 우승/MVP/완료 | 관리자 namespace (S08) |

### 4.7 Kakao·구인 webhook (21/112, 누계 108)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/kakao/destruction-scrim-recruits/create` | POST | BOT, 생성/양식 수정·멱등성 | `/api/integrations/kakao/scrims` adapter (S09) |
| `/api/kakao/destruction-scrim-recruits/join` | POST | BOT, 상대 참가 | integration adapter |
| `/api/kakao/destruction-scrim-recruits/confirm` | POST | BOT, 확정 | integration adapter |
| `/api/kakao/destruction-scrim-recruits/finish` | POST | BOT, 완료 | integration adapter |
| `/api/kakao/destruction-scrim-recruits/cancel` | POST | BOT, 취소 | integration adapter |
| `/api/kakao/destruction-scrim-recruits/status` | GET / POST | BOT, 목록·상세 | integration adapter |
| `/api/kakao/party-recruits/create` | POST | BOT, 파티 생성 | `/api/integrations/kakao/recruits` adapter (S09) |
| `/api/kakao/party-recruits/sync` | POST | BOT, 양식 기반 수정·동기화 | integration adapter |
| `/api/kakao/party-recruits/status` | GET / POST | BOT, 현황·상세 | integration adapter |
| `/api/kakao/party-recruits/finish` | POST | BOT, 마감 | integration adapter |
| `/api/kakao/party-recruits/reset` | POST | BOT, 회차 초기화 | integration adapter, 위험 정책 분리 |
| `/api/kakao/party-recruits/auto-finish-idle` | GET / POST | BOT/JOB, 유휴 자동 마감 | `/api/internal/jobs/recruit-auto-finish` (S09/S13) |
| `/api/kakao/recruit/season-apply` | POST | BOT, 시즌 신청 생성/수정/취소 | integration adapter |
| `/api/kakao/recruit/season-apply/status` | GET / POST | BOT, 신청 현황 | integration adapter |
| `/api/kakao/operation-forms` | POST | BOT, 운영 신청 접수 | integration adapter |
| `/api/kakao/managed-forms` | POST | BOT, 관리형 양식 라우팅 | integration command router |
| `/api/kakao/image-receive` | POST | BOT, active 수신 세션에 private 이미지 저장 | integration upload adapter |
| `/api/kakao/openchat` | GET / POST | BOT, 오픈채팅 명령 router | integration command router |
| `/api/kakao/scheduled-notice` | GET / POST | BOT/JOB, 예약 공지 조회·실행 | internal job + bot adapter 분리 |
| `/api/kakao/search-player` | GET / POST | BOT, secret 기반 검색 | integration adapter, 안전 DTO |
| `/api/kakao/web-player-search` | GET | PUBLIC, 웹 도움말 검색·rate limit | `/api/players/search`로 통합 |

V2 bot 계약은 query/body secret을 폐기하고 `timestamp + raw body HMAC`, 짧은 재전송 허용창, request key, room/sender allowlist, 이중 secret 회전 기간을 사용한다. 운영 credential 없이 합성 서명 fixture로 검수한다.

### 4.8 징계·운영 job·로그 (4/112, 누계 112)

| Route Handler | Method | V1 실효 행위자·기능 | V2 처리 |
|---|---|---|---|
| `/api/discipline/tasks/[publicCode]/evidence` | POST | APPROVED+OWNER, private 증거 업로드 | `/api/me/discipline/tasks/[code]/evidence` (S11) |
| `/api/cron/kakao-daily-close` | GET | JOB, 일일 Kakao 마감 | `/api/internal/jobs/kakao-daily-close` (S13) |
| `/api/cron/maintenance` | GET | JOB, 보존·정비 작업 | `/api/internal/jobs/maintenance` (S13) |
| `/api/logs` | GET / POST | SUPER, 감사 로그 조회/기록 | `/api/admin/logs`, 공개 namespace 폐쇄 (S13) |

## 5. 데이터 의존성과 V2 모듈 경계

| V2 모듈 | V1 핵심 데이터 | V2 저장/호출 원칙 |
|---|---|---|
| `auth` | `UserAccount`, `AdminLog`, `RateLimitLog` | 세션 DB 재검증, password/TOTP 암호화, 감사 event |
| `players` | `Player` | public/private DTO 분리, repository를 통한 검색·수정 |
| `matches` | `MatchSeries`, `MatchGame`, `MatchParticipant`, `Champion` | 경기 aggregate와 통계 projection 분리 |
| `submissions` | `InhouseResultSubmission`, `InhouseResultImage`, `PrivateAsset` | owner policy, idempotency, private Blob adapter |
| `stats` | 3종 player stat, `SeasonResult`, balance 결과 | 재계산 가능한 projection, source 경기와 대조 |
| `team-tools` | draft·draft player·balance profile/review | 계산기는 순수 domain, 저장은 repository |
| `competitions-event` | 4종 Event 모델, 참가 신청 | 상태 전이를 application command로 제한 |
| `competitions-destruction` | 7종 Destruction 모델, 참가 신청 | 상태/경매/MVP invariant를 transaction으로 보장 |
| `recruiting` | party/scrim/member/log/monitor | request key 멱등성, bot adapter와 도메인 분리 |
| `discipline` | record/submission/task/evidence/conversion/review | 목적 기반 private asset 접근, 대상 identity snapshot |
| `riot` | account/RSO/snapshot/match/status/log/job | 외부 adapter, cooldown·재시도·회로 차단 |
| `media` | `Highlight`, `GalleryImage` | published projection과 관리자 mutation 분리 |
| `operations` | Kakao form/settings, Discord operation models, cache | 사용자 기능과 분리된 integration/job/audit 경계 |

페이지와 Route Handler가 DB·Blob·Riot·Kakao client를 직접 호출하지 않고 `page/route → application service → repository/adapter port → infrastructure` 순서를 지킨다.

## 6. 외부 연동 목록과 비운영 검수

| 연동 | V1 사용 | V2 개발 검수 |
|---|---|---|
| PostgreSQL | 전체 영속 데이터 | 격리된 일회성 test DB, migration·rollback·동시성 테스트 |
| Vercel Blob | 결과/징계/Kakao private 이미지, 일부 공개 이미지 | fake Blob + 만료 URL; 원본 자산 로그/fixture 금지 |
| Riot API/RSO | 계정 소유권, 티어·솔랭·최근 경기 | fake HTTP adapter, quota/429/5xx/timeout fixture |
| Data Dragon | 챔피언·프로필 시각 자료 | 허용 host, fallback, version 고정/갱신 작업 |
| Kakao bot | 구인·신청·운영 양식·이미지·검색 | 합성 HMAC 요청, 재전송·중복·방/발신자 정책 |
| Discord bot | 음성 채널 구인 자동 마감·계정/역할 운영 | event fixture, 운영 guild/token 미사용 |
| OpenAI | 역할 범위 AI 도우미 | fake model, production hard-disable 기본값 |
| YouTube | 하이라이트 embed/thumbnail | URL allowlist, unavailable/private video fallback |
| Android/Capacitor | 웹 shell·APK | 로컬 debug artifact, 운영 서명키 미사용 |

## 7. 공통 화면·오류·접근성 계약

모든 canonical 사용자 화면은 해당 기능에 맞는 다음 상태를 가져야 한다.

1. `loading`: skeleton/진행 문구, `aria-busy`, layout shift 최소화
2. `ready`: 최소 2개 레코드와 핵심 행동 성공
3. `empty`: 정상 200, 이유와 다음 행동 CTA
4. `unauthenticated/pending/rejected`: 로그인·승인 상태별 명확한 안내
5. `not-found/forbidden`: 404와 403을 구분하되 private 자산 존재 여부는 숨김
6. `error/retry`: 안전한 재시도, 입력 보존, 중복 제출 방지
7. mutation: `idle → validating → submitting → success | field-error | conflict | server-error`

공통 접근성 기준은 키보드만으로 완료, focus-visible, 44px 터치 대상, 명시적 label/error 연결, 상태 변화 live region, 색 외 상태 표시, reduced-motion, 320/375/768/1024/1440px 확인이다.

## 8. 미확인·후속 확인 항목

다음은 소스 계약은 확인했지만 실제 비운영 통합 환경에서 아직 검증하지 않은 항목이다.

- 운영 데이터의 각 상태 조합별 실제 레코드 수와 오래된 고아 관계
- Riot production API 승인 상태, 실제 quota, RSO 등록 redirect URI
- Kakao/Discord 운영 클라이언트가 보내는 최종 header·raw body 형식과 재전송 정책
- 운영 Android APK의 서명 인증서·배포 채널·업데이트 정책
- Vercel Blob lifecycle과 DB `PrivateAsset` 간 운영 정합성
- 기존 `/app/**` 및 도움말 별칭의 실제 접근 로그와 redirect 유지 기간
- AI 기능의 향후 운영 허용 여부와 비용 상한

이 항목은 V2 구현을 운영 자격 증명에 연결할 근거가 아니다. S14 전환 전 별도 비운영/운영 준비 점검에서 확인한다.

## 9. 주요 근거 파일

- `src/app/(user)/**/page.tsx`
- `src/app/app/**/page.tsx`
- `src/app/api/**/route.ts` (`api/admin` 제외)
- `src/proxy.ts`
- `src/lib/auth/**`, `src/lib/public/**`, `src/lib/stats/**`
- `src/lib/kakao/**`, `src/lib/riot/**`, `src/lib/discipline/**`
- `src/components/UserSidebar.tsx`, `src/components/UserMobileNav.tsx`
- `src/components/app-mobile/**`, `src/lib/navigation/**`
- `prisma/schema.prisma`
- `public/manifest.json`, `public/sw.js`, `capacitor.config.ts`
