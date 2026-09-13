# K-LOL.GG V2 상태

## 2026-09-13 UI·운영 흐름 보완 운영 릴리스

- 최신 기능 커밋: `fd87e5f47703f92f09e1d4db70617ee2aa49fc92`
- 릴리스 tag: `ui-workflow-refinement-v1.0.1`
- 상태: 소스·빌드·격리 PostgreSQL·격리 Chromium 검증 및 **Vercel 운영 배포 완료**
- 운영 배포: `dpl_48xow9mENhg2BrSAZyFdBD4giJQZ` · main `477651491ce9feef404f5cba186602f1fb481036`
- 전체 화면: 105 pages / 339 captures / issue 0 / 종료 코드 0
- 테스트: 747개 중 746 PASS, DB 전용 1 skip, 실패 0
- 프로덕션 빌드: static generation 93/93
- DB migration·운영 데이터 변경·삭제: 없음
- 주요 범위: 티어 10종 + 우측 단계/LP 입력기, 멸망전 우승 사진 캐러셀, 구인 참가자 이름, 내전 시간 표시 제거, 이벤트 대회·멸망전 독립 경로

전체 근거는 [`qa-evidence/ui-workflow-refinement-2026-09-13/README.md`](./qa-evidence/ui-workflow-refinement-2026-09-13/README.md), 티어 입력 구조 정정 근거는 [`qa-evidence/tier-control-correction-2026-09-13/README.md`](./qa-evidence/tier-control-correction-2026-09-13/README.md)에 있다.

## 2026-09-13 전체 검증·보완 운영 릴리스

- 기능 커밋: `dfb0ccb787d1602804c2019c7a87594de77d1661`
- 릴리스 tag: `v2-completion-audit-v1.0.0`
- 상태: 소스·빌드·합성 PostgreSQL·격리 Chromium 검증 및 **Vercel 운영 배포 완료**
- 전체 화면: 103 pages / 335 captures / issue 0 / 종료 코드 0
- 테스트: 742개 중 741 PASS, DB 전용 1 skip, 실패 0
- Drizzle application schema: 102 tables / 165 foreign keys
- recovery physical schema: migration journal table 포함 103 tables
- 운영 DB 변경·데이터 삭제: 없음
- 남은 외부 확인: Vercel Cron 실제 실행, MessengerBot R 실기기 두 방, 실제 Riot RSO/API, 실제 Vercel Blob

전체 근거와 요구사항 판정은 [`qa-evidence/v2-completion-audit-2026-09-13/README.md`](./qa-evidence/v2-completion-audit-2026-09-13/README.md)에 있다. 아래 내용은 직전 Kakao R8 운영 배포 기록이다.

- 운영 검증 확인 시각: 2026-09-12T13:36:38.587Z (2026-09-12 22:36:38 KST)
- 운영 검증 기능 기준: `2f576d939498d664db8962460ddf12200623b5c9`
- 릴리스 tag: `kakao-v1-r8-player-edit-qa-v1.0.0`
- 현재 단계: Kakao R8 서버 대응·플레이어 편집 브라우저 QA 운영 배포 완료, 휴대폰 R8 설치 대기
- V1 코드 복사: 없음. V1은 기능 목록과 동등성 대조 근거로만 사용
- V1 기준선: 블루·블랙 Vercel 기준선 저장소를 변경하지 않음
- 운영 Vercel: 배포 `dpl_2hAKT6xuYPHsTTUgHuKzsZskMXxa`, 불변 URL `https://k-lol-7rtp1k24x-tjdmswo11-3715s-projects.vercel.app`, deployment `Ready`
- 운영 별칭: `https://k-lol-gg.vercel.app`, `2026-09-12T13:36:38.587Z`에 `/api/health` HTTP 200·JSON `status: ready` 확인
- 운영 DB: migration 38개, head `0037_swift_brood` 확인
- Kakao 구인·내전 입력 복구: `v1.0.1` 사이트·서버 운영 배포와 health 확인 완료
- 휴대폰 Kakao V1 strict R8: `PENDING_USER_INSTALL`; MessengerBot R 설치·실제 Kakao 송수신은 미확인

## 확인된 상태

- 현재 소스에는 공개·계정·관리자 영역을 포함한 105개 `page.tsx`가 있다.
- 새 Riot ID와 신규 플레이어를 함께 만드는 일반 사용자 가입은 같은 transaction에서 `APPROVED`·`ACTIVE`로 자동 승인된다. 기존 플레이어와 일치하는 Riot ID는 `PENDING` claim 수동 검토를 유지한다.
- 기존 `PENDING` 27개는 safe class와 action-time 조건을 확인한 뒤 별도 운영 작업으로 승인했고 `PENDING`은 27개에서 0개가 됐다. 연결 플레이어는 기존 `ACTIVE` 23개 유지·4개 재활성화로 모두 `ACTIVE`이며, 세션 6개 폐기, status history 27개, 계정 audit 27개, 플레이어 audit 4개를 기록했다. 기존 `REJECTED/SUSPENDED` 8개는 변경하지 않았다.
- 2026-09-07 시점의 100개 화면은 326개 조건(데스크톱 156, 태블릿 85, 모바일 85)에서 non-200·화면 이슈·가로 넘침 0건, 브라우저 품질 27/27 통과를 확인했다.
- 현재 105개 화면 339회의 익명·로그인·관리자·초기설정 실캡처를 합성 PostgreSQL과 격리 Chromium에서 완료했다. HTTP 오류·탐지 이슈·가로 넘침은 0건이고 자격증명과 운영 데이터는 산출물에 포함하지 않았다.
- 관리자 페이지는 익명·ACCOUNT 세션을 거부하고 ADMIN/SUPER_ADMIN 역할 경계를 유지한다.
- 현재 저장소 기준 최종 `npm run check`에서 전체 747개 중 746 pass·1 intentional skip, production build static generation 93/93가 통과했다.
- migration journal과 SQL은 각각 38개로 일치하고 `npm run test:db`가 통과했으며, 저장소 migration head는 `0037_swift_brood`이다.
- 같은 DB 검사에서 Kakao V4 P0 31/31과 recovery archive 검증이 통과했다.
- 운영 배포된 Kakao 입력 복구 릴리스는 구인 운영일을 KST 오전 6시 경계로 계산한다. 이는 이전 행을 삭제하는 초기화가 아니라 새 운영일 조회에서 이전 운영일 구인을 제외하는 논리 리셋이다.
- 구인 참가자 추가·수정·빈 슬롯 삭제·마감 성공 뒤 최신 전체 현황을 이어서 표시하며, 후속 현황 조회만 실패하면 mutation 성공은 유지하고 재조회 안내를 표시한다.
- 내전 신청 후보는 번호 뒤 공백, 들여쓰기, 대소문자 포지션, `ALL`, `Mid all`, `TOP, MID`, 이름만·부라인 공란, 중복 슬롯과 빈 행 취소를 처리한다. 정상 행은 반영하고 불완전·중복 플레이어 행만 확인 필요로 분리하며 `SITE`, `CONFIRMED`, 다른 방 신청은 보존한다.
- Kakao 릴리스 focused 검증은 V41 28/28, JavaScript 31/31, V1 strict 12/12, 내전 파서·서비스 22/22, 격리 PostgreSQL recruiting 계약 42/42가 통과했다. TypeScript·변경 범위 lint·Rhino 정적 검사도 통과했다.
- Kakao 내전 회차는 종목·정원·시작 시간·공지·revision을 별도 저장하고, 전체 양식의 명단 추가·수정·취소와 같은 transaction에서 갱신한다. `내전현황`과 상세는 저장값을 출력하며 기존 메타데이터 없는 회차만 협곡·21:00·10명 fallback을 사용한다.
- 내전 시간·공지 릴리스의 최신 검증은 V1 strict 14/14, parser/dispatcher 44/44, 전체 DB 계약 PASS이며 전체 `npm run check`는 725개 중 724 PASS·DB 전용 1개 intentional skip, production build 92 pages PASS다.
- 운영 Neon은 자동 만료 복구 분기 `pre-0037-inhouse-metadata-20260912` 생성 후 `0037_swift_brood`를 적용했다. 사후 조회에서 migration hash, 신규 테이블, 인덱스 3개와 세 종목 제약을 확인했다.
- SUPER_ADMIN은 사용자 계정 목록의 `관리자 지정`에서 APPROVED·미삭제 USER를 플레이어 연결 여부와 관계없이 ADMIN으로 변경할 수 있다. 역할 UI는 SUPER_ADMIN에게만 표시하고 일반 ADMIN은 입력 검증 전에 403으로 차단한다. 변경 시 기존 세션 폐기, revision·멱등성·감사 로그와 다음 관리자 로그인 TOTP 등록을 유지한다.
- 승인된 활성 사용자는 내 정보에서 Riot ID·현재 티어·최고 티어를 수정할 수 있고 ADMIN·SUPER_ADMIN도 플레이어 상세에서 같은 항목을 수정할 수 있다. 티어 전용 변경은 Riot 연결을 유지하고, Riot ID 변경은 같은 transaction에서 기존 연결 해제·PUUID 제거·작업 취소·감사를 수행한다. 저장 충돌은 모두 rollback하며 재연결은 등록부 Riot ID와 일치할 때만 허용한다.
- 운영 Neon production의 연결 중 Riot ID와 플레이어 등록 Riot ID가 다른 행은 읽기 전용 집계에서 0건이었다. 본인·관리자 중복 충돌 rollback과 멱등 replay는 link·job·audit의 revision과 건수까지 실제 PostgreSQL HTTP 테스트로 고정했다.
- 운영 Neon production은 비밀값 비노출 read-only preflight에서 기존 migration 35개, CONNECTED identity·owner 중복과 player-owner mismatch 0을 확인했다. 자동 만료 1일 복구 분기 `pre-0035-0036-20260911` 생성 후 `0035`·`0036`을 단일 transaction으로 적용했다.
- 운영 DB 사후 검증은 migration 37개, head hash `ebb200d8597ed63d270c2a66a7369dd67d3536c238939458aeed337028bdc63f`, Riot unique index 2개, player-owner index 1개, validated foreign key 1개이며 중복·mismatch는 모두 0이다.
- Drizzle TypeScript application schema와 최신 snapshot은 102개 테이블·165개 foreign key를 정의한다. 복구 훈련의 physical table 103개는 migration journal table을 포함한다.
- 2026-09-07 PostgreSQL 18 QA에서 DB 기반 인증·계정·플레이어·시즌 HTTP, 로그인 제한, 비밀번호+TOTP, 쿠키, 역할, 보안 헤더, 로그아웃, 복구 훈련과 운영 fixture 차단이 통과했다.
- 현재 추적·미추적 tree와 전체 Git 이력 비밀정보 검사, `verify:auth-http`가 모두 통과했다. `.private/`는 Git과 Vercel 업로드에서 제외된다.
- 고정 Data Dragon 기준 챔피언 173종·자산 346개와 여성 홈 가이드 68/68을 확인했다.
- 2026-09-07 검증에서 `npm audit --omit=dev --audit-level=moderate` 결과 운영 의존성 취약점은 0건이었다.

2026-09-07 화면 원본과 모음 이미지는 [`qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md`](./qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md)에 있다. 현재 V1 팀 밸런스·결과 공유 운영 릴리스는 [`qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md`](./qa-evidence/v2-v1-team-balance-release-2026-09-11/README.md), 최신 Kakao R8·플레이어 편집 QA 운영 릴리스는 [`qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/README.md`](./qa-evidence/kakao-v1-r8-player-edit-chromium-2026-09-12/README.md), 프로젝트 규칙·ERD·UI 재사용 검증은 [`qa-evidence/project-governance-erd-reuse-2026-09-11/README.md`](./qa-evidence/project-governance-erd-reuse-2026-09-11/README.md)에 있다.

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

최신 Kakao 기능 commit과 tag, Vercel deployment, 운영 별칭 health와 운영 DB head를 확인했다. 이 범위에서 사이트·서버 운영 반영을 확인했다. 아래 항목은 별도의 운영 권한·실기기·실데이터 근거가 있어야 완료로 판정한다.

이후 `account-auto-approval-v1.0.0`이 운영에 배포되어 신규 일반 사용자 자동승인과 `/signup`·`/start` 안내를 확인했다. 기존 승인 대기 27개는 앱 배포와 분리된 운영 작업으로 2026-09-12 05:52 KST 전후 승인했으며, 관리자 승인 대기·삭제 계정 승인 대기·미해결 claim은 각각 0개였다. 데이터 삭제와 스키마 migration은 없었다.

- 로그인·관리자 화면을 포함한 103개 페이지 335회 실캡처와 인증 사용자 흐름 전체 확인
- 승인된 기존 27개 계정의 로그인 실패율과 재문의 발생 여부 확인
- 자동 만료 1일 복구 분기 보존 시간 안의 DB 오류 지표와 무결성 위반 재확인
- V1 strict R8 private 전체 설치본의 SHA-256을 대조하고 MessengerBot R에 한 번에 교체한 뒤 `봇버전`과 실제 두 Kakao 방 송수신 확인
- R8에서 완전히 빈 내전 양식, 수정한 시간·공지·참가자와 빈칸 취소가 `내전현황`에 유지되는지 실제 방에서 확인
- 오래된 전체 내전 양식 충돌을 탐지할 revision/base-token을 V1 화면 호환 방식으로 설계
- Kakao V4 서명 HTTP는 운영 서버에서 확인했지만 실제 휴대폰 E2E, 재시도, 줄바꿈과 체감 지연은 미확인
- 실제 사용자 Riot RSO/API와 Vercel Blob 업로드·읽기·삭제 E2E는 완전히 검증하지 않음
- 운영 도메인 CSP/WAF/관측/알림/cleanup scheduler 확인
- V1 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없어 명시적 0/미제공 경로 사용

## 근거 있는 다음 패치 추천

1. Vercel Production에 별도 `CRON_SECRET`을 설정하고 기능 커밋을 배포한 뒤 alias health와 오전 6시 예약 호출을 기록한다.
2. 실제 휴대폰에서 R8 private 전체 설치본 hash와 `/봇버전`을 대조하고 두 Kakao 방 canary를 기록한다.
3. 승인된 실제 사용자 계정으로 Riot RSO와 Blob 업로드·읽기·삭제 E2E를 각각 기록한다.
4. 오래된 내전 전체 양식 충돌을 V1 표시 형식을 유지하는 revision/base token으로 탐지한다.
5. 개인정보 없이 팀 계산 실패율, 결과 복사 성공·실패율과 수동 교체율을 관측하고 목표값은 운영자 승인 후 정한다.
