# Independent manifest review — 2026-10-18

The new policy study's roster manifest passed a separate read-only audit. This review covers input membership, uniqueness, overlap, stratification and split assignment only. It does not evaluate candidate layouts, recommendation improvements or deployment readiness. Candidate calculations performed for this review: **0**.

- Manifest SHA-256: `4c768e77fa7a9c803c111b1332e8a6cdc902d5ff1906f565d2af86e1fa2e3f0a`.
- Snapshot SHA-256: `aecb6d6f5767f21ec1225427aea5c32e53a657bd4ede4319b50d0e498cd5e75d`.
- Eligible frozen pool: 138 distinct anonymous players; 113 known current tiers and 25 missing/unrecognized tiers. Mixed-tier sampling uses 38 players from each end of the known-tier ordering.
- New manifest: 1,000 distinct ten-player sets, all real-player recombinations; every participant belongs to the eligible pool. No repeated player within a roster. Canonical anonymous roster ID mismatches: 0.
- Earlier manifests: 2,000 distinct sets; both recorded manifest hashes and snapshot links match their original files.

| Independently checked overlap | Result |
|---|---:|
| New roster exactly repeats an earlier set | 0 |
| New/old roster pairs compared | 2,000,000 |
| New/old pairs sharing at least nine players | 0 |
| Largest observed new/old intersection | 7 |
| New/new roster pairs compared | 499,500 |
| New/new pairs sharing at least nine players | 0 |
| Cross-split pairs sharing at least nine players | 0 |
| Largest observed new/new intersection | 6 |

The overlap audit used direct pairwise set intersections, independently of the generator's nine-player subset-key rejection. Input order and team colors are absent from the canonical set identity and cannot create additional cases.

| Stratum | Total | Tuning | Validation | Final | Predicate failures |
|---|---:|---:|---:|---:|---:|
| Similar tier | 125 | 63 | 31 | 31 | 0 |
| Mixed tiers | 125 | 63 | 31 | 31 | 0 |
| Main-role congestion | 125 | 62 | 32 | 31 | 0 |
| Jungle shortage | 125 | 62 | 31 | 32 | 0 |
| Support shortage | 125 | 63 | 31 | 31 | 0 |
| Low sample | 125 | 63 | 31 | 31 | 0 |
| Unknown tier | 125 | 62 | 32 | 31 | 0 |
| Broad pool | 125 | 62 | 31 | 32 | 0 |
| **Total** | **1,000** | **500** | **250** | **250** | **0** |

Predicates were recomputed directly from retained player fields: all-known current tiers with range ≤2; five from each fixed lower/upper third; at least six sharing one MAIN role; no registered JGL or SUP respectively; at least six with a known recorded game count below five; at least three unknown current tiers; or unrestricted eligible-pool membership. Similar-tier ranges are 1–2 major levels, mixed-tier ranges 3–8. Low-sample roster appearances contain no missing game-count fields, so this verification did not substitute zero for unknown experience.

The audit independently recomputed the salted SHA-256 order within each stratum and the balanced stage cycle. Split-assignment mismatches: 0. No generator, kernel, selector, result runner or candidate evaluator was executed. Only aggregate findings are retained here; no original names, identifiers or credentials were emitted or saved.

Reproduction requires the access-controlled frozen snapshot and three manifests. Check their hashes, derive each roster's sorted ten-ID set, count pool membership and all pairwise intersections, recompute the listed predicates, then sort each stratum by SHA-256 of `balance-policy-20261018-v1|<sorted ten IDs>` and verify the global repeating `tuning, tuning, validation, final` assignment. This verifies held-out combinations within the same player pool, not independence of players or time periods.

## Independent tuning-result audit

After tuning completed, a separate audit re-evaluated all **1,000 stored baseline/candidate layouts from the 500 tuning rosters** with the frozen production evaluator. It did not import the study's metrics, gates, kernel or selector and did not run a new recommendation search. A separate tier parser and direct arithmetic recomputed each lane, team/bottom gap, MAIN/SUB/AUTO assignment, registered-role deviation, burden, current-tier unknown slot, viable carry-lane count, total effective score, raw assigned confidence and absent role-sample count. Original rule diagnostics were checked against the frozen evaluator; this does not independently redefine the six rules.

- Frozen versus current evaluator: 1,000 complete result comparisons passed. Input-order reversal: 1,000 stored-layout evaluations passed. Team-color reversal: 1,000 stored-layout evaluations passed, including exchanged directional line counts and unchanged rule/unknown diagnostics. These checks concern evaluation of the recorded layouts, not another full-search optimality proof.
- Every layout preserved the original ten participants and one of each role per team. Registered preferences came from the retained player records. All 500 input objects remained byte-equivalent after evaluation; no player score, override, role or snapshot was changed.
- All 19 locked source hashes, three frozen baseline hashes, snapshot/manifests and the recorded result lock matched. Input-lock SHA-256: `99a9af89459704c6749cede3ce25b3e70249c71218e03cc7bb0ee5bdf78b73f4`.
- Every stored metric and all overall/subgroup distribution statistics matched independent arithmetic. No change to the bottom-violation count → excess → unregistered-role prefix was found. Every protected coordinate and derived quality measure was nonworsening; each ADC/SUP unknown count and the minimum of both teams' viable TOP/MID/ADC lines was checked separately.
- Role-matching counts were recomputed with a bitmask dynamic program, independently of the search enumerator. Strict search applied to 245 rosters and fallback to 255. The same placements inspected by both passes were counted once.

| Independently verified count | Result |
|---|---:|
| Unique tuning rosters | 500 |
| Unique candidate placements | 462,889,392 |
| First-pass inspections | 462,898,192 |
| Second-pass inspections | 462,889,392 |
| Raw inspections, including both passes | 925,787,584 |
| Protected-vector improved / identical / mixed / worsened | 129 / 371 / 0 / 0 |
| Material gains under the frozen threshold | 24 / 500 (4.8%) |
| New full-search runs in this audit | 0 |
| Validation/final result files opened or present | 0 |

The second inspection pass is not a second set of participant combinations. The first pass also includes 8,800 strict placements revisited through fallback. Counting either as additional unique cases would overstate the experiment.

| Independently recomputed metric | Baseline mean | Candidate mean | Individual worsening |
|---|---:|---:|---:|
| Maximum lane gap | 25.74546 | 25.74546 | 0 / 500 |
| Sum of five lane gaps | 62.21186 | 62.17746 | 0 / 500 |
| Team gap | 7.10734 | 5.88754 | 0 / 500 |
| Bottom combined gap | 8.43420 | 8.39526 | 0 / 500 |
| Total position burden | 7.600 | 7.600 | 0 / 500 |
| Burden imbalance | 1.212 | 1.112 | 0 / 500 |
| Minimum viable carry lanes across both teams | 1.378 | 1.398 | 0 / 500 |
| Total effective score | 525.88406 | 525.89278 | 0 / 500 |
| Assigned roles with null/zero samples | 6.110 | 6.112 | 1 / 500, maximum +1 |
| Raw assigned confidence mean | 0.07349042 | 0.07349042 | 1 / 500, maximum −0.01 |

Overall confidence stayed equal because one roster gained 0.01 and another lost 0.01. That cancellation did not satisfy the subgroup gates. The independently reconstructed **six gate failures** match the stored rejection exactly; overlapping groups mean these are not six distinct deteriorating rosters.

| Failed uncertainty check | Group size | Baseline mean | Candidate mean |
|---|---:|---:|---:|
| Overall null/zero role samples | 500 | 6.11000000 | 6.11200000 |
| Low-sample-majority confidence | 374 | 0.06004770 | 0.06002096 |
| Low-sample-majority null/zero role samples | 374 | 6.55882353 | 6.56149733 |
| Includes new player: null/zero role samples | 491 | 6.16293279 | 6.16496945 |
| Similar tiers: confidence | 63 | 0.08767587 | 0.08751714 |
| Similar tiers: null/zero role samples | 63 | 5.39682540 | 5.41269841 |

**Conclusion: the tuning rejection is confirmed.** The material-gain threshold passed, but the fixed uncertainty gates did not. Protected-vector improvement is partly guaranteed by the selector and is not evidence of actual win-rate improvement. Validation/final outcomes remained unopened; this review does not establish held-out generalization, stability-gate results, timing-gate results or deployment readiness. Production scoring should remain at the unchanged baseline for this candidate.

Reproduction: with authorized access to the frozen inputs and stored tuning JSONL files, run the independent private audit with `node --import tsx .private/balance-policy-20261018/independent-audit.mjs` from the repository root. Its aggregate result is `.private/balance-policy-20261018/independent-tuning-audit.json`; the script refuses to overwrite that evidence. Public output here contains only aggregates and hashes, with no player names, participant identifiers or roster membership.

## Final public-artifact review

The published experiment report's tuning stage, input lock, stability summary and initial/final timing summaries match the corresponding private artifacts exactly. All nine published representative entries match stored tuning metrics; changed roles were independently recovered from the frozen evaluator. Every one of the four README case references exists in the detailed case artifact. The report correctly counts 500 evaluated and 500 unopened reserved rosters.

Role changes total **7 assignment appearances**, with individual burden increasing in 3 and decreasing in 3. They are not seven distinct players. Bottom verification was independently re-aggregated: both roles are known in **232 baseline / 233 candidate** rosters; at least one is unknown in **268 / 267**. ADC is verifiable in **371 / 371**, SUP in **276 / 277**; known violations are zero for each engine and role. Missing assigned current-tier slots are ADC **163 / 163** and SUP **282 / 281**. Unknown tiers were not counted as verified passes.

The README's stability figures agree with the retained artifact: 16 rosters, 720 swaps per engine (390 accepted / 330 rejected), 32 perturbations per engine, recommendation changes 2 baseline / 1 candidate, and maximum original-score team-gap deterioration 1.12 / 0.06. The final timing summary agrees at baseline p95 2,216.3875 ms and candidate p95 4,450.4446 ms, ratio **2.0079722521**, below the fixed 2.5 limit. This artifact review did not rerun stability searches or timing and does not use those passes to override tuning rejection.

Recursive inspection of the three public JSON artifacts found no original UUID, player-name field, player identifier, complete participant list, assignment layout, credential or rating snapshot. Group names and anonymous case IDs remain for interpretation. All 19 locked source hashes still match. No further recommendation search or study-source edit was performed for this review.
