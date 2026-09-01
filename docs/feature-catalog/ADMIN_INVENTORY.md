# V1 관리자 기능 전수 목록과 V2 검수 계약

## 1. 조사 기준과 판정 표기

- 조사 기준 Git ref: `origin/main` = `3e6a9f1a28fb01c91f4b4c00b7ea02a77d45295a`
- 조사 대상: V1의 `src/app/(admin)/admin/**`, `src/app/api/admin/**`, 관리자 화면이 호출하는 공용 API, 인증·권한·TOTP·프록시 코드
- 확인 수량: 관리자 UI `page.tsx` 81개, `/api/admin/**/route.ts` 72개
- `[확인]`: 해당 ref의 소스에서 경로·가드·동작을 직접 확인했다.
- `[추정]`: 경로명 또는 컴포넌트명만으로 의미를 보완한 항목이다. V2 구현 전에 인수 테스트로 확정해야 한다.
- `.env`, 운영 자격 증명, TOTP 비밀값, 운영 데이터는 열지 않았다.

핵심 결론은 다음과 같다.

1. `[확인]` V1은 `/admin/login`을 제외한 모든 `/admin/**` 페이지를 `src/proxy.ts`에서 인증한다. 각 페이지가 로그인 화면으로 보내지는 것은 의도된 보안 계약이며 결함이 아니다.
2. `[확인]` 2FA 미등록 관리자만 `/admin/security`와 등록용 API에 제한적으로 접근할 수 있다. 그 외 관리자 페이지는 TOTP 등록·검증까지 끝난 세션이 필요하다.
3. `[확인]` 다수 서버 페이지가 Prisma를 직접 호출하고 페이지 자체에는 인증 코드가 없다. 보안은 프록시에 의존한다. V2에서는 `page/route -> application service -> repository` 경계와 서버 측 권한 정책을 함께 적용해야 한다.
4. `[확인]` 관리자 라우트 트리에는 전용 `loading.tsx`, `error.tsx`, `not-found.tsx`가 없다. 일부 클라이언트 화면만 자체 로딩·오류·빈 상태를 갖고 있어, V2에서는 모든 관리자 화면의 네 가지 상태를 계약으로 강제해야 한다.
5. 관리자 검수 문제는 로그인 우회로 해결하지 않는다. 격리 테스트 DB의 합성 계정으로 실제 로그인·TOTP·세션 발급을 통과한 E2E fixture를 사용한다.

## 2. 인증·권한 계약

### 2.1 역할과 세션

| 주체 | V1 접근 조건 | 관리자 화면 결과 |
|---|---|---|
| 익명 | `user_token` 없음 | `/admin/login?next=...`로 이동 |
| 일반 사용자 | `USER`, 계정 상태와 무관 | 관리자 상태로 인정하지 않고 로그인 화면으로 이동 |
| 관리자 등록 전 | `ADMIN` 또는 `SUPER_ADMIN`, `APPROVED`, TOTP 미등록 | `/admin/security?setup=required&next=...`만 허용 |
| 관리자 재인증 전 | TOTP는 등록됐지만 토큰의 `adminTotpVerified !== true` | 로그인 화면으로 이동, 관리자 API 거부 |
| 관리자 | `ADMIN`, `APPROVED`, `authVersion` 일치, TOTP 검증 완료 | 일반 관리자 페이지·API 허용 |
| 최고관리자 | `SUPER_ADMIN`, 위 조건 모두 충족 | 일반 관리자와 SUPER 전용 기능 허용 |

근거:

- `src/proxy.ts`: `/admin/**`, `/api/admin/**` 중앙 검사, `next` 보존, 2FA 등록 예외, private/no-store 헤더
- `src/lib/auth/requireAdmin.ts`: DB의 역할·상태·삭제 여부·`authVersion`·TOTP 상태 재검증
- `src/lib/auth/admin-security-policy.ts`: `ADMIN | SUPER_ADMIN`, TOTP 준비 상태, 계정 관리·비공개 자료 정책
- `src/lib/auth/token.ts`: HS256, issuer/audience, 사용자 ID·`authVersion`·`adminTotpVerified`
- `src/lib/auth/cookies.ts`: HttpOnly, SameSite=Lax, 운영 Secure, 전체 경로, high priority

### 2.2 로그인과 TOTP 상태 전이

```text
익명
  -> POST /api/admin/login (아이디·비밀번호)
  -> TOTP 미등록: 등록 전용 user_token 발급
  -> /admin/security
  -> POST /api/admin/2fa/setup
  -> POST /api/admin/2fa/enable (현재 6자리 코드)
  -> authVersion 증가 + 기존 세션 제거
  -> POST /api/admin/login (아이디·비밀번호·새 TOTP 코드)
  -> 관리자 세션

TOTP 등록 관리자
  -> POST /api/admin/login
  -> requiresTwoFactor 응답
  -> 새 6자리 코드 제출
  -> 재사용 방지 확인
  -> 관리자 세션
```

`[확인]` 본인 2FA 해제는 현재 TOTP 코드가 필요하고 세션을 제거한다. 최고관리자는 다른 관리자 2FA를 초기화할 수 있다. 활성화·비활성화·비밀번호 변경·역할 변경은 `authVersion`을 올려 기존 세션을 무효화한다.

### 2.3 권한 코드

- `PUBLIC`: 관리자 세션 없이 접근 가능한 인증 진입/종료 경로
- `ENROLL`: 승인된 ADMIN/SUPER_ADMIN의 TOTP 등록 전용 세션
- `ADMIN`: TOTP 검증을 마친 ADMIN 또는 SUPER_ADMIN
- `SUPER`: TOTP 검증을 마친 SUPER_ADMIN만
- `MIXED`: 페이지는 ADMIN이 열 수 있으나 일부 조회·버튼·대상은 SUPER로 제한

## 3. 관리자 UI 전수 목록

아래 표는 81개 페이지 경로를 모두 포함한다. `직접 DB`는 V1 서버 컴포넌트가 Prisma를 직접 읽는다는 뜻이며 V2 구현 방식으로 계승하지 않는다.

### 3.1 인증·대시보드·운영

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/login` | `POST /api/admin/login` | PUBLIC | 비밀번호 단계, TOTP 단계, 진행 중, 입력/서버 오류, 안전한 `next` 이동 | S01 |
| `/admin/security` | `GET /api/admin/2fa/status`, `POST /setup`, `/enable`, `/disable` | ENROLL 또는 ADMIN | 상태 확인, QR/설정 키 생성, 코드 검증, 해제, 성공 후 재로그인, QR 생성 오류 | S01 |
| `/admin` | `GET /api/admin/dashboard`, `POST /api/admin/stats/recalculate` | MIXED | KPI·시스템 상태·최근 운영 자료, 클라이언트 로딩/오류/빈 상태; 재계산은 SUPER | S13 |
| `/admin/site-settings` | `GET/PUT /api/admin/site-settings`, 사이트 설정 read model | SUPER | 기능 플래그·브랜드·운영 설정 조회/저장, 배포 방식 안내; 저장 중·오류 필요 | S13 |
| `/admin/ai-requests` | 직접 DB: AI 요청 로그 | SUPER | 검색/필터/페이지 목록, 오류·빈 목록 | S13 |
| `/admin/logs` | 직접 DB 및 `GET /api/admin/logs` | SUPER | 감사 로그 필터·페이지, 빈 목록; 서버 실패 전용 상태 없음 | S13 |
| `/admin/logs/stats` | `GET /api/admin/logs/stats`와 통계 read model | SUPER | 로그 통계 대시보드; 로딩·오류·빈 상태를 V2에서 명시 | S13 |
| `/admin/logs/kakao` | 직접 DB, 사이트 기능 플래그 | ADMIN | 카카오 로그 필터·목록·premium lock·빈 목록 | S09/S13 |

### 3.2 플레이어·계정·징계

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/players` | `GET/POST /api/players`, `PATCH/DELETE /api/players/[id]`, `/api/players/search` | ADMIN | 검색·페이지·등록·수정·삭제, 클라이언트 로딩/오류/빈 결과 | S02 |
| `/admin/players/new` | `POST /api/players` | ADMIN | 플레이어 등록, 중복/유효성/서버 오류, 처리 중 | S02 |
| `/admin/players/[playerId]` | 직접 DB, `/api/players/[id]`, 계정 role/password/2FA API | MIXED | 플레이어·연결 계정 상세, 404; 기본 수정은 ADMIN, 역할·비밀번호·2FA는 SUPER | S02 |
| `/admin/players/[playerId]/edit` | `/admin/players/[playerId]`로 redirect | ADMIN | 호환 경로; 독립 화면 없음 | S02 |
| `/admin/players/[playerId]/balance` | 직접 DB, `GET /api/admin/players/[id]/balance-profile` | ADMIN | 라인별 MMR·수동 보정·변경 이력, 빈 이력, 404 | S05 |
| `/admin/players/[playerId]/riot` | Riot 상태/연결/동기화 API, 사이트 기능 플래그 | MIXED | 계정 연결·해제·동기화·premium lock·잘못된 ID; 일괄 작업은 SUPER | S12 |
| `/admin/player-approvals` | `/admin/players`로 redirect | ADMIN | 폐기된 승인 화면 호환 경로 | S02 |
| `/admin/users` | `GET /api/admin/users`, `DELETE /api/admin/users/[id]/delete` | MIXED | 상태/역할 필터·페이지, 로딩·오류·빈 목록; 삭제는 SUPER | S01/S02 |
| `/admin/users/[userAccountId]` | details, approve, reject, reset, restore, role, password-reset, 2fa-reset API | MIXED | 상세 로딩·오류·없음, 승인/거절, 역할·비밀번호·2FA·복구; 민감 작업 SUPER | S01/S02 |
| `/admin/discipline` | 직접 DB, discipline records/submissions/tasks/ban-reviews API | ADMIN | 기록 목록·검토 워크플로·증거 배치, 오류·빈 상태 | S11 |
| `/admin/discipline/new` | `POST /api/admin/discipline-records`, 플레이어 검색 | ADMIN | 조치 등록, 대상 검색, 입력/서버 오류, 대상 없음 | S11 |
| `/admin/discipline/[id]` | 직접 DB, `PATCH/DELETE /api/admin/discipline-records/[id]` | ADMIN | 기록 상세·수정·삭제, 404; 초기화는 SUPER | S11 |
| `/admin/operation-forms/warnings` | `/admin/discipline`로 redirect | ADMIN | 과거 경고 관리 호환 경로 | S11 |

계정 관리의 대상별 제약도 계승한다.

- `[확인]` ADMIN은 일반 사용자 승인·거절을 처리할 수 있으나 다른 ADMIN은 관리할 수 없다.
- `[확인]` SUPER_ADMIN 계정은 다른 관리자도 역할 변경·삭제할 수 없다.
- `[확인]` 역할 변경 대상은 `USER | ADMIN`만 허용되며 ADMIN 승격은 승인된 계정만 가능하다.
- `[확인]` 비공개 자료는 SUPER가 모두 볼 수 있고 ADMIN은 현재 `INHOUSE_RESULT`, `DISCIPLINE_ISSUE`, `DISCIPLINE_RESOLUTION` 목적만 볼 수 있다.

### 3.3 경기·랭킹·밸런스

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/matches` | 직접 DB, `GET/POST /api/matches`, AI 학습 API | ADMIN | 경기 필터·페이지·삭제·AI 학습, 빈 목록 | S04 |
| `/admin/matches/new` | `POST /api/matches` | ADMIN | 선수/세트/결과 등록, 입력·서버 오류 | S04 |
| `/admin/matches/[matchId]/edit` | `GET/PATCH /api/matches/[id]` | ADMIN | 경기 편집, 저장 오류, 잘못된 ID/404 | S04 |
| `/admin/matches/submissions` | 직접 DB, 결과 접수 관련 공용 API·비공개 이미지 | ADMIN | 대기/검토/반영 상태, 증거 확인, 빈 접수 | S04/S10 |
| `/admin/matches/[matchId]/ai-review` | 직접 DB, `POST /api/admin/balance-ai/matches/[id]/reanalyze`, feedback API | ADMIN | 리뷰·MMR 변화·재분석, 404·리뷰 없음·오류 | S05 |
| `/admin/balance` | 선수 검색·밸런스·draft·layout·season-applies API | ADMIN | 팀 밸런스 생성·저장·재배치; 클라이언트 상태 계약 필요 | S06 |
| `/admin/balance/drafts` | 직접 DB | ADMIN | 저장된 draft 필터·페이지·빈 목록 | S06 |
| `/admin/balance/drafts/[draftId]` | 직접 DB, `POST /api/team-balance/feedback` | ADMIN | draft 상세·AI 리뷰·피드백, 404·리뷰 없음 | S06 |
| `/admin/balance/drafts/[draftId]/recommendations` | 해당 draft 상세로 redirect | ADMIN | 호환 경로 | S06 |
| `/admin/balance/recommendations` | `/admin/balance/drafts`로 redirect | ADMIN | 호환 경로 | S06 |
| `/admin/balance-ai` | 직접 DB | ADMIN | 랭킹 KPI·프로필·경기 분석·리뷰 없음 | S05 |
| `/admin/balance-ai/players` | 직접 DB, `GET /api/admin/balance-ai/players` | ADMIN | MMR 플레이어 필터·페이지·빈 목록 | S05 |
| `/admin/balance-ai/recalculate` | `POST /api/admin/balance-ai/recalculate`, 직접 DB | ADMIN | 전체 재계산, 확인·실행 중·결과·오류 | S05 |
| `/admin/balance-ai/reviews` | 직접 DB 또는 reviews API | ADMIN | 리뷰 목록·페이지·빈 목록·오류 | S05 |
| `/admin/balance-ai/reviews/[reviewId]` | 직접 DB 또는 review API | ADMIN | 판단·근거·리스크 상세, 404·오류·자료 없음 | S05 |

### 3.4 이벤트전·멸망전

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/progress` | 직접 DB | ADMIN | 이벤트/멸망전 선택과 현황 | S07/S08 |
| `/admin/progress/event` | 직접 DB | ADMIN | 이벤트 목록·페이지·빈 목록·삭제 | S07 |
| `/admin/progress/event/new` | `POST /api/event-matches` | ADMIN | 이벤트 생성, 유효성·서버 오류 | S07 |
| `/admin/progress/event/[eventId]` | 참가자 import/manual, team, bracket, result, complete API | ADMIN | 모집→참가자→팀→대진→결과→완료, 각 단계 빈 상태·404 | S07 |
| `/admin/progress/destruction` | 직접 DB | ADMIN | 멸망전 목록·페이지·빈 목록·삭제 | S08 |
| `/admin/progress/destruction/new` | `POST /api/destruction-tournaments` | ADMIN | 멸망전 생성, 유효성·서버 오류 | S08 |
| `/admin/progress/destruction/[tournamentId]` | 신청 승인, import, 참가자, 팀, 경매, 예선, 본선, 결과, 교체, MVP, 완료 API | ADMIN | 전 수명주기 운영; 단계별 빈 상태·오류·404가 필요 | S08 |

### 3.5 Kakao·구인·운영 신청

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/kakao` | 직접 DB, Kakao 설정, private storage health | ADMIN | 운영센터 요약·설정 상태·최근 구인, 빈 상태 | S09 |
| `/admin/kakao/recruits` | 직접 DB, recruit reset/settings API | MIXED | 진행 구인·이력·페이지·빈 상태; 번호/전체 reset·자동화 설정은 SUPER | S09 |
| `/admin/kakao/recruits/logs` | 직접 DB | ADMIN | 카카오 구인 로그 필터·페이지·빈 목록 | S09 |
| `/admin/kakao/recruits/settings` | `GET/POST /api/admin/kakao/recruit-health`, recruit settings API | MIXED | 진단은 ADMIN, 안전 복구·reset 설정은 SUPER, 오류·빈 상태 | S09 |
| `/admin/kakao/scrims` | 직접 DB, `GET /api/admin/destruction-scrim-recruits` | ADMIN | 스크림 구인 목록·상태·빈 목록 | S09 |
| `/admin/kakao/season-apply` | 직접 DB, `GET /api/admin/season-participation-applies` | ADMIN | 참가 신청 목록·필터·페이지·빈 목록 | S03/S09 |
| `/admin/kakao/settings` | `GET/POST /api/admin/kakao/settings` | ADMIN | 카카오 운영 설정 조회·저장·오류 | S09 |
| `/admin/kakao/stats` | `GET /api/admin/kakao/stats` | ADMIN | 운영 통계·기간/상태·오류·빈 데이터 | S09 |
| `/admin/kakao/operation-forms` | 직접 DB | ADMIN | 4종 신청 건수와 분류 허브 | S09 |
| `/admin/kakao/operation-forms/friends`<br>`/admin/kakao/operation-forms/leaves`<br>`/admin/kakao/operation-forms/meetups`<br>`/admin/kakao/operation-forms/suggestions` | operation-form 목록/상세 API | ADMIN | `/admin/operation-forms/**` 구현을 재사용하는 별칭, 상태 필터·빈 목록 | S09 |
| `/admin/operation-forms` | 직접 DB | ADMIN | 4종 신청 분류 허브 | S09 |
| `/admin/operation-forms/friends`<br>`/admin/operation-forms/leaves`<br>`/admin/operation-forms/meetups`<br>`/admin/operation-forms/suggestions` | `PATCH/DELETE /api/admin/operation-forms/[type]/[id]` | ADMIN | 유형별 목록·상태 필터·관리 메모·빈 목록 | S09 |
| `/admin/operation-forms/[formType]/[id]` | 같은 operation-form 상세 API | ADMIN | 상세·상태 변경·메모·삭제, 404·오류 | S09 |
| `/admin/recruits` | 직접 DB, 사이트 feature gate | ADMIN | 카카오 구인 관리의 구형/별도 진입, 진행/최근 목록·빈 상태 | S09 |

### 3.6 콘텐츠·시즌

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/champions` | `GET/POST /api/champions`, `PATCH/DELETE /api/champions/[id]` | ADMIN | 챔피언 목록·등록·수정·삭제, 로딩/오류/빈 목록 | S10 |
| `/admin/champions/new` | `POST /api/champions` | ADMIN | 등록·유효성·오류 | S10 |
| `/admin/champions/[championId]/edit` | `GET/PATCH /api/champions/[id]` | ADMIN | 수정·삭제·404·저장 오류 | S10 |
| `/admin/highlights` | 직접 DB, highlight API | ADMIN | 필터·페이지·빈 목록 | S10 |
| `/admin/highlights/new` | `POST /api/highlights` | ADMIN | 영상/썸네일 등록·오류 | S10 |
| `/admin/highlights/[highlightId]/edit` | `GET/PATCH/DELETE /api/highlights/[id]` | ADMIN | 수정·삭제·404·오류 | S10 |
| `/admin/images` | 직접 DB, `/api/gallery-images/[id]/home-display` | ADMIN | 우승팀 이미지 목록·홈 노출 변경·빈 목록 | S10 |
| `/admin/images/new` | `POST /api/images` | ADMIN | 이미지 등록·오류 | S10 |
| `/admin/images/[imageId]/edit` | `GET/PATCH/DELETE /api/images/[id]` | ADMIN | 수정·삭제·404·오류 | S10 |
| `/admin/seasons` | season CRUD/activate/clone/end API | ADMIN | 생성·편집·복제·활성·종료·삭제, 빈 목록·작업 오류 | S03 |

### 3.7 Riot·비공개 자료

| 페이지 경로 | 관련 API/데이터 | 권한 | 핵심 상태·행동 | V2 순서 |
|---|---|---|---|---:|
| `/admin/riot` | Riot dashboard read model, feature status | MIXED | 연동 요약·최근 계정·최근 동기화·오류·빈 상태; 일부 SUPER 표시 | S12 |
| `/admin/riot/accounts` | Riot account read model, link/unlink/status API | MIXED | 계정 필터·연결 상태·오류·빈 목록; SUPER 추가 제어 | S12 |
| `/admin/riot/accounts/bulk-link` | `POST /api/admin/riot/bulk-link` | SUPER | 미리보기·일괄 연결·확인·결과·오류 | S12 |
| `/admin/riot/sync` | single sync, retry-failed, sync-all API | MIXED | 단일 동기화는 ADMIN, 전체 동기화는 SUPER, 작업 이력·오류·빈 상태 | S12 |
| `/admin/riot/logs` | Riot log read model | ADMIN | API/동기화/감사 로그·필터·오류·빈 목록 | S12 |
| `/admin/riot/application` | 정적 운영 문서 | ADMIN | Production 신청 문구·체크리스트; 외부 상태는 수동 확인 | S12 |
| `/admin/private-assets` | `GET /api/admin/private-assets` | MIXED | 목적·상태별 비공개 자산 목록, 클라이언트 로딩·오류·빈 목록 | S10/S11 |
| `/admin/private-assets/[id]` | `GET /api/admin/private-assets/[id]`, `/metadata` | MIXED | 권한 확인 후 스트리밍/메타데이터, 403·404·오류 | S10/S11 |

## 4. `/api/admin` 72개 경로 전수 목록

표의 권한은 프록시와 route handler를 합친 **실효 권한**이다. 공용 CRUD API도 4.8에 별도로 기록한다.

### 4.1 인증·2FA

| API | Method | 실효 권한/행동 |
|---|---|---|
| `/api/admin/login` | POST | PUBLIC, 비밀번호·TOTP·rate limit, 세션 발급 |
| `/api/admin/logout` | POST | PUBLIC endpoint, 존재하는 관리자 세션은 감사 기록 후 쿠키 제거 |
| `/api/admin/2fa/status` | GET | ENROLL/ADMIN |
| `/api/admin/2fa/setup` | POST | ENROLL, 암호화 저장된 계정별 secret 생성/재조회 |
| `/api/admin/2fa/enable` | POST | ENROLL, 코드 검증 후 세션 무효화 |
| `/api/admin/2fa/disable` | POST | ADMIN 본인, SUPER는 다른 관리자도 가능 |

### 4.2 대시보드·로그·설정·백업·유지보수

| API | Method | 실효 권한 |
|---|---|---|
| `/api/admin/dashboard` | GET | ADMIN, 응답 일부 SUPER 전용 |
| `/api/admin/site-settings` | GET, PUT | SUPER |
| `/api/admin/logs` | GET | SUPER |
| `/api/admin/logs/stats` | GET | SUPER |
| `/api/admin/maintenance/admin-log-cleanup` | POST | SUPER (프록시 강제) |
| `/api/admin/maintenance/rate-limit-cleanup` | POST | SUPER (프록시 강제) |
| `/api/admin/backup/players.csv` | GET | SUPER |
| `/api/admin/backup/matches.csv` | GET | SUPER |
| `/api/admin/backup/mmr.csv` | GET | SUPER |
| `/api/admin/backup/rankings.csv` | GET | SUPER |
| `/api/admin/backup/balance-ai.csv` | GET | SUPER |
| `/api/admin/stats/consistency` | GET | ADMIN |
| `/api/admin/stats/recalculate` | POST | SUPER |

### 4.3 AI MMR·밸런스

| API | Method | 실효 권한 |
|---|---|---|
| `/api/admin/balance-ai/summary` | GET | ADMIN |
| `/api/admin/balance-ai/players` | GET | ADMIN |
| `/api/admin/balance-ai/reviews` | GET | ADMIN |
| `/api/admin/balance-ai/reviews/[reviewId]` | GET | ADMIN |
| `/api/admin/balance-ai/recalculate` | POST | ADMIN |
| `/api/admin/balance-ai/matches/[matchId]/reanalyze` | POST | ADMIN |
| `/api/admin/balance/recommendations/train` | POST | ADMIN |

### 4.4 경기·이벤트·멸망전

| API | Method | 실효 권한 |
|---|---|---|
| `/api/admin/destruction-matches/[matchId]/mvp` | PATCH, DELETE | ADMIN |
| `/api/admin/destruction-scrim-recruits` | GET | ADMIN |
| `/api/admin/destruction-tournaments/[tournamentId]/applications/[applicationId]/status` | PATCH | ADMIN |
| `/api/admin/destruction-tournaments/[tournamentId]/import-participants` | POST | ADMIN |
| `/api/admin/event-matches/[eventId]/import-participants` | POST | ADMIN |
| `/api/admin/event-matches/[eventId]/participants` | POST | ADMIN |
| `/api/admin/event-matches/[eventId]/participants/[participantId]/delete` | POST | ADMIN |
| `/api/admin/season-participation-applies` | GET | ADMIN |

### 4.5 징계·운영 신청·비공개 자료

| API | Method | 실효 권한 |
|---|---|---|
| `/api/admin/discipline-records` | GET, POST | ADMIN |
| `/api/admin/discipline-records/[id]` | PATCH, DELETE | ADMIN |
| `/api/admin/discipline-records/[id]/reset` | POST | SUPER |
| `/api/admin/discipline-records/user/[userAccountId]/reset` | POST | SUPER |
| `/api/admin/discipline-records/target/reset` | POST | SUPER |
| `/api/admin/discipline-submissions/[id]` | PATCH | ADMIN |
| `/api/admin/discipline-tasks/[id]` | PATCH | ADMIN |
| `/api/admin/discipline-ban-reviews/[id]` | PATCH | ADMIN |
| `/api/admin/operation-forms/[formType]/[id]` | PATCH, DELETE | ADMIN |
| `/api/admin/private-assets` | GET | ADMIN + 목적별 정책 |
| `/api/admin/private-assets/[id]` | GET | ADMIN + 목적별 정책 |
| `/api/admin/private-assets/[id]/metadata` | GET | ADMIN + 목적별 정책 |

### 4.6 Kakao·구인

| API | Method | 실효 권한 |
|---|---|---|
| `/api/admin/kakao/settings` | GET, POST | ADMIN |
| `/api/admin/kakao/stats` | GET | ADMIN |
| `/api/admin/kakao/recruit-health` | GET | ADMIN |
| `/api/admin/kakao/recruit-health` | POST | SUPER |
| `/api/admin/recruits/auto-finish-settings` | POST | SUPER |
| `/api/admin/recruits/auto-reset-settings` | POST | SUPER |
| `/api/admin/recruits/reset-all` | POST | SUPER |
| `/api/admin/recruits/reset-number` | POST | SUPER |

### 4.7 Riot

| API | Method | 실효 권한 |
|---|---|---|
| `/api/admin/riot/bulk-link` | POST | SUPER |
| `/api/admin/riot/players/[playerId]/link` | POST | ADMIN |
| `/api/admin/riot/players/[playerId]/status` | GET | ADMIN |
| `/api/admin/riot/players/[playerId]/sync` | POST | ADMIN |
| `/api/admin/riot/players/[playerId]/unlink` | POST | ADMIN |
| `/api/admin/riot/retry-failed` | POST | ADMIN |
| `/api/admin/riot/sync-all` | POST | SUPER |

### 4.8 사용자·플레이어

| API | Method | 실효 권한/대상 제약 |
|---|---|---|
| `/api/admin/players/[playerId]/balance-profile` | GET | ADMIN |
| `/api/admin/players/[playerId]/password-reset` | PATCH | SUPER |
| `/api/admin/users` | GET | ADMIN, TOTP 상세는 SUPER만 노출 |
| `/api/admin/users/[userAccountId]/details` | GET | ADMIN, TOTP 상세는 SUPER만 노출 |
| `/api/admin/users/[userAccountId]/approve` | PATCH | ADMIN은 USER만, SUPER는 ADMIN까지 |
| `/api/admin/users/[userAccountId]/reject` | PATCH | ADMIN은 USER만, SUPER는 ADMIN까지 |
| `/api/admin/users/[userAccountId]/role` | PATCH | SUPER |
| `/api/admin/users/[userAccountId]/reset` | PATCH | SUPER |
| `/api/admin/users/[userAccountId]/restore` | PATCH | SUPER |
| `/api/admin/users/[userAccountId]/delete` | DELETE | SUPER |
| `/api/admin/users/[userAccountId]/password-reset` | PATCH | SUPER |
| `/api/admin/users/[userAccountId]/2fa-reset` | PATCH | SUPER |

### 4.9 관리자 화면이 호출하는 공용 API

이 경로들은 `/api/admin` 네임스페이스가 아니지만 mutating method 내부에서 ADMIN을 다시 검사한다.

- 콘텐츠: `/api/champions`, `/api/champions/[id]`, `/api/highlights`, `/api/highlights/[id]`, `/api/images`, `/api/images/[id]`, `/api/gallery-images/[id]/home-display`
- 경기: `/api/matches`, `/api/matches/[id]`, `/api/matches/import-lol-result`
- 플레이어: `/api/players`, `/api/players/[id]`; 검색·밸런스 조회는 별도 공개/승인 사용자 계약
- 시즌: `/api/seasons`, `/api/seasons/[id]`, `/activate`, `/clone`, `/end`
- 이벤트: `/api/event-matches`, `/api/event-matches/[id]`, `/participants`, `/teams`, `/bracket`, `/matches/[id]/result`, `/complete`
- 멸망전: `/api/destruction-tournaments` 및 `[id]` 아래 참가자·팀·배정·경매·예선·본선·결과·교체·MVP·완료 API
- 팀 밸런스: draft·평가·레이아웃·시즌 신청은 승인 사용자, `/api/team-balance/feedback`은 ADMIN
- 로그: `/api/logs`는 SUPER

V2에서는 관리자 mutation을 모두 관리자 모듈의 application service로 모으고 경로명과 관계없이 같은 권한 정책을 적용한다.

## 5. 로딩·오류·빈 상태 감사

### 5.1 현재 확인된 상태

- `[확인]` `/admin/login`, `/admin`, `/admin/players`, `/admin/players/new`, `/admin/users`, `/admin/users/[id]`, `/admin/security` 등 클라이언트 화면은 자체 `loading/error/message` 상태가 있다.
- `[확인]` 목록형 SSR 화면 대부분은 “자료 없음” 문구를 렌더링한다.
- `[확인]` 동적 상세 일부는 `notFound()` 또는 404용 UI를 제공한다.
- `[확인]` 관리자 라우트 트리 전용 `loading.tsx`, `error.tsx`, `not-found.tsx`는 0개다.
- `[확인]` DB/read model 예외를 사용자용 오류 카드로 변환하지 않는 SSR 페이지가 다수다. 이 경우 Next의 일반 오류 처리에 의존한다.
- `[확인]` alias/redirect 페이지는 독립 로딩·빈·오류 상태가 필요하지 않지만 redirect 대상과 query 보존을 E2E로 검증해야 한다.

### 5.2 V2 공통 상태 계약

모든 비-redirect 관리자 페이지는 아래 다섯 가지 fixture를 가져야 한다.

1. `loading`: skeleton과 `aria-busy`, 주요 레이아웃 높이 유지
2. `ready`: 최소 2개 레코드와 주요 행동 성공
3. `empty`: 정상 200 + 명확한 빈 상태 + 생성/필터 초기화 CTA
4. `forbidden/not-found`: 403과 404를 구분하고 비밀 데이터 존재 여부를 노출하지 않음
5. `error/retry`: 5xx/네트워크 오류 메시지, 안전한 재시도, mutation 중복 방지

mutation 화면은 추가로 `idle -> confirming -> submitting -> success|field-error|conflict|server-error`를 검증한다. 삭제·초기화·전체 재계산·일괄 동기화는 확인 대화상자, idempotency/중복 클릭 방지, 감사 로그까지 완료되어야 한다.

## 6. V2 구현 순서

기존 `docs/ROADMAP.md`와 같은 순서를 사용한다.

1. **S01 인증·권한**: 로그인, 승인, 실제 TOTP 등록/재인증, HttpOnly 세션, `authVersion`, 테스트 fixture를 먼저 완성한다.
2. **S02 플레이어 등록부**: 플레이어 CRUD와 계정 목록/상세, 역할별 제어를 같은 슬라이스에서 만든다.
3. **S03 시즌·참가**: 시즌 관리와 참가 신청 검토를 함께 만든다.
4. **S04 경기·결과**: 관리자 경기 CRUD와 결과 접수 검토를 구현한다.
5. **S05 통계·랭킹**, **S06 팀 도구**: 재계산·AI/MMR·draft를 읽기/쓰기 계약으로 분리한다.
6. **S07 이벤트전**, **S08 멸망전**: 각 상태 전이를 application service로 구현한다.
7. **S09 구인·Kakao**: 운영 신청과 Kakao 자동화를 외부 부작용 어댑터와 분리한다.
8. **S10 미디어**, **S11 징계**: 비공개 자산의 목적 기반 권한을 함께 완성한다.
9. **S12 Riot**: 외부 호출을 fake adapter로 먼저 검수한 뒤 별도 비운영 sandbox에서 확인한다.
10. **S13 운영**: 대시보드·사이트 설정·감사 로그·백업·maintenance를 SUPER 정책으로 완성한다.
11. **S14 이관**: 81개 V1 페이지를 유지/통합/redirect/폐기 중 하나로 모두 판정하고, 권한·상태 매트릭스가 100% 통과한 뒤 전환한다.

## 7. 로그인 우회 없는 테스트 인증 fixture 설계

### 7.1 원칙

- 운영 DB, 운영 Blob, 운영 JWT/TOTP secret을 사용하지 않는다.
- `NODE_ENV === test`만으로 관리자 권한을 부여하는 백도어, 고정 쿠키 삽입, 서명 검증 생략, 특별 헤더 우회는 만들지 않는다.
- E2E도 실제 `/api/admin/login`을 호출해 HttpOnly 쿠키를 발급받는다.
- 테스트 계정과 TOTP secret은 격리된 일회성 DB에만 seed하고 실행 종료 후 DB 자체를 폐기한다.
- 테스트 시계 고정은 TOTP 생성기와 서버 검증기가 같은 test clock을 주입받는 방식으로 한다. 운영 구현에서 시스템 시계 검증을 생략하지 않는다.

### 7.2 합성 계정 세트

| Fixture | 역할/상태 | TOTP | 목적 |
|---|---|---|---|
| `e2e_user_approved` | USER / APPROVED | 없음 | 관리자 거부 확인 |
| `e2e_admin_enroll` | ADMIN / APPROVED | 미등록 | 강제 등록 흐름 확인 |
| `e2e_admin` | ADMIN / APPROVED | 활성 | 일반 관리자 전체 기능 |
| `e2e_super` | SUPER_ADMIN / APPROVED | 활성 | SUPER 전용 기능 |
| `e2e_admin_pending` | ADMIN / PENDING | 활성 | 승인되지 않은 관리자 거부 |
| `e2e_admin_revoked` | ADMIN / APPROVED | 활성, 이전 authVersion 토큰 | 세션 철회 확인 |
| `e2e_target_user` | USER / PENDING | 없음 | 승인/거절/역할 테스트 대상 |
| `e2e_target_admin` | ADMIN / APPROVED | 활성 | ADMIN의 교차 관리자 조작 거부 대상 |

비밀번호는 seed 과정에서 운영과 동일한 해시 함수로 만든다. TOTP secret은 테스트 실행 때 난수 생성하고 V2의 실제 암호화 저장소를 통과시킨다. 비밀번호·secret·storage state는 저장소나 테스트 로그에 출력하지 않는다.

### 7.3 Playwright 세션 준비

```text
global setup
  1. 일회성 DB 생성·migration
  2. 합성 계정/도메인 fixture seed
  3. 앱 기동
  4. 계정별 POST /api/admin/login
  5. 테스트 secret으로 현재 TOTP 생성 후 두 번째 로그인
  6. 브라우저가 받은 HttpOnly 쿠키를 role별 storageState로 저장
  7. 각 spec은 자신의 role state만 사용

teardown
  1. storageState 및 trace의 민감 헤더 마스킹 확인
  2. 일회성 DB·Blob emulator 폐기
```

TOTP 등록 spec은 `e2e_admin_enroll`로 비밀번호 로그인을 수행하고, 실제 `/2fa/status -> /setup -> /enable -> 재로그인` 순서를 그대로 따른다. TOTP 재사용 테스트는 같은 time-step 코드를 두 번 보내 두 번째 요청이 거부되는지 확인한다.

### 7.4 데이터 상태 fixture

각 관리자 영역에는 `empty`, `minimal`, `full`, `conflict`, `not-found`, `forbidden`, `external-failure` dataset을 둔다. Riot/Kakao/Blob은 repository/adapter fake가 명시적 응답을 반환하게 하며, 실제 외부 서비스나 운영 자격 증명을 호출하지 않는다.

## 8. 권한별 E2E 매트릭스

기호: `✓` 허용, `R:L` 로그인으로 redirect, `R:2FA` 등록 화면으로 redirect, `401/403` API 거부, `부분` 화면은 열리지만 SUPER action은 숨김+서버 403.

| 시나리오 | 익명 | USER | ADMIN 미등록 | ADMIN 미검증 | ADMIN 검증 | SUPER 검증 |
|---|---:|---:|---:|---:|---:|---:|
| `/admin/login` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 일반 `/admin/**` 페이지 | R:L | R:L | R:2FA | R:L | ✓ | ✓ |
| `/admin/security` | R:L | R:L | ✓ | R:L | ✓ | ✓ |
| 일반 `/api/admin/**` | 401 | 401 | 403 | 403 | ✓ | ✓ |
| 2FA status/setup/enable | 401 | 401 | ✓ | 403 | 제약에 따라 409 | 제약에 따라 409 |
| 본인 2FA disable | 401 | 401 | 403 | 403 | 현재 코드로 ✓ | 현재 코드로 ✓ |
| SUPER UI: ai-requests/logs/site-settings/bulk-link | R:L | R:L | R:2FA | R:L | 403/redirect | ✓ |
| SUPER API: role/reset/password/backup/logs/maintenance | 401/403 | 401/403 | 403 | 403 | 403 | ✓ |
| 일반 사용자 승인/거절 | 401 | 401 | 403 | 403 | ✓ | ✓ |
| ADMIN 계정 승인/거절 | 401 | 401 | 403 | 403 | 403 | ✓ |
| SUPER_ADMIN 대상 변경/삭제 | 401 | 401 | 403 | 403 | 403 | 403 |
| 관리자 dashboard | R:L | R:L | R:2FA | R:L | ✓(SUPER 카드 제외) | ✓ |
| users/players 상세 | R:L | R:L | R:2FA | R:L | 부분 | ✓ |
| Riot sync | 401 | 401 | 403 | 403 | 단일 ✓/전체 403 | 단일·전체 ✓ |
| Kakao recruit health | 401 | 401 | 403 | 403 | GET ✓/복구 403 | GET·복구 ✓ |
| private asset: 허용 목적 | 401 | 401 | 403 | 403 | ✓ | ✓ |
| private asset: 미등록 목적 | 401 | 401 | 403 | 403 | 403/404 | ✓ |
| 로그아웃 후 기존 페이지 재접근 | R:L | R:L | R:L | R:L | R:L | R:L |
| `authVersion` 증가 후 기존 storageState | R:L | R:L | R:L | R:L | R:L | R:L |

각 81개 페이지는 최소 `ADMIN 검증` 또는 `SUPER 검증`의 정상·빈·오류 상태를 실행하고, 반대 권한 1개를 반드시 실행한다. 모든 mutation API는 UI 숨김 여부와 별개로 직접 요청했을 때 서버가 403을 반환하는지 확인한다.

## 9. V2 완료 판정

관리자 영역은 다음이 모두 0일 때만 완료로 판정한다.

- 미분류 V1 관리자 페이지
- 소유 application service가 없는 관리자 mutation
- 권한 없는 직접 URL/API 접근 성공
- 로딩·빈·오류·404/403 상태가 없는 비-redirect 페이지
- 감사 로그가 없는 민감 mutation
- 운영 자격 증명이나 운영 데이터에 의존하는 테스트
- 로그인/TOTP/세션 검증을 우회하는 테스트 전용 코드
- 실패하거나 실행 근거가 없는 권한별 E2E 행

## 10. 주요 근거 파일

- `src/proxy.ts`
- `src/app/(admin)/admin/layout.tsx`
- `src/components/AdminShell.tsx`
- `src/components/AdminSidebar.tsx`
- `src/app/(admin)/admin/login/page.tsx`
- `src/app/api/admin/login/route.ts`
- `src/app/(admin)/admin/security/page.tsx`
- `src/app/(admin)/admin/security/_components/AdminSecurityTwoFactorClient.tsx`
- `src/app/api/admin/2fa/{status,setup,enable,disable}/route.ts`
- `src/lib/auth/requireAdmin.ts`
- `src/lib/auth/admin-security-policy.ts`
- `src/lib/auth/session.ts`
- `src/lib/auth/token.ts`
- `src/lib/auth/cookies.ts`
- `src/app/api/admin/**/route.ts`
- `src/components/admin/**`
- `src/components/riot/**`
