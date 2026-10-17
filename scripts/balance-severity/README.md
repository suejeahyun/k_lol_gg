# Finite severity comparison

This study compares the production baseline at `131abbf777a331b056a96ab587957cf654387a78` with one preregistered `EXCESS_FIRST` selector. Read [PROTOCOL.md](PROTOCOL.md) before execution. Raw identities and connection credentials are not inputs to these scripts. The authorized anonymous snapshot remains ignored under `.private/` and is not distributed with the repository.

The preceding study's 1,000 combinations are excluded. Preparation retains 1,000 new real-player combinations, with eight strata of 125 and a 500/250/250 split. Nine-player overlap with the preceding or new study is also excluded. This evaluates unseen combinations in the same player pool, not unseen players or future match outcomes.

Run from the repository root:

```powershell
node --import tsx scripts/balance-severity/prepare.ts
npx tsx --test tests/team-balance-severity-gates.test.ts tests/team-balance-severity.test.ts
node --import tsx scripts/balance-severity/prepare.ts --lock
node --import tsx scripts/balance-severity/pilot.ts initial
node --import tsx scripts/balance-severity/run.ts tuning
```

Inspect only the completed tuning summary. If accepted, run validation without `--audit`; otherwise terminate candidate selection and run validation with `--audit` for baseline coverage. Apply the same rule to final. The runner enforces that decision, immutable input hashes and single execution per stage. No parameter changes follow a failed stage.

```powershell
node --import tsx scripts/balance-severity/run.ts validation
node --import tsx scripts/balance-severity/run.ts final
```

For a rejected candidate, replace the corresponding remaining commands with `run.ts validation --audit` and `run.ts final --audit`. Audit mode does not calculate the rejected selector. After every worker finishes:

```powershell
node --import tsx scripts/balance-severity/pilot.ts final
node --import tsx scripts/balance-severity/publish-report.ts
```

Preparation and result files refuse overwrites. Reproduction belongs in a fresh isolated checkout with the same authorized anonymous snapshot and prior manifest. Preserve the original study artifacts. Private result rows retain anonymous selected assignments, independent metrics, exact bottom-role tier verification, counts of inspected placements and oracle timings. Public reports include aggregates and anonymous case metrics, without player identities or assignments.

Candidate and baseline share each exhaustive layout calculation. Eight predetermined cases per evaluated stage, one per stratum, plus each worker's first strict and relaxed case additionally compare the selected baseline with the original full-search API and the candidate with a separately patched full-search source. Oracle and timing repetitions are excluded from unique roster and placement totals. The independent metrics retain the original player scores and operational thresholds; the candidate's own excess objective and previous complete ranking vector are diagnostic rather than independent evidence of improvement.
