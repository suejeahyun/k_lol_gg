# Reproducing the finite balance experiment

The preregistered protocol is [PROTOCOL.md](PROTOCOL.md). Scripts use the existing exact domain search; the shared kernel computes each layout's metrics once for three fixed selectors. No script creates a scheduler or modifies player/MMR/override records.

The snapshot is private and intentionally absent from Git. Obtain an explicitly authorized database environment locally; do not put its values on the command line or in logs. `snapshot.ts` checks the historical production target fingerprint and wraps every query in a read-only repeatable-read transaction. A future operator must review that evidence if the production target changes.

```powershell
npx tsx scripts/balance-research/freeze-baseline.ts
npx tsx scripts/balance-research/snapshot.ts <private-env-file>
npx tsx scripts/balance-research/prepare-rosters.ts
npx tsx scripts/balance-research/inventory-summary.ts
npx tsx scripts/balance-research/pilot.ts
npx tsx scripts/balance-research/run.ts tuning
```

Read only the completed tuning summary. If a candidate passes every fixed gate, run `run.ts validation`; freeze its selection before running `run.ts final`. If no candidate passes tuning, do not change a coefficient or inspect it on holdout data: run `run.ts validation --audit` and `run.ts final --audit` to finish the 1,000-roster **baseline-only coverage audit**. These audit stages store no rejected-candidate evaluation metrics.

After all stages, run `pilot.ts` once with no research workers running to record production-function latency and `publish-report.ts` to export aggregate evidence. For the captured 2026-10-18 snapshot, exact reproduction requires the same private `snapshot.json` and `rosters.json`, whose SHA-256 digest is published. A new database capture is a new study, even if the source commit is unchanged.

The canonical ten-player ID set is the deduplication unit; different games, player order, roles, team colors and variants do not increase the reported roster count. The kernel reports role placements before and after active constraints and separately subtracts strict/fallback revisits. Oracle/pilot/stability repeats are excluded from the unique placement total.

Anonymous UUID order and legacy ordering are independently preserved. `tests/team-balance-research-anonymization.test.ts` catches the misleading result that a legacy-order alias can cause at the canonical tie-break. `tests/team-balance-experiment-kernel.test.ts` compares the shared scan with production exhaustive search and a separate small-case enumeration.

Role penalties, role MMR, confidence, recent/old record weighting and player overrides remain baseline inputs unless independent pregame outcome evidence supports a later study. Existing missing-tier fallback scores remain calculation defaults; missing tiers are still null and their bottom-tier limits remain unverified.
