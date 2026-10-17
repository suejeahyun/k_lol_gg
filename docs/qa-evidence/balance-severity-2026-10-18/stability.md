# Severity candidate stability audit — 2026-10-18

The fixed audit completed after the 500-roster tuning stage rejected `EXCESS_FIRST`. This result does not reopen tuning or authorize candidate deployment. Production ranking remains the baseline.

- Source: frozen production snapshot, baseline commit `131abbf777a331b056a96ab587957cf654387a78`.
- Input lock: `d7bed367e4ee67073bd745fd14106aeba91f2dea682b7ef79882f8f385361a54`.
- Reproduction: `npx tsx scripts/balance-severity/stability.ts`, after the matching completed tuning stage. The script refuses changed inputs and an existing output report.
- Evidence: [stability.json](stability.json). Only anonymous roster/player labels appear in the report.
- Selection: lexicographically first two tuning roster IDs from each of eight predefined strata; 16 real-player recombinations, zero observed matches. Selection was fixed before tuning results.
- Denominators: 16 unique rosters, 720 unique unordered player-pair swaps, 1,440 engine-specific swap evaluations. Reversed input, color changes, repeated searches and perturbations do not add roster cases.

## Implementation invariants and sensitivity

| Check | BASELINE | EXCESS_FIRST |
|---|---:|---:|
| Independent full-search selection matches stored tuning selection | 16/16 | 16/16 |
| Reversed input preserves selection and score | 16/16 | 16/16 |
| Team colors preserve symmetric metrics and reverse signed gaps | 16/16 | 16/16 |
| Pair swaps accepted / rejected by existing policy | 424 / 296 | 424 / 296 |
| Actual effective-score +0.1 verified | 16/16 | 16/16 |
| Perturbation changes selected layout | 3/16 (18.75%) | 3/16 (18.75%) |
| Perturbation independent outcomes: improved / identical / mixed / worsened | 1 / 13 / 2 / 0 | 1 / 13 / 2 / 0 |
| Largest team-gap increase after perturbation, rescored without noise | +7.53 | +7.53 |
| Largest maximum-lane-gap increase after perturbation | 0 | 0 |
| Largest accepted-swap team-gap increase | +112.65 | +112.65 |
| Largest accepted-swap maximum-lane-gap increase | +57.70 | +57.70 |

Inputs and frozen source hashes were verified again after execution. The +0.1 seam changes only computed effective scores in disposable module copies. It does not change personal MMR, administrator overrides, registered roles or snapshot records. Perturbed choices are rescored with the original frozen scores.

The invariant checks passed, but the nonzero sensitivity is a remaining limitation. Both engines produced the same three perturbation changes in this subset. These findings do not establish robust behavior across all possible small changes or actual match outcomes.

## Revealed discontinuities

- `S-090106e78f92` (mixed tiers): five seats change. Team gap increases 0.93 → 8.46 (+7.53), while maximum lane gap decreases 18.34 → 13.87 and bottom gap decreases 7.16 → 0.91. This is a mixed tradeoff, not an unqualified improvement.
- `S-0803a986088d` (main-role congestion): four seats change. ADC gap increases 0.02 → 12.44 (+12.42), large-gap lanes increase 1 → 2, and lane-gap sum increases by 25.66. Team gap decreases 5.50 → 1.76 and bottom gap decreases 11.09 → 3.22. The perturbed player occupies RED TOP in the original selection: adding 0.1 changes that original lane's absolute gap from 14.92 to 15.02, crossing the unchanged large-lane threshold. This supplies a concrete sensitivity example; no threshold adjustment was tested afterward.
- `S-0a018df1210a` (unknown tier): four seats change. The independent comparison vector improves only team gap, 14.93 → 14.29; rule 5 nevertheless changes from 0 → 1. This explains why an independent-vector improvement is not interchangeable with the original complete ranking. All three perturbation cases worsen the original ranking diagnostic, which is disclosed separately.

The JSON's `worstPerturbationCases` field sorts only by maximum-lane increase. Every such increase was zero or negative, so that list can include unchanged cases. The cases above use the complete per-roster records and disclose the largest team and individual-bottom changes instead of interpreting that limited sort as a general worst-case ranking.

Pair swaps exchange real participants and can also change their role penalties. Their large score differences are sensitivity observations, not numerical noise or predicted win-rate changes. Policy-rejected swaps are excluded from accepted-swap magnitude statistics and are counted separately.

## Runtime scope

| Engine | Timed original searches | Median | p95 | Maximum |
|---|---:|---:|---:|---:|
| BASELINE | 16 | 82.61 ms | 3,263.26 ms | 3,263.26 ms |
| EXCESS_FIRST | 16 | 97.64 ms | 3,279.40 ms | 3,279.40 ms |

The remaining baseline coverage audit ran concurrently. These are contended, no-warmup timings of each roster's initial full search, not the wall time of all stability checks. Use the separate final single-process pilot for runtime comparisons. No sealed validation/final candidate results were inspected by this audit, and no production records were created or modified.
