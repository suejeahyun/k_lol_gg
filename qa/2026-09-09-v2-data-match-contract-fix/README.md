# v2 data match contract fix

- Base: `origin/main` at `b63753a1e053321ba089b397c36475635e087f56`
- Scope: public match 404 contract, Data Dragon portrait fallback, and public Riot snapshot states.
- Validation commands: `npm test`, `npm run typecheck`, `npm run build`.
- Isolated fixture: `V2_DB_CONTRACT_SCOPE=matches npm run test:db` creates and removes a loopback PostgreSQL 18 cluster, then verifies `400` invalid ID, `503` unavailable service, `200` published 10-player/KDA detail with Data Dragon fallback, and `404` for a missing UUID.
- Deployment state: this folder records isolated pre-merge QA evidence only. No production database mutation, deployment, or backfill is included.
