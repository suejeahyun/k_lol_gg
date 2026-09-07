# S12 Riot production adapter parity

## Verified locally

- Account-v1 resolves a Riot ID to a PUUID. Summoner-v4 and League-v4 produce the solo-rank projection.
- Requests have a bounded timeout, bounded response body, explicit 404/429/5xx classification, and preserve a bounded `Retry-After` value.
- RSO state is HMAC-bound to its persisted state identifier and digest. The callback only uses the configured exact URI and returns to the canonical account page.
- Accepted authorization codes are represented only by SHA-256 digest. The recovered Riot identity is AES-256-GCM protected with a key identifier; access tokens, codes, and plaintext PUUIDs are not stored.
- If the final account-link transaction fails after a successful exchange, an exact-code retry uses the short-lived encrypted result. A different code for the same state is rejected.
- The internal sync consumer requires a timestamped HMAC request and consumes its nonce in PostgreSQL. Claim and finish are bound to the same verified request.
- Runtime wiring is all-or-nothing and also rechecks the database feature flag. Fixture adapters remain restricted to the existing fixture-auth guard.

The focused unit tests use fake `fetch` implementations only. The PostgreSQL contract uses a disposable local cluster and deliberately forces a stale final link transaction to prove recovery.

## Deliberately unverified

- Riot production approval, credentials, network reachability, and live provider payloads were not used.
- Scheduler delivery and deployment configuration were not changed or exercised.
- Riot does not provide an idempotency key for the OAuth token exchange. A process failure after Riot returns a token but before the encrypted result transaction commits is therefore not provably recoverable. The implemented contract closes the larger application-transaction retry window after the result has committed.

## Sources and routes

- Riot Account-v1, Summoner-v4, and League-v4 endpoints: <https://developer.riotgames.com/apis>
- Riot response and rate-limit guidance: <https://developer.riotgames.com/docs/portal>
- RSO integration guidance: <https://developer.riotgames.com/docs/riot-sign-on>
- Owner callback: `/api/me/riot/rso/callback`
- Signed consumer: `/api/internal/jobs/riot-sync`

The schema delta is `0020_s12_riot_production_adapters.sql`. It only adds `riot.rso_exchange_results`. Its migration journal/snapshot must be generated after the reserved Kakao `0018` and `0019` migrations are integrated.
