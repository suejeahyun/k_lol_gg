# Anchored policy study

Read [PROTOCOL.md](PROTOCOL.md) first. This study reuses the authorized anonymous snapshot and excludes both prior studies' 2,000 combinations, including nine-player overlaps. It creates no scheduled work and performs no database queries or mutations.

Prepare the fixed 1,000-roster manifest and prior-study 16-roster pilot, run synthetic tests, review the sources, and lock all execution inputs **before** candidate outcomes:

```powershell
node --import tsx scripts/balance-policy/prepare.ts
npx tsx --test tests/team-balance-policy*.test.ts
node --import tsx scripts/balance-policy/prepare.ts --lock
node --import tsx scripts/balance-policy/pilot.ts initial
node --import tsx scripts/balance-policy/run.ts tuning
node --import tsx scripts/balance-policy/stability.ts
```

Only an accepted tuning stage and accepted fixed stability audit permit validation. Only accepted validation permits final. Each stage and audit has an exclusive start marker; changed source/input hashes or repeated runs are rejected. Do not modify parameters after reading outcomes.

```powershell
node --import tsx scripts/balance-policy/run.ts validation
node --import tsx scripts/balance-policy/run.ts final
```

On rejection, stop candidate evaluation. Reserved but uncomputed combinations are not counted as completed experiments. No baseline-only coverage run is automatic. When workers and other CPU-intensive activity stop, run the final standalone pilot and publish completed stages:

```powershell
node --import tsx scripts/balance-policy/pilot.ts final
node --import tsx scripts/balance-policy/publish-report.ts
```

The final timing gate compares complete two-pass runtime with the unchanged public baseline function on the same fixed 16 prior-study inputs. Each pilot warms both engines once on its first fixed input (excluded from statistics), then alternates baseline-first and candidate-first measurement order. Worker timings are diagnostics because concurrent work can affect them. The stability audit uses 16 prespecified tuning combinations, both signs of a 0.1 effective-score perturbation, reversed inputs, swapped colors and all 45 pair swaps. These repetitions never inflate the unique roster or placement denominator.

Private rows retain anonymous chosen layouts for exact per-role tier verification and role-change analysis. Public reports contain aggregates and anonymous case metrics, without original identities or full participant lists. Reproduction requires the same authorized private snapshot and earlier manifests in a fresh isolated checkout. Earlier study artifacts must not be modified.
