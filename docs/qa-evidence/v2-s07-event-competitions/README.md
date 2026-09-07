# V2 S07 event competitions QA evidence

검증일: 2026-09-07 KST

## 확인 대상

- 순수 이벤트 domain/command handler
- PostgreSQL aggregate, participant index, receipt, shared audit, outbox와 serializable UoW
- S06 team-balance rating adapter
- 공개 목록·상세·본인 신청 및 관리자 단계형 작업대 계약
- legacy event URL의 same-origin UUID allowlist redirect

## 집중 검증 명령

- `npm run typecheck`
- touched-file `eslint`
- `npm exec tsx -- --test tests/competition-events.test.ts tests/event-adapter.test.ts tests/user-navigation.test.ts`
- `node --test tests/event-ui-contract.test.mjs`
- `V2_DB_CONTRACT_SCOPE=events npm run test:db`
- `npm run db:generate`

## 이관됨

- 전체 build와 브라우저·시각·반응형 검증: S14
- 운영 DB migration과 Vercel 배포: 미수행
