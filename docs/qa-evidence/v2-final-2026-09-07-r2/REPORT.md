# K-LOL.GG V2 최종 출시 후보 R2 QA 보고서

검수일: 2026-09-07 KST
검수 범위: 로컬 코드, 격리 PostgreSQL 18, optimized production build, 비파괴 브라우저 검수
운영 반영 상태: **미반영** — Vercel 운영과 기존 V1은 변경하지 않음

## 최종 판정

V2 R2는 로컬·격리 환경에서 실행한 코드 검사, 데이터 계약, 인증, 복구, 보안, 브라우저 품질 및 전체 화면 캡처를 모두 통과했다. 이 검수 범위에서 HTTP 비정상 응답, 자동 감지 화면 문제, 가로 넘침 및 알려진 차단 결함은 0건이다.

다만 실제 Riot, Kakao, Vercel Blob, OpenAI 자격증명과 외부 호출은 사용하지 않았고 운영 데이터 이전도 수행하지 않았다. 따라서 이 보고서는 **V2 출시 후보의 로컬 검증 완료**를 뜻하며, 운영 배포·실연동·데이터 이전 완료를 뜻하지 않는다.

## 변경 핵심

- V1 코드를 그대로 복사하지 않는 V2 독립 구조에서 공개·계정·관리자 기능과 legacy 이동 경로를 구성했다.
- 계정, 플레이어, 시즌 신청, 경기 접수·검수, 통계·MMR, 팀 밸런스 추천, 이벤트전·멸망전, 구인·Kakao, 미디어, 징계, Riot 및 운영 설정을 역할별 작업 화면으로 연결했다.
- 관리자 세션, TOTP, 역할 경계, 최신 revision, 멱등성 키, 감사 원장 및 비공개 자산 접근 경계를 적용했다.
- 사이트 설정의 회원가입, 경기 접수, 팀 밸런스, Kakao 도움말, Riot 및 AI 기능 스위치를 실제 UI·API 경계에 연결했다.
- Riot, Kakao, Vercel Blob 및 OpenAI 운영 어댑터는 설정이 불완전하면 fail-closed로 동작하도록 유지했다.
- 데스크톱·태블릿·모바일 반응형 화면, 오류·빈 상태의 문서 제목, 접근성, 레이아웃 이동, 가로 넘침 및 비공개 이미지의 격리 QA fixture를 보완했다.

## 자동 검증 결과

| 검증 | 확인 결과 |
| --- | --- |
| `npm run check` | 계약 테스트 108개, 단위 테스트 396개, lint, TypeScript, optimized production build 통과 |
| PostgreSQL 18 | migration 23개, head `0022_s09_kakao_operation_settings`, 테이블 95개, schema definition 3,117개 |
| 복구 훈련 | archive 405,435 bytes, SHA-256 `91d37460bc557ecb5d98d19ffeea0cd2a1cae87c825db1bce2dc5cff45b60811`; 정확한 테이블 수, fixture 관계, FK, migration replay no-op, 실패 migration rollback 모두 확인 |
| 브라우저 품질 | 27/27 경로, issues 0 |
| 전체 화면 캡처 | 326개; desktop 156, tablet 85, mobile 85 |
| 세션별 화면 | public 102, account 39, admin 179, admin-auth 6 |
| 캡처 HTTP·레이아웃 | non-200 0, issues 0, overflow 0, 검토된 redirect 18 |
| 인증 HTTP | guard, 제한, 비밀번호+TOTP, cookie, 역할, 보안 헤더, logout 계약 통과 |
| DB schema drift | `npm run db:generate` 변경 없음 |
| 비밀정보 | 추적 트리와 Git 이력 검사 통과 |
| 운영 의존성 | `npm audit --omit=dev --audit-level=moderate` 취약점 0 |

## 화면 및 기계 판독 증거

- [화면 캡처 안내와 전체 목록](./screenshots/README.md)
- [326개 캡처 기계 판독 결과](./screenshots/index.json)
- [캡처 계획](./capture-plan.json)
- [격리 DB 동적 fixture](./fixtures.json)
- [브라우저 품질 결과](./browser-quality.json)
- [CLS 진단 결과](./browser-quality-cls-diagnostic.json)
- 공개 화면 모음: [1](./screenshots/contact-public-01.png), [2](./screenshots/contact-public-02.png), [3](./screenshots/contact-public-03.png)
- 계정 화면 모음: [1](./screenshots/contact-account-01.png), [2](./screenshots/contact-account-02.png)
- 관리자 화면 모음: [1](./screenshots/contact-admin-01.png), [2](./screenshots/contact-admin-02.png), [3](./screenshots/contact-admin-03.png), [4](./screenshots/contact-admin-04.png), [5](./screenshots/contact-admin-05.png)
- 관리자 인증 화면 모음: [1](./screenshots/contact-admin-auth-01.png)

캡처는 합성 계정과 일회성 격리 DB를 사용했다. 합성 비밀번호, TOTP, 서명 키 및 외부 서비스 비밀정보는 증거 파일에 저장하지 않았다.

## 운영 상태와 남은 외부 위험

### 확인됨

- V2 코드와 migration은 로컬 출시 후보 브랜치에만 존재한다.
- 기존 V1 코드와 운영 Vercel은 변경하지 않았다.
- 격리 PostgreSQL의 fresh install, migration replay, 데이터 계약 및 복구가 통과했다.
- 외부 자격증명이 없을 때 운영 연동 기능은 실패를 숨기지 않고 닫힌 상태를 반환한다.

### 미확인

- 실제 Riot API/RSO 자격증명, 할당량, callback 및 동기화 결과
- 실제 Kakao 봇 서명 키, 허용 방·발신자 및 webhook 전달 결과
- 실제 Vercel Blob private 저장소의 업로드·조회·삭제 결과
- 실제 OpenAI API 자격증명, 모델 응답, 사용량 및 비용 제한 결과
- V1 운영 데이터의 V2 이전, 대조, rollback 및 운영 트래픽 전환 결과
- Vercel preview/production의 서버리스 제한, 환경 변수, 도메인·쿠키 및 예약 작업 결과

## 다음 패치 권장

1. 별도 Vercel preview에서 Riot·Kakao·Blob·OpenAI 테스트 자격증명으로 최소 권한 smoke test를 수행하고 결과를 외부 연동 증거로 분리한다.
2. 익명화한 V1 데이터 복제본으로 V2 migration·건수·FK·핵심 합계 대조와 rollback dry-run을 반복 가능하게 만든다.
3. preview 도메인에서 로그인 callback, 쿠키, 서버리스 timeout, scheduled job, outbox 재시도와 알림을 검증한다.
4. 배포 전후 핵심 지표와 실패 알림 기준을 고정하고 복구 훈련을 정기 자동화한다.
5. 번호가 붙은 326개 화면을 기준으로 실제 운영자·사용자 최종 UAT와 키보드·스크린리더 수동 점검을 기록한다.
