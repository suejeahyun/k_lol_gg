# 멸망전 1.3.0 · 공개 점수표

상태: 운영 배포 후보. source와 배포 ID는 실제 배포 확인 후 기록한다.

- 모든 모드의 공개 상세에 점수표 메뉴 추가.
- 협곡: 기존 38개 티어·LP 구간과 5포지션의 기준값 및 지급 포인트 190개를 전체 대조하여 일치 확인. 팀별 저장된 경매 포인트와 선수별 낙찰가 표시.
- 칼바람·증바람: 등급 기준, 선수별 평가·전적·최소 입찰가·주장 예산·출처·표본 표시.
- 계산 규칙, 확정 예산, 권한, 저장 DTO, SQL 스키마 변경 없음. migration head `0046_overconfident_robbie_robertson` 유지.

## 검증

- `npm run check`: lint 오류 0, 타입·ERD·계약445·단위1010 PASS/1 SKIP·홈 이미지·운영 빌드 PASS. [전체 검사](check.txt).
- 현재 트리 비밀정보 및 기존 릴리스 증거 검사 PASS.
- 격리 PostgreSQL 계약 1 PASS. 390/1440px 비로그인 12화면 HTTP 200, 오류·페이지 가로 넘침 없음. 협곡 모집·주장 선정·완료 및 칼바람·증바람·평가 대기 확인.
- [기능·브라우저 검증](../../qa/destruction-score-table-2026-09-27/README.md), [패치 노트](../../patch-notes/2026-09-27-destruction-score-table.md).

## 배포와 복구

기존 운영은 `3eb3ad691082ec8f3fa45544eae391f1e63a3480`, READY `dpl_2SQVM4rcoFjTkKXXkFe6LdczwdTM`이다. 새 source를 고정하여 production 후보를 `--skip-domain`으로 만든 뒤 점수표·health·인증 경계를 확인하고 승격한다. 문제 발생 시 이전 READY 배포를 재승격한다. 운영 데이터 변경이나 DB migration은 없다.
