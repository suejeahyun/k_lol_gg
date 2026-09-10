# 검증 명령 결과

실행일: 2026-09-10 KST

| 검증 | 결과 | 근거 |
|---|---:|---|
| Phase 3-A 집중 + 기존 V4 dispatcher/classifier/gateway | PASS | 34/34 |
| V1 내전·스크림 golden + Phase 2 acceptance 묶음 | PASS | 52/52 + 49/49 |
| 전체 계약 테스트 (`npm run test:contracts`) | PASS | 254/254 |
| 전체 TypeScript 단위 테스트 (`npm run test:unit`) | PASS | 546/546 |
| TypeScript (`npm run typecheck`) | PASS | 오류 0 |
| 변경 파일 ESLint | PASS | 오류·경고 0 |
| 프로덕션 빌드 (`npm run build`) | PASS | Next.js 16.3.4, compile/typecheck/static pages 92/92 |
| `git diff --check` | PASS | whitespace 오류 0 |

## 집중 수용 항목

- V1 내전 모드 선택 답변 exact match
- 협곡·칼바람 전체 양식 exact match
- 전체 회차 현황·회차 상세 authoritative assistant 1회
- 협곡 명단 A→B→A·삭제·0명 authoritative snapshot
- 스크림 초기 양식·빈 현황·현황·상세 V40/V41 golden exact match
- 신규 스크림 서버 번호 사용 및 `tournamentId: null`, `legacyTournamentNumber: null` 전달
- 자동 번호를 durable receipt claim 이후 트랜잭션 안에서 한 번만 할당하고 replay 전에 재할당하지 않음
- 기존 스크림 수정 시 aggregate ID·revision·tournament binding 보존
- 동일 eventId 실제 mutation 1회, exact reply replay
- 불완전한 인식 양식은 mutation 없이 `INVALID_FORM`
