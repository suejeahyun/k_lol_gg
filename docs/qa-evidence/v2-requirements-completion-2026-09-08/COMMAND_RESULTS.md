# 검증 명령 결과

검증일: 2026-09-08 (KST)

| 명령·검증 | 결과 |
| --- | --- |
| `npm run check` | 통과 |
| ESLint | 통과 |
| TypeScript typecheck | 통과 |
| 계약 테스트 | 124/124 통과 |
| 단위 테스트 | 456/456 통과 |
| Next.js production build | 통과, 정적 페이지 91개 생성 |
| `npm run test:db` | 통과 |
| PostgreSQL 임시 클러스터 | PostgreSQL 18, 26개 migration 적용, head `0025_s10_champion_image_urls` |
| DB 정의·계약 | 96개 테이블, 3,147개 schema definition 검증 |
| 전체 DB 도메인·인증·TOTP·플레이어·시즌·계정 HTTP | 통과 |
| DB 복구·cleanup | 통과, 임시 클러스터 제거 |
| `npm run verify:auth-http` | 통과 |
| `npm run security:secrets` | 추적 파일과 전체 Git 이력에서 고신뢰 비밀 패턴 없음 |
| `git diff --check` | 공백 오류 없음 |
| 대상 화면 캡처 | 15/15 HTTP 200, 가로 넘침 없음, 자동 점검 이슈 없음 |

## 화면 검증 범위

- 홈: 데스크톱·모바일
- 플레이어 목록·상세
- 경기 상세
- 랜덤 팀
- 팀 밸런스 생성·초안: 데스크톱·모바일
- 팀 밸런스 초안이 연결된 경기 결과 접수
- 내 계정·징계: 데스크톱·모바일
- 이벤트전 상세
- 멸망전 상세: 데스크톱·모바일

## 증거의 한계

- 로컬 임시 PostgreSQL과 합성 계정·합성 경기 데이터로 검증했다.
- 운영 DB, 운영 Vercel, 실제 카카오·Riot 외부 서비스는 변경하거나 공격적으로 점검하지 않았다.
- `완료`는 소스와 로컬 비파괴 검증을 의미하며 운영 반영을 의미하지 않는다.

