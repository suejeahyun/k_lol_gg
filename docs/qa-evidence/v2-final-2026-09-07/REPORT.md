# K-LOL.GG V2 최종 후보 QA 보고서

검수일: 2026-09-07 KST

## 화면 증거

- 발견된 `page.tsx`: 93개
- 캡처 조건: 146개
- 데스크톱: 120개
- 모바일: 26개
- HTTP 200: 146/146
- 자동 감지 문제: 0개
- 캡처 합계: 약 34.8 MB, 단일 최대 약 1.55 MB
- 원본/모음 인덱스: [`screenshots/README.md`](./screenshots/README.md)
- 기계 판독 결과: [`screenshots/index.json`](./screenshots/index.json)
- 캡처 계획: [`capture-plan.json`](./capture-plan.json)
- 격리 DB 동적 ID: [`fixtures.json`](./fixtures.json)

점검 항목은 문서 응답 상태, redirect 목적지, H1 존재, Next.js 오류 문구, 전체 문서 가로 넘침이다. 관리자 화면은 격리 PostgreSQL 18의 합성 SUPER_ADMIN/ACCOUNT 세션으로 열었다. 합성 비밀번호·TOTP·서명 키는 파일에 저장하지 않았다.

## 명령 검증

- `npm run check`: lint, TypeScript, 계약 89개, 단위 365개, production build 통과
- `npm run test:db`: PostgreSQL 18 fresh/upgrade migration, S01~S13 계약, DB 기반 auth/TOTP/player/season/account HTTP 통과
- `npm run verify:auth-http`: guard, rate limit, password+TOTP, cookie, ADMIN/SUPER_ADMIN 경계, 보안 헤더, logout, production fixture lockout 통과
- `npm run security:secrets`: 추적 트리와 전체 Git 이력 통과
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities

## 화면 검수 중 수정한 결함

- 캡처 서버가 PostgreSQL 공개 데이터 모드를 전달하지 않아 홈 공개 피드가 미연결로 보이던 문제
- 모바일 관리자 경기 표와 시즌 랭킹의 문서 가로 넘침
- 동적 form redirect 목적지의 캡처 판정 오류
- 외부 Blob이 없는 격리 환경에서 깨진 이미지 아이콘이 노출되던 문제
- YouTube iframe을 즉시 불러오던 성능/개인정보 비용
- ADMIN 전용 검증이 SUPER_ADMIN 전용 로그·사이트 설정을 잘못 기대하던 역할 행렬

## 판정

로컬 코드·격리 DB·비파괴 브라우저 범위에서 V2 출시 후보를 확인했다. 운영 Vercel에는 배포하지 않았고 실제 Riot/Kakao/Blob 자격증명은 사용하지 않았으므로 운영 반영 또는 외부 실연동 검증 완료로 판정하지 않는다.
