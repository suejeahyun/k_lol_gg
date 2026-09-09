# Public Match Runtime DB Evidence

- Started (UTC): `2026-09-09T02:14:48.7926431Z`
- Ended (UTC): `2026-09-09T02:15:09.3205554Z`
- Target commit: `24d71c0c7a6c0e02948013df8f1e8cc8847b0982`
- Node: `v24.14.1`
- PostgreSQL: `18.3`
- Command: `V2_DB_CONTRACT_SCOPE=matches npm run test:db`
- Exit code: `0`
- Staged raw log SHA-256: `2d6e655fc5dbaf09f3965e64d389d7a1be54240538b3174ce5abef3771ec892f`

## Isolation and cleanup

- The harness used a loopback-only disposable PostgreSQL database with the `klol_v2_test_` prefix.
- The raw log confirms isolated PostgreSQL 18 cluster start, stop, and disposable workspace removal.
- No connection string, password, token, or real data is recorded.

## Explicit runtime assertions

- `not-a-uuid`: expected `400`, actual `400`.
- Valid UUID while the match service is unavailable: expected `503`, actual `503`.
- Published fixture match: expected `200`, actual `200`; participant count: `10`; KDA preserved: `true`.
- Null champion image fallback: `https://ddragon.leagueoflegends.com/cdn/26.18.1/img/champion/Httpchampion1.png`.
- Unknown valid UUID: expected `404`, actual `404`.
- Database match snapshot suite: 7 passed, 0 failed.

## Integrity checks

- `git diff --check`: passed.
- QA evidence secret-pattern scan: no matches.
