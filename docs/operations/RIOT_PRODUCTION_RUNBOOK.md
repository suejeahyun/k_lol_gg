# Riot production activation runbook

This runbook prepares configuration; it does not authorize a deployment or a live Riot request.

## Preconditions

1. Obtain an approved Riot production application and register exactly `V2_PUBLIC_ORIGIN + /api/me/riot/rso/callback` as its RSO callback.
2. Apply the migration chain through `0020_s12_riot_production_adapters.sql` and take the normal database backup first.
3. Generate independent secrets for `RIOT_RSO_STATE_SECRET`, `RIOT_ENCRYPTION_KEYS`, and `OPERATIONS_JOB_SECRET`. Do not reuse session or TOTP material.
4. Configure every Riot variable documented in `.env.example`, set `V2_PUBLIC_DATA_SOURCE=postgres`, then enable the persisted `riotIntegration` site feature.
5. Set `V2_RIOT_INTEGRATION_ENABLED=true` last. Any missing, malformed, or inconsistent value keeps the runtime unavailable.

## Key rotation

Add a new 32-byte base64url key under a new identifier in `RIOT_ENCRYPTION_KEYS`, set `current` to it, and retain prior keys while old protected identities exist. New writes use `current`, while reads select the key identifier embedded in the ciphertext. Re-encrypt old rows before removing a prior key. Never change a key's bytes in place.

## Scheduler request

The scheduler sends `POST /api/internal/jobs/riot-sync` with body `{}` and the existing operations job signature headers. The signature path must be exactly `/api/internal/jobs/riot-sync`; the timestamp window and nonce replay checks are enforced before claim and finish.

## Safe verification and rollback

- Before activation: run `npm run typecheck`, the Riot unit tests, and `V2_DB_CONTRACT_SCOPE=riot npm run test:db` against an isolated test database.
- After activation: verify unavailable/ready UI state, one owner RSO link, one bounded sync, and audit/outbox records without logging request headers or protected columns.
- Rollback: set `V2_RIOT_INTEGRATION_ENABLED=false` first. Keep schema and encrypted rows intact. Do not drop tables or delete links as part of application rollback.
- A 429 is retried only after the provider's bounded `Retry-After`; repeated 5xx responses remain retryable operational failures. A 404 is a non-retryable identity lookup miss.

## Capture conditions for final QA

The final capture plan should distinguish these states without duplicating the same screen:

- `/admin/riot?tab=accounts`: heading/data-state for account inventory and account-status filtering.
- `/admin/riot?tab=sync`: heading/data-state for queued/running/completed/failed sync work and retry affordance.
- `/admin/riot?tab=logs`: heading/data-state for API, synchronization, and audit log filters.
- bulk-link: selection count, preview/dialog, confirmation, and result state.

Those tab-specific read models and final captures remain a separate UI parity follow-up; production adapter activation does not imply they are verified.
