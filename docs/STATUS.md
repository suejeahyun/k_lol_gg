# K-LOL.GG V2 상태

- 운영 자동승인 확인 시각: 2026-09-11T20:41:16.240Z (2026-09-12 05:41:16 KST)
- 운영 검증 기능 기준: `1c49070823f195b854fe84d523a5dd9ab4877049`
- 릴리스 tag: `account-auto-approval-v1.0.0`
- 현재 단계: 신규 일반 사용자 가입 자동승인 운영 반영 완료, 기존 승인 대기 27개 별도 운영 승인 완료
- V1 코드 복사: 없음. V1은 기능 목록과 동등성 대조 근거로만 사용
- V1 기준선: 블루·블랙 Vercel 기준선 저장소를 변경하지 않음
- 운영 Vercel: 배포 `dpl_9Aw98w2NNxkyjnybFqrCjv1yNbNo`, 불변 URL `https://k-lol-k43ds9jze-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`, health `ready`, `/signup`·`/start` 자동승인 안내 확인
- 운영 DB: migration 37개, head `0036_flowery_hairball` 확인
- Kakao 구인·내전 입력 복구 후보: 미커밋 소스와 로컬 검증만 완료, commit·tag·Vercel 배포는 `PENDING`
- 휴대폰 Kakao V41 R15/V1 strict R6: 산출물은 준비됐으나 MessengerBot R 설치·실제 Kakao 송수신은 미확인

## 확인된 상태

- 현재 소스에는 공개·계정·관리자 영역을 포함한 103개 `page.tsx`와 197개 API `route.ts`가 있다.
- 새 Riot ID와 신규 플레이어를 함께 만드는 일반 사용자 가입은 같은 transaction에서 `APPROVED`·`ACTIVE`로 자동 승인된다. 기존 플레이어와 일치하는 Riot ID는 `PENDING` claim 수동 검토를 유지한다.
- 기존 `PENDING` 27개는 safe class와 action-time 조건을 확인한 뒤 별도 운영 작업으로 승인했고 `PENDING`은 27개에서 0개가 됐다. 연결 플레이어는 기존 `ACTIVE` 23개 유지·4개 재활성화로 모두 `ACTIVE`이며, 세션 6개 폐기, status history 27개, 계정 audit 27개, 플레이어 audit 4개를 기록했다. 기존 `REJECTED/SUSPENDED` 8개는 변경하지 않았다.
- 2026-09-07 시점의 100개 화면은 326개 조건(데스크톱 156, 태블릿 85, 모바일 85)에서 non-200·화면 이슈·가로 넘침 0건, 브라우저 품질 27/27 통과를 확인했다.
- 이후 추가된 3개 화면을 포함한 현재 103개 화면 335회의 로그인·관리자 포함 실캡처는 아직 실행하지 않았다. 합성 fixture와 캡처 계획만 생성했다. 운영 공개 화면 10개 경로의 desktop·mobile·narrow 자동 품질은 30/30, issues 0, axe 위반 0이다. 로컬 전체 높이 캡처는 27/30 PASS이며 로컬 DB가 필요한 `/competitions` 3개 조건은 BLOCKED로 별도 유지한다.
- 관리자 페이지는 익명·ACCOUNT 세션을 거부하고 ADMIN/SUPER_ADMIN 역할 경계를 유지한다.
- 현재 저장소 기준 최종 `npm run check`에서 계약 테스트 347/347, 단위 테스트 707 pass·1 intentional skip, production build 92 app routes가 통과했다.
- migration journal과 SQL은 각각 37개로 일치하고 `npm run test:db`가 통과했으며, 저장소 migration head는 `0036_flowery_hairball`이다.
- 같은 DB 검사에서 Kakao V4 P0 31/31과 recovery archive 검증이 통과했다.
- 현재 미커밋 Kakao 릴리스 후보는 구인 운영일을 KST 오전 6시 경계로 계산한다. 이는 이전 행을 삭제하는 초기화가 아니라 새 운영일 조회에서 이전 운영일 구인을 제외하는 논리 리셋이다.
- 구인 참가자 추가·수정·빈 슬롯 삭제·마감 성공 뒤 최신 전체 현황을 이어서 표시하며, 후속 현황 조회만 실패하면 mutation 성공은 유지하고 재조회 안내를 표시한다.
- 내전 신청 후보는 번호 뒤 공백, 들여쓰기, 대소문자 포지션, `ALL`, `Mid all`, `TOP, MID`, 이름만·부라인 공란, 중복 슬롯과 빈 행 취소를 처리한다. 정상 행은 반영하고 불완전·중복 플레이어 행만 확인 필요로 분리하며 `SITE`, `CONFIRMED`, 다른 방 신청은 보존한다.
- Kakao 후보 focused 검증은 V41 28/28, JavaScript 31/31, V1 strict 12/12, 내전 파서·서비스 22/22, 격리 PostgreSQL recruiting 계약 42/42가 통과했다. TypeScript·변경 범위 lint·Rhino 정적 검사도 통과했다.
- 운영 Neon production은 비밀값 비노출 read-only preflight에서 기존 migration 35개, CONNECTED identity·owner 중복과 player-owner mismatch 0을 확인했다. 자동 만료 1일 복구 분기 `pre-0035-0036-20260911` 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다.
- 운영 DB 사후 검증은 migration 37개, head hash `ebb200d8597ed63d270c2a66a7369dd67d3536c238939458aeed337028bdc63f`, Riot unique index 2개, player-owner index 1개, validated foreign key 1개이며 중복·mismatch는 모두 0이다.
- Drizzle TypeScript 스키마와 최신 snapshot은 101개 테이블을 정의한다.
- 2026-09-07 PostgreSQL 18 QA에서 DB 기반 인증·계정·플레이어·시즌 HTTP, 로그인 제한, 비밀번호+TOTP, 쿠키, 역할, 보안 헤더, 로그아웃, 복구 훈련과 운영 fixture 차단이 통과했다.
- 현재 추적 트리의 비밀정보 검사와 `verify:auth-http`가 통과했다. 전체 Git 이력 검사는 이번 릴리스에서 다시 실행했다고 판정하지 않는다.
- 고정 Data Dragon 기준 챔피언 173종·자산 346개와 여성 홈 가이드 68/68을 확인했다.
- 2026-09-07 검증에서 `npm audit --omit=dev --audit-level=moderate` 결과 운영 의존성 취약점은 0건이었다.

2026-09-07 화면 원본과 모음 이미지는 [`qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md`](./qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md)에 있다. 현재 V1 팀 밸런스·결과 공유 운영 릴리스는 [`qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md`](./qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md), 최신 Kakao 구인·내전 입력 복구 릴리스 후보와 휴대폰 R15/R6 미설치 상태는 [`qa-evidence/kakao-recruit-input-recovery-2026-09-12/README.md`](./qa-evidence/kakao-recruit-input-recovery-2026-09-12/README.md), 프로젝트 규칙·ERD·UI 재사용 검증은 [`qa-evidence/project-governance-erd-reuse-2026-09-11/README.md`](./qa-evidence/project-governance-erd-reuse-2026-09-11/README.md)에 있다.

## 구현된 범위

- 밝고 가벼운 Community Breeze 디자인, 여성 챔피언 중심 브랜드 비주얼, 반응형 사용자/관리자 셸
- 가입 자동승인·로그인·TOTP·계정 수동 승인/복구/역할/플레이어 claim과 본인 Riot ID·티어 관리
- 플레이어 등록부, 시즌 참가, 경기 접수·OCR 검토·수정·게시·무효화·복구
- 시즌 통계·MMR·팀 밸런스·랜덤 팀·코인 토스
- 이벤트전·멸망전의 참가, 팀, 대진, 결과 정정, 경매, 교체, MVP 수명주기
- 구인·스크림·서명 Kakao 읽기/운영 폼/일일 종료 작업
- 하이라이트·갤러리·비공개 자산·징계 증거·Riot 연동 작업·운영 로그/설정
- PWA 설치와 V1 호환 redirect 진입점
- 외부 미디어 장애 시 깨진 이미지 대신 명시적인 복구 안내, YouTube 클릭 후 로드

## 운영 상태와 남은 조건

최종 기능 commit과 tag, Vercel deployment, 운영 별칭 health, 운영 DB head와 공개 브라우저 30조건을 확인했다. 이 범위에서 V1 팀 밸런스·결과 공유 앱의 운영 반영을 확인했다. 아래 항목은 별도의 운영 권한·실기기·실데이터 근거가 있어야 완료로 판정한다.

이후 `account-auto-approval-v1.0.0`이 운영에 배포되어 신규 일반 사용자 자동승인과 `/signup`·`/start` 안내를 확인했다. 기존 승인 대기 27개는 앱 배포와 분리된 운영 작업으로 2026-09-12 05:52 KST 전후 승인했으며, 관리자 승인 대기·삭제 계정 승인 대기·미해결 claim은 각각 0개였다. 데이터 삭제와 스키마 migration은 없었다.

- 로그인·관리자 화면을 포함한 103개 페이지 335회 실캡처와 인증 사용자 흐름 전체 확인
- 승인된 기존 27개 계정의 로그인 실패율과 재문의 발생 여부 확인
- 자동 만료 1일 복구 분기 보존 시간 안의 DB 오류 지표와 무결성 위반 재확인
- Kakao 구인·내전 입력 복구 기능 commit·tag·Vercel deployment와 운영 health 근거 연결
- R15/R6 중 설치 대상을 확정해 SHA-256 대조, MessengerBot R 교체, `/봇버전` 확인과 실제 두 Kakao 방 송수신
- Kakao V4 서명 HTTP는 운영 서버에서 확인했지만 실제 휴대폰 E2E, 재시도, 줄바꿈과 체감 지연은 미확인
- 실제 사용자 Riot RSO/API와 Vercel Blob 업로드·읽기·삭제 E2E는 완전히 검증하지 않음
- 운영 도메인 CSP/WAF/관측/알림/cleanup scheduler 확인
- V1 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없어 명시적 0/미제공 경로 사용

## 근거 있는 다음 패치 추천

1. 승인된 합성 세션으로 로그인·관리자 화면을 포함한 103개 페이지 335대상 회귀 캡처를 실행한다.
2. 1일 복구 분기 만료 전 운영 DB 오류 지표와 중복·mismatch 0건 유지 여부를 재확인한다.
3. Kakao 입력 복구 후보를 별도 기능 commit·tag·Vercel deployment에 연결한 뒤, 실제 휴대폰에서 선택한 R15/R6 산출물 hash와 `/봇버전`을 대조하고 두 Kakao 방 canary를 기록한다.
4. 승인된 실제 사용자 계정으로 Riot RSO와 Blob 업로드·읽기·삭제 E2E를 각각 기록한다.
5. 개인정보 없이 팀 계산 실패율, 결과 복사 성공·실패율과 수동 교체율을 관측하고 목표값은 운영자 승인 후 정한다.
