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
