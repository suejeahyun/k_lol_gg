# V2 통합 개선 계획 수립 근거

## 범위

- 기준 커밋과 Vercel 배포 상태 확인
- 공개 운영 API·페이지 읽기 전용 smoke
- 기능/UI, DB·외부 연동, QA·릴리스 병렬 읽기 감사
- 상세 실행 순서·인수 조건·롤백 조건 문서화

## 확인 결과

- 기준 커밋: `38edbfd5681c486484855a2fbc039968304bb06c`
- GitHub CI: 성공
- Vercel 배포: 성공
- 공개 health·챔피언·랭킹·플레이어·신청·팀 밸런스: HTTP 200
- 운영 챔피언 30개: `imageUrl` non-null 0개
- 운영 OG 이미지 origin: `http://localhost:3000` 확인
- 운영 통계에서 V1 시즌과 경기·게임·참가 집계 확인
- Riot 기능 플래그: 비활성
- 관리자 익명 접근: 로그인 이동 또는 API 401
- 현재 규모: page 102개, route 257개, migration 26개
- 가독성 검토 후보: 9~11px 또는 0.6~0.74rem CSS 규칙 203곳

## 산출물

- `docs/plans/V2_MASTER_IMPROVEMENT_PLAN_2026-09-08.md`

계획서에는 우선순위, 단계별 예상 시간, 역할 분배, 운영 안전장치, 화면별 디테일, 권한·멱등성·재시도·감사·복구, 최종 완료 정의와 롤백 조건을 포함했다.

## 변경·운영 상태

- 기능 코드 변경: 없음
- 운영 DB 변경: 없음
- 운영 데이터 삭제: 없음
- 외부 Riot/Kakao/Blob 호출: 없음
- 계획 문서만 GitHub `main`에 반영

## 남은 위험

- 운영 DB migration head와 backup/PITR는 관리자/provider 권한 없이 미확인
- 실제 ACCOUNT·ADMIN·SUPER_ADMIN 인증 UAT 미수행
- MessengerBot R V41 실제 기기 반영 미수행
- 최신 커밋 기준 전 페이지 캡처 미수행

## 다음 권장 작업

1. 운영 DB head·checksum·backup/PITR를 읽기 전용으로 고정한다.
2. production origin과 챔피언 이미지 repair를 첫 패치로 진행한다.
3. Riot 과거 snapshot과 현재 연결 상태를 분리한다.
4. 플레이어 목록 projection과 공개 enum 한글화를 보완한다.
5. 실제 계정·봇·Blob E2E 후 최신 전체 화면을 한 번에 검증한다.
