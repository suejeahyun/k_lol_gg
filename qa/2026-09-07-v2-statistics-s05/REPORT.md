# V2 S05-A 통계 연결 QA 증거

- 기준: `main` `f76c52f`
- 구현 커밋: `9cc25bc7ddd980868bcab201ff53391eb55dd6d4`
- 범위: 통계 공개/관리자 조회, 공개 API/UI, 플레이어 프로필 연결, 수동 재계산 command, bounded worker primitive
- 운영 반영: 미반영

## 확인된 검사

1. `npm run typecheck` — PASS
2. 변경 파일 대상 ESLint — PASS, 오류·경고 0
3. `npx tsx --test tests/statistics-domain.test.ts tests/statistics-projection-service.test.ts tests/statistics-connection.test.ts tests/legacy-proxy.test.ts tests/user-navigation.test.ts` — PASS, 18/18
4. `git diff --check main...HEAD` — PASS

## 이번 조각에서 실행하지 않은 검사

- PostgreSQL 계약: DB 스키마 변경이 없어 생략
- 브라우저 캡처·전체 페이지 QA: 마지막 통합 검증으로 연기
- production build·전체 회귀: 마지막 통합 검증으로 연기
- 운영 배포·스케줄러 실행: 범위 밖, 실행하지 않음

## 남은 위험

- 수동 재계산의 실제 PostgreSQL session/receipt/audit 경로는 다음 통합 DB 계약에서 확인해야 한다.
- 랭킹·관리자 화면의 실제 모바일/데스크톱 레이아웃은 최종 브라우저 QA가 필요하다.
- MMR 순수 재생 엔진은 main에 있으나 저장 projection과 공개/관리자 API·UI가 아직 연결되지 않았다.

## 다음 패치 추천

1. MMR projection 저장·receipt·재생 worker를 통계 generation과 연결한다.
2. 공개 `/rankings/mmr`와 관리자 MMR 상태/보정 이력을 안전 DTO로 연결한다.
3. S05 통합 PostgreSQL 계약에서 수동 재계산의 If-Match·멱등 replay·감사 원자성을 검증한다.
4. 최종 브라우저 QA에서 랭킹/프로필/관리자 상태의 ready·empty·error·권한 화면을 캡처한다.
