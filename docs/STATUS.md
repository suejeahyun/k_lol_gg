# K-LOL.GG V2 상태

- 직전 운영 확인 시각: 2026-09-10T17:07:30.124Z (2026-09-11 02:07:30 KST)
- 직전 운영 검증 기능 기준: `8dcbee424a0b8ca1f480858af00196daedfd0dff`
- 현재 단계: V1 기능 계약을 V2 독립 코드로 재구현한 공유 worktree 릴리스 후보. 운영 DB `0035`·`0036` 적용은 확인됐고 현재 앱은 운영 미배포
- V1 코드 복사: 없음. V1은 기능 목록과 동등성 대조 근거로만 사용
- V1 기준선: 블루·블랙 Vercel 기준선 저장소를 변경하지 않음
- 직전 운영 Vercel 기준선: 위 commit의 배포 `dpl_GFtbYMGfu2dZVSUMVALUTpb9vxWg`가 `Ready`
- 직전 운영 확인: immutable URL `https://k-lol-ekv491mea-tjdmswo11-3715s-projects.vercel.app`, production alias health `ready`, DB `select 1` 성공
- 현재 릴리스 후보 식별자: commit·tag·registry 배포 ID·운영 deployment ID 모두 보류 또는 미확인
- 휴대폰 Kakao R5: 산출물은 준비됐으나 MessengerBot R 설치·실제 Kakao 송수신은 미확인

## 확인된 상태

- 현재 소스에는 공개·계정·관리자 영역을 포함한 103개 `page.tsx`와 197개 API `route.ts`가 있다.
- 2026-09-07 시점의 100개 화면은 326개 조건(데스크톱 156, 태블릿 85, 모바일 85)에서 non-200·화면 이슈·가로 넘침 0건, 브라우저 품질 27/27 통과를 확인했다.
- 이후 추가된 3개 화면을 포함한 현재 103개 화면 전체의 동등한 캡처 재검증은 아직 기록하지 않았다. 2026-09-11 로컬 production 서버에서 공개 화면 10개 경로의 desktop·mobile·narrow 자동 품질 30/30과 axe 위반 0을 확인했다. 전체 높이 캡처는 27/30 PASS이며 로컬 DB가 필요한 `/competitions` 3개 조건은 BLOCKED다.
- 관리자 페이지는 익명·ACCOUNT 세션을 거부하고 ADMIN/SUPER_ADMIN 역할 경계를 유지한다.
- 현재 저장소 기준 최종 `npm run check`에서 계약 테스트 347/347, 단위 테스트 707 pass·1 intentional skip, production build 92 app routes가 통과했다.
- migration journal과 SQL은 각각 37개로 일치하고 `npm run test:db`가 통과했으며, 저장소 migration head는 `0036_flowery_hairball`이다.
- 같은 DB 검사에서 Kakao V4 P0 31/31과 recovery archive 검증이 통과했다.
- 운영 Neon production은 비밀값 비노출 read-only preflight에서 기존 migration 35개, CONNECTED identity·owner 중복과 player-owner mismatch 0을 확인했다. 자동 만료 1일 복구 분기 `pre-0035-0036-20260911` 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다.
- 운영 DB 사후 검증은 migration 37개, head hash `ebb200d8597ed63d270c2a66a7369dd67d3536c238939458aeed337028bdc63f`, Riot unique index 2개, player-owner index 1개, validated foreign key 1개이며 중복·mismatch는 모두 0이다.
- Drizzle TypeScript 스키마와 최신 snapshot은 101개 테이블을 정의한다.
- 2026-09-07 PostgreSQL 18 QA에서 DB 기반 인증·계정·플레이어·시즌 HTTP, 로그인 제한, 비밀번호+TOTP, 쿠키, 역할, 보안 헤더, 로그아웃, 복구 훈련과 운영 fixture 차단이 통과했다.
- 현재 추적 트리의 비밀정보 검사와 `verify:auth-http`가 통과했다. 전체 Git 이력 검사는 이번 릴리스 후보에서 다시 실행했다고 판정하지 않는다.
- 고정 Data Dragon 기준 챔피언 173종·자산 346개와 여성 홈 가이드 68/68을 확인했다.
- 2026-09-07 검증에서 `npm audit --omit=dev --audit-level=moderate` 결과 운영 의존성 취약점은 0건이었다.

2026-09-07 화면 원본과 모음 이미지는 [`qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md`](./qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md)에 있다. 현재 V1 팀 밸런스·결과 공유 릴리스 후보는 [`qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md`](./qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md), 최신 Kakao R5 소스 검증과 미설치 상태는 [`qa-evidence/kakao-v4-r5-form-defaults-2026-09-11/README.md`](./qa-evidence/kakao-v4-r5-form-defaults-2026-09-11/README.md), 프로젝트 규칙·ERD·UI 재사용 검증은 [`qa-evidence/project-governance-erd-reuse-2026-09-11/README.md`](./qa-evidence/project-governance-erd-reuse-2026-09-11/README.md)에 있다.

## 구현된 범위

- 밝고 가벼운 Community Breeze 디자인, 여성 챔피언 중심 브랜드 비주얼, 반응형 사용자/관리자 셸
- 가입·로그인·TOTP·계정 승인/복구/역할/플레이어 연결과 본인 Riot ID·티어 관리
- 플레이어 등록부, 시즌 참가, 경기 접수·OCR 검토·수정·게시·무효화·복구
- 시즌 통계·MMR·팀 밸런스·랜덤 팀·코인 토스
- 이벤트전·멸망전의 참가, 팀, 대진, 결과 정정, 경매, 교체, MVP 수명주기
- 구인·스크림·서명 Kakao 읽기/운영 폼/일일 종료 작업
- 하이라이트·갤러리·비공개 자산·징계 증거·Riot 연동 작업·운영 로그/설정
- PWA 설치와 V1 호환 redirect 진입점
- 외부 미디어 장애 시 깨진 이미지 대신 명시적인 복구 안내, YouTube 클릭 후 로드

## 운영 상태와 남은 조건

2026-09-10의 직전 Vercel 기준선과 공개 health/DB 연결은 확인했다. 2026-09-11 운영 DB `0035`·`0036` 적용과 사후 무결성은 확인했지만 현재 공유 worktree 릴리스 후보의 commit·tag·앱 배포 ID와 앱 운영 반영은 미확인이다. 아래 항목은 별도의 운영 권한·실기기·실데이터 근거가 있어야 완료로 판정한다.

- 운영 앱 배포 뒤 health, DB head, 팀 밸런스 계산·결과 복사·인증 경계 smoke
- 자동 만료 1일 복구 분기 보존 시간 안의 DB 오류 지표와 무결성 위반 재확인
- R5 산출물 SHA-256 대조, MessengerBot R 교체, `/봇버전` 확인과 실제 두 Kakao 방 송수신
- Kakao V4 서명 HTTP는 운영 서버에서 확인했지만 실제 휴대폰 E2E, 재시도, 줄바꿈과 체감 지연은 미확인
- 실제 Riot RSO/API와 Vercel Blob 업로드·읽기·삭제의 운영 성공/실패 smoke
- 운영 도메인 CSP/WAF/관측/알림/cleanup scheduler 확인
- 격리 DB·합성 세션 기반 `/competitions` 3개 조건과 현재 HEAD 103개 화면 335대상 회귀 캡처, 사용자 최종 문구·운영 수치 승인

## 근거 있는 다음 패치 추천

1. 현재 릴리스 후보의 commit·tag를 확정하고 같은 commit의 QA·앱 배포 ID를 연결한다.
2. 앱 배포 뒤 팀 밸런스 계산·결과 복사·인증 경계를 운영 smoke로 기록한다.
3. 1일 복구 분기 만료 전 운영 DB 오류 지표와 중복·mismatch 0건 유지 여부를 재확인한다.
4. 격리 DB·합성 세션으로 `/competitions`와 현재 103개 화면 335대상 회귀 캡처를 실행한다.
5. R5 휴대폰 설치 전 산출물 hash를 대조하고 설치 후 `/봇버전`과 두 방 canary를 기록한다.
