# K-LOL.GG V2 상태

- 기준: 이 문서가 포함된 `v2/greenfield-candidate-2026-09-07` 후보
- 현재 단계: V1 기능 계약을 V2 독립 코드로 재구현한 로컬 출시 후보
- V1 코드 복사: 없음. V1은 기능 목록과 동등성 대조 근거로만 사용
- V1 기준선: 블루·블랙 Vercel 기준선 저장소를 변경하지 않음
- 운영 Vercel 전환: 하지 않음
- 운영 데이터·비밀값·외부 서비스 호출: 사용하지 않음

## 확인된 상태

- 공개·계정·관리자 영역을 포함한 100개 `page.tsx`를 326개 화면 조건으로 캡처했다.
- 화면 증거는 데스크톱 156개, 태블릿 85개, 모바일 85개이며, 영역별로 공개 102개·계정 39개·관리자 179개·관리자 인증 6개다.
- 캡처 검증 결과 non-200 응답 0건, 화면 이슈 0건, 가로 넘침 0건이며 호환 진입점 redirect 18개도 계약대로 동작했다.
- 브라우저 품질 검증은 27/27 항목이 통과했고 보고된 이슈는 0건이다.
- 관리자 페이지는 익명·ACCOUNT 세션을 거부하고 ADMIN/SUPER_ADMIN 역할 경계를 유지한다.
- 계약 테스트 108개와 단위 테스트 396개, lint, TypeScript, Next.js production build가 통과했다.
- PostgreSQL 18에서 23개 migration의 fresh/upgrade 적용이 통과했으며 현재 head는 `0022_s09_kakao_operation_settings`다.
- 데이터베이스는 95개 테이블과 스키마 정의 검증 3,117건을 기준으로 확인했다.
- 실제 DB 기반 인증·계정·플레이어·시즌 HTTP, 로그인 제한, 비밀번호+TOTP, 쿠키, 역할, 보안 헤더, 로그아웃, 복구 훈련과 운영 fixture 차단이 통과했다.
- 추적 트리와 전체 Git 이력 비밀정보 검사 및 감사 로그 계약 검증이 통과했다.
- `npm audit --omit=dev --audit-level=moderate` 결과 운영 의존성 취약점은 0건이다.

전체 원본과 모음 이미지는 [`qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md`](./qa-evidence/v2-final-2026-09-07-r2/screenshots/README.md)에 있다.

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

## 운영 전 남은 조건

아래는 코드 결함으로 확인된 항목이 아니라 실제 운영 권한과 데이터가 있어야 확인할 수 있는 항목이다.

- Vercel 운영 환경변수와 PostgreSQL/Blob 연결 후 migration·backup/restore 훈련
- 실제 Riot RSO/API, Kakao 봇·서명 webhook, Vercel Blob 업로드·읽기·삭제는 로컬 계약과 fake adapter까지만 확인했으며 운영 자격증명과 외부 시스템에서는 아직 검증하지 않음
- 운영 도메인 CSP/WAF/관측/알림/cleanup scheduler 확인
- 사용자 최종 화면·문구·운영 수치 승인 후 V2를 Vercel 기본 코드로 전환

## 근거 있는 다음 패치 추천

1. 스테이징 환경에서 Riot·Kakao·Blob 실제 자격증명별 1회 성공/실패 smoke 증거를 만든다.
2. 운영 DB 익명화 복제본으로 V1→V2 migration dry-run과 rollback 시간을 측정한다.
3. Lighthouse와 Web Vitals를 운영과 같은 CDN 조건에서 수집해 예산을 고정한다.
4. 관리자 위험 작업의 복구 훈련과 감사 로그 알림을 실제 운영자 계정으로 확인한다.
5. 사용자 최종 검수 의견을 화면 번호 기준으로 받아 작은 후속 패치로 분리한다.
