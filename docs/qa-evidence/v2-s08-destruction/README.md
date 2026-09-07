# V2 S08 멸망전 검증 증거

검증일: 2026-09-07 KST

## 확인된 범위

- 0012 operations 이후 `0013_s08_destruction.sql`을 두 번 적용해도 안전합니다.
- 20명 신청·승인과 포지션별 4명, 4팀·팀별 5명 불변조건을 확인했습니다.
- 결정적 seed 경매, 예선 BO1, 본선 BO3, 결과 정정과 하위 결과/MVP 무효화를 확인했습니다.
- 선수 교체 전 경기의 10인 로스터 스냅샷이 유지됩니다.
- 10인 MVP 재투표와 모든 경기 MVP 확정 후 완료 조건을 확인했습니다.
- 공개 DTO에 계정 소유자, 경매 seed·잔여 포인트가 노출되지 않습니다.
- 성공한 mutation마다 receipt·audit·outbox가 같은 개수로 저장되고 aggregate hard delete가 거부됩니다.

## 실행 결과

- `npm run typecheck`: PASS
- focused ESLint: PASS
- domain/application/HTTP/navigation unit: PASS
- UI source contract: PASS
- `V2_DB_CONTRACT_SCOPE=destruction npm run test:db`: PASS
- `npm run db:generate`: 71 tables, no schema changes

전체 Next.js build와 브라우저 캡처는 S14 전수 QA로 미뤘습니다. 운영 배포는 하지 않았습니다.
