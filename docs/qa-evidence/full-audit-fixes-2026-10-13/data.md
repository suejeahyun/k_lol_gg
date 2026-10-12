# Data reliability fixes — 2026-10-13

Scope: D1 historical match/MMR references, D2 MMR bind-parameter limits, D3 scheduled Riot throughput. Worktree `full-audit-fixes-20261013`; no operating database writes or deployment performed by this subtask.

## D1 — preserve the historical source of each MMR generation

- `0048_mmr-game-source-history` adds `mmr.match_game_sources`, keyed by generation and original game ID. Result events reference this immutable history instead of the editable live `competition.match_games` row. No result events are deleted, rewritten, or cascaded.
- Existing events are backfilled using only known event facts: generation, game ID, match ID, game number and earliest event timestamp. They are labeled `LEGACY_EVENT_REFERENCE` with null source JSON. Historical KDA cannot be recovered from the old schema and is not invented from today's games.
- New generations persist exact ledger inputs (`orderKey`, winner and each participant's ID, team, position and KDA) as `LEDGER_SNAPSHOT`. Existing generations remain append-only through title/result edits, removed games, voids and replay.
- The projection takes shared locks on selected published series; match mutations already take exclusive row locks before replacing games. This keeps the selected ledger stable until the generation commits. A newly published series after the read boundary remains queued for the next catch-up.
- Public MMR readers and team balance readers continue selecting the current published profile generation. They do not join historical events to editable live games.
- Rolling deployment compatibility: a database BEFORE INSERT trigger supplies only an identity reference for an older event-only writer. `ON CONFLICT DO NOTHING` preserves full snapshots supplied by the new writer. Migration is forward-only; retain 0048 when rolling back application code. A database down migration would reintroduce the unsafe live-game FK and is not supported.

## D2 — atomic bounded persistence

- All variable-size MMR writes are batched inside the existing generation transaction: profiles, five-position profiles, game sources, result events and consumer receipts.
- A batch contains at most 1,000 profiles/events/sources/receipts; the associated position insert has at most 5,000 rows. Maximum parameter count is 30,000 for the position insert, below PostgreSQL's 65,535 wire limit. The original 410-game failure contained 65,600 parameters in a single event insert.
- Ledger lookups pass one typed UUID-array parameter using `sql.param`, avoiding another unbounded list of individual bind parameters.
- The new DB regression inserts a complete synthetic 410-game ledger (4,100 events), then injects a server-side failure in the final batch of a second generation. It verifies rollback of events, snapshots, profiles, receipts, run and outbox, followed by successful retry.

## D3 — bounded sequential Riot drain

- Each five-minute cron invocation admits up to four sequential jobs, stopping on idle, retry wait, partial/failure outcomes, or a 20-second admission budget. Every claim receives its own signed nonce. No provider calls are parallelized and retry timing in the existing queue remains authoritative.
- At the maximum successful batch rate, cron admission capacity rises from 72 to 288 jobs per six hours. This is a conditional ceiling, not a freshness guarantee: slow providers, retry/backoff, failures and queue size lower achieved throughput. Separate signed consumers can also process jobs.
- The route's existing maximum duration is 60 seconds. The 20-second admission budget reserves time for the last admitted job's existing bounded rank/analytics fetches and database completion. It is not a hard cancellation of a claimed job and does not guarantee completion under every infrastructure delay.
- Responses contain processed counters and allowlisted stopping outcomes; they do not echo provider bodies or account identifiers. Completed-job counts survive a later failure.

## Verification

- Focused unit run: `npx tsx --test tests/riot-activation.test.ts tests/mmr*.test.ts` — **21 passed, 0 failed**.
- TypeScript: `npx tsc --noEmit` — passed after fixing a discriminated return type in the test stub.
- ESLint on changed MMR/Riot/schema/harness/test files — passed with no findings.
- ERD generation — 112 application tables, 174 foreign keys; generated from schema.
- Isolated PostgreSQL regression uses only `TEST_DATABASE_URL` injected by `scripts/test-db/run-data-contracts.ts`, plus guarded randomized sibling databases. PostgreSQL 18 binaries: `C:\Program Files\PostgreSQL\18\bin`. No production connections or browser runners were used by this subtask.
- Initial focused DB run caught incorrect Drizzle array interpolation before release; fixed with explicit `sql.param`. A concurrent startup attempt also encountered the existing harness cleanup status-4 race; no test assertions ran in that attempt.
- Root comprehensive DB run subsequently passed the existing MMR projection contract and the new fresh/0047-upgrade/old-writer and title/KDA/removal/void contracts. The 410-game insert succeeded; a test fixture used inconsistent AMENDED outbox order fields before the rollback phase. That fixture is corrected.
- Final focused `V2_DB_CONTRACT_SCOPE=mmr npm run test:db` rerun: **4 passed, 0 failed, 0 skipped across 2 files**. The three new history/migration/size/rollback contracts passed (13.885 s), followed by the existing full MMR projection contract (4.605 s). Harness reported the cluster stopped and disposable workspace path removed.

## Independent security change review

Read-only source review of the concurrent auth/media changes found no concrete deployment blocker. Callback binding verifies exact state/session/token hash and rechecks a live ACCOUNT session. Media attachment commands require READY assets under row locks, preventing a normal new attachment from racing deletion of DELETE_PENDING assets; cleanup excludes all known media/evidence references. Publication is rechecked before derivative cache use, and in-flight renders/active decoders have bounded admission. Daily successful cleanup remains limited to 20 assets and 1,000 sessions; this is not a claim that arbitrary backlogs drain in one run. Security test and deployment evidence belong to the security/coordinating task.

Release, production migration and recovery evidence are owned by the coordinating task. These local checks alone do not establish production deployment or a live-provider throughput result.
