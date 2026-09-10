# K-LOL.GG V2 상태

- 운영 확인 시각: 2026-09-10T17:07:30.124Z (2026-09-11 02:07:30 KST)
- 운영 검증 기능 기준: `8dcbee424a0b8ca1f480858af00196daedfd0dff`
- 현재 단계: V1 기능 계약을 V2 독립 코드로 재구현하고 Vercel Production에 반영한 운영 후보
- V1 코드 복사: 없음. V1은 기능 목록과 동등성 대조 근거로만 사용
- V1 기준선: 블루·블랙 Vercel 기준선 저장소를 변경하지 않음
- 운영 Vercel: 운영 검증 기능 기준과 같은 commit의 배포 `dpl_GFtbYMGfu2dZVSUMVALUTpb9vxWg`가 `Ready`
- 운영 확인: immutable URL `https://k-lol-ekv491mea-tjdmswo11-3715s-projects.vercel.app`, production alias health `ready`, DB `select 1` 성공
- 휴대폰 Kakao R5: 산출물은 준비됐으나 MessengerBot R 설치·실제 Kakao 송수신은 미확인

## 확인된 상태

- 현재 소스에는 공개·계정·관리자 영역을 포함한 103개 `page.tsx`와 197개 API `route.ts`가 있다.
- 2026-09-07 시점의 100개 화면은 326개 조건(데스크톱 156, 태블릿 85, 모바일 85)에서 non-200·화면 이슈·가로 넘침 0건, 브라우저 품질 27/27 통과를 확인했다.
- 이후 추가된 3개 화면을 포함한 현재 103개 화면 전체의 동등한 캡처 재검증은 아직 기록하지 않았다.
- 관리자 페이지는 익명·ACCOUNT 세션을 거부하고 ADMIN/SUPER_ADMIN 역할 경계를 유지한다.
- 현재 저장소 기준 계약 테스트 313개와 단위 테스트 619개가 통과했다.
- migration journal과 SQL은 각각 35개로 일치하고 정적 일관성 검사가 통과했으며, 저장소 migration head는 `0034_kakao_room_capability_profiles`다.
- Drizzle TypeScript 스키마와 최신 snapshot은 101개 테이블을 정의한다.
- 2026-09-07 PostgreSQL 18 QA에서 DB 기반 인증·계정·플레이어·시즌 HTTP, 로그인 제한, 비밀번호+TOTP, 쿠키, 역할, 보안 헤더, 로그아웃, 복구 훈련과 운영 fixture 차단이 통과했다.
- 추적 트리와 전체 Git 이력 비밀정보 검사 및 감사 로그 계약 검증이 통과했다.
- 2026-09-07 검증에서 `npm audit --omit=dev --audit-level=moderate` 결과 운영 의존성 취약점은 0건이었다.

2026-09-07 화면 원본과 모음 이미지는 [`qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md`](./qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md)에 있다. 최신 Kakao R5 소스 검증과 미설치 상태는 [`qa-evidence/kakao-v4-r5-form-defaults-2026-09-11/README.md`](./qa-evidence/kakao-v4-r5-form-defaults-2026-09-11/README.md), 프로젝트 규칙·ERD·UI 재사용 검증은 [`qa-evidence/project-governance-erd-reuse-2026-09-11/README.md`](./qa-evidence/project-governance-erd-reuse-2026-09-11/README.md)에 있다.

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

Vercel 서버 배포와 공개 health/DB 연결은 확인했다. 아래 항목은 별도의 운영 권한·실기기·실데이터 근거가 있어야 완료로 판정한다.

- 운영 DB의 실제 migration head 재조회와 익명화 복제본 migration·backup/restore 훈련
- R5 산출물 SHA-256 대조, MessengerBot R 교체, `/봇버전` 확인과 실제 두 Kakao 방 송수신
- Kakao V4 서명 HTTP는 운영 서버에서 확인했지만 실제 휴대폰 E2E, 재시도, 줄바꿈과 체감 지연은 미확인
- 실제 Riot RSO/API와 Vercel Blob 업로드·읽기·삭제의 운영 성공/실패 smoke
- 운영 도메인 CSP/WAF/관측/알림/cleanup scheduler 확인
- 현재 HEAD 103개 화면의 데스크톱·태블릿·모바일 회귀 캡처와 사용자 최종 문구·운영 수치 승인

## 근거 있는 다음 패치 추천

1. R5 휴대폰 설치 전 산출물 hash를 대조하고 설치 후 `/봇버전`과 두 방 canary를 기록한다.
2. 운영 DB migration head를 값 노출 없이 재조회하고 익명화 복제본으로 V1→V2 dry-run과 복구 시간을 측정한다.
3. 스테이징 환경에서 Riot·Blob 실제 자격증명별 1회 성공/실패 smoke 증거를 만든다.
4. 현재 103개 화면의 회귀 캡처와 Lighthouse/Web Vitals를 운영과 같은 CDN 조건에서 수집한다.
5. 관리자 위험 작업의 복구 훈련과 감사 로그 알림을 실제 운영자 계정으로 확인한다.
