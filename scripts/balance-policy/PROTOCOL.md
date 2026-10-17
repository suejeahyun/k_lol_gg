# Preregistered anchored Pareto policy study — 2026-10-18

This is one new finite study following the user's permission to revise, remove or reorder the six composition rules. The previous SUB and EXCESS_FIRST studies remain rejected and closed. This study tests exactly one candidate, `ANCHORED_PARETO`, policy identifier `ANCHORED_PARETO_2026_10_18_V1`; it permits no subsequent retuning after outcomes are opened. No automation is created. A failed candidate retains production ranking.

## Frozen scores, inputs and population

Baseline is production commit `131abbf777a331b056a96ab587957cf654387a78`, score formula `V2_INHOUSE_RELAXED_2026_10_16`. Copy its three frozen pure domain files from the preceding study after verifying their exact hashes. Do not modify the previous study files or production domain code for this experiment.

Reuse the same read-only production snapshot captured at `2026-10-17T16:09:33.538Z`, SHA-256 `aecb6d6f5767f21ec1225427aea5c32e53a657bd4ede4319b50d0e498cd5e75d`. Do not refresh ratings or fabricate missing information. Individual MMR, administrator overrides, current/peak tiers, role preferences and all score weights remain unchanged. Original identities, accounts and credentials must not enter Git or logs.

Use 1,000 new, unique real-player recombinations from the same 138-player pool, with 125 in each existing stratum: similar tier, mixed tiers, main-role congestion, jungle shortage, support shortage, low sample, unknown tier and broad pool. All previously inspected rosters in both earlier studies are excluded from this study's evaluation; also exclude a nine-player overlap with any earlier or new study roster. Fix deterministic seed `2026101803`. Sort each stratum using SHA-256 of `balance-policy-20261018-v1|<sorted ten-player IDs>` and allocate balanced tuning/validation/final stages of 500/250/250. Team-color reversal and participant order never create extra rosters. Publish overlap and stratum-predicate assertions.

These are held-out combinations within the same snapshot/player pool, not new observed games, unseen-player validation or historical predictions. Earlier observed rosters may be used only for disclosed runtime pilots and explanatory examples. All inputs, baseline files, protocol and implementation/measurement/gate code are hashed before new candidate outcomes are calculated. Normalize source newlines to LF for hashes; refuse execution on a changed lock.

## One policy and immutable structural constraints

Keep ten distinct players, five per team, and exactly one TOP/JGL/MID/ADC/SUP on each team. First search only registered roles with both individual current-major-tier bottom gaps less than three. ADC and SUP are tested separately. Missing current tier cannot verify a constraint and must remain explicit.

When strict search is infeasible, enumerate the same ten players in all roles. Preserve the lexicographically optimal prefix of bottom-tier violation count, bottom-tier excess over the largest allowed gap of two, and unregistered-assignment count. No later property can compensate for a worse prefix. The candidate must have exactly the baseline's optimal prefix.

Pass one obtains the exact original recommendation B using unchanged baseline ranking, including its original numeric joint cost and canonical tie-break. Pass two reuses the prepared team assignments and inspects every placement in the same strict/fallback search mode. It admits a placement only when every following comparison with B holds:

| Protected coordinate | Required direction |
|---|---|
| TOP, JGL, MID, ADC and SUP absolute score gaps, individually | each ≤ B |
| Absolute team-total score gap | ≤ B |
| Absolute combined ADC+SUP score gap | ≤ B |
| Total AUTO assignments | ≤ B |
| Total SUB assignments | ≤ B |
| Total role burden, MAIN=0 / SUB=1 / AUTO=2 | ≤ B |
| Maximum of the two teams' role burdens | ≤ B |
| Absolute difference between team role burdens | ≤ B |
| Missing current-tier slots in ADC and SUP, separately | each ≤ B |
| Minimum of the two teams' viable TOP/MID/ADC line counts | ≥ B |
| Sum of all ten assigned effective scores | ≥ B |

A carry line is viable for a team when its signed score disadvantage is no greater than 3 points, including equality. Count TOP, MID and ADC separately for each team, then protect the minimum of those counts. Protecting the combined effective total prevents apparent balance improvement obtained solely by reducing aggregate assigned strength. It does not establish real-game skill or champion synergy.

At least one protected coordinate must strictly improve. If no placement does, return B exactly. Do not choose a different equal-vector layout merely to change a rule explanation. Score-derived sums and differences use symmetric four-decimal rounding, consistent with frozen fairness metrics. Use tolerance `1e-8` only for floating-point comparisons, not to relax thresholds or ignore a meaningful deterioration.

Among strictly improving eligible placements, select lexicographically by:

1. maximum of the five lane gaps;
2. sum of the five lane gaps;
3. team-total gap;
4. combined bottom gap;
5. role-burden imbalance;
6. the unchanged original priority comparator: quality-warning count, existing excess risk, unknown tier count, AUTO count, AUTO imbalance, then rules 1→6;
7. canonical BLUE signature followed by RED signature.

There is no new weighted compensation and no extra joint-cost term after these fields. The old joint cost remains part of B's original selection. The six rules remain available as explanations and residual tie-breaks; they can no longer defeat an eligible candidate's earlier quantitative improvement. Rule 4 remains structurally enforced through the unchanged bottom prefix. A higher aggregate burden, loss of an available carry path, or worse individual lane cannot be traded for several other improvements.

The protected vector is a statement about these recorded metrics, not a promise that every participant prefers the new role. Report actual role changes and per-player burden changes separately. Preserve role-sample uncertainty and missing-tier explanations; never relabel unavailable information as verified.

## Independent measurements and material-adoption gates

Independently rescore selected layouts with the frozen baseline evaluator and recompute geometry from the assigned frozen scores. Do not use only the new selector's eligibility result to claim improvement. Record each lane, signed directions, team/bottom gaps, maximum/total lane gaps, large-lane count, MAIN/SUB/registered AUTO/unregistered counts, total/max-team/imbalance burden, each bottom role's missing-tier slots and verification, both teams' viable-carry counts and their minimum, total effective score, all six rule counts, quality warnings, role-sample counts, missing sources and confidence.

The policy guarantees no worsening of its protected vector by construction. That guarantee is not empirical evidence of better real-match outcomes. Evaluation measures how frequently useful improvements exist, their size, uncertainty, subgroup distribution, stability and computational cost. Directional rules, AUTO/SUB imbalance and per-player role concessions that are not protected individually must still be disclosed. AUTO-only and SUB-only imbalance are diagnostics, not additional vetoes; the specified total/max-team/imbalance role-burden protections remain the policy.

A roster has **material improvement** if at least one of these holds, using unrounded presentation-independent values and tolerance `1e-8`:

- lane-gap sum decreases by at least 3 points;
- total non-MAIN assignments, SUB+AUTO, decreases by at least one person;
- role-burden imbalance decreases by at least one point.

Increasing only combined effective total, only carry-path count or only tier completeness does not satisfy this material criterion. The 3-point scale comes from the existing even-line band; it is not a calibrated probability.

Apply these gates independently to tuning, validation and final:

1. Zero structure, policy, complete-search oracle, frozen/current score agreement, input-preservation, input-order or team-color failures. Every selected candidate must satisfy the independently recomputed anchored protections. Previously quality-compliant B must remain compliant.
2. Material improvement in at least 1% of the stage: at least 5/500 tuning and at least 3/250 validation or final rosters. Improvements must not be pooled across stages to rescue a failed stage.
3. Every predefined stratum and overlapping protected group must have non-worsening protected metrics. For n≥10, disclose mean/p95/max on lower-is-better coordinates and mean/p05/min on higher-is-better coordinates. Smaller groups receive individual disclosure, not a population safety claim. Overlapping groups are includes-low-tier (≤Silver), includes-high-tier (≥Diamond), includes-unknown-tier, includes-new-player (zero games), and at least six players with fewer than five recorded games.
4. In the final single-process pilot, candidate p95 compute time must not exceed 2.5 times the unchanged public production baseline function's p95. Fix the old severity-study pilot to the lexicographically first two roster IDs in each of eight strata (16 previously opened rosters, no outcome filtering) before execution. Initial pilot timings are disclosed; the final pilot runs after worker activity stops and is the runtime adoption gate. Stage workers disclose paired first-pass/complete-two-pass timing and contention, but those ratios are diagnostics rather than vetoes: first pass is an equivalent streaming baseline and simultaneous CPU load can bias a paired interval.
5. Independently count assignments with absent or zero role sample size and the mean of the ten assigned confidence values. Neither the overall mean zero-sample count nor that of any predefined n≥10 group may increase; overall and group mean confidence may not decrease. These are outcome checks, not additional selector guards. Disclose small-group and individual changes even when the mean passes. Do not invent confidence for unavailable inputs.

The primary evidence gate is material-improvement frequency, not a required strict decrease in maximum-lane mean. Before adoption, the fixed stability audit below must also pass its own baseline-relative vetoes; these cannot be traded for material improvements.

Publish pure improvement/unchanged counts on the complete protected vector, material-improvement count and rate, assignment-change rate, per-coordinate changes, all directional-rule regressions, role-sample/confidence changes, remaining worst cases and timing denominators. No improvements outside these prespecified criteria may rescue a failed adoption gate.

## Exactness, stability and stage discipline

Reuse baseline normalization and pure per-player scoring. Retain prepared teams between passes; do not reuse only the original top-three-per-split shortlist. A moving baseline during pass two is forbidden: B and its bounds must be fixed first. Do not materialize all 1,814,400 placements. Count each unique placement once even when inspected twice; report raw first/second-pass inspections separately, including failed strict-search inspections before fallback.

Validate the original recommendation against the frozen public full search. Validate the candidate with a separate full enumerator, independently written protection checks and an explicit ordering key. Include an independently ordered small complete case, all 1,814,400 fallback placements, guard equality boundaries, missing tiers, individual bottom constraints, unavoidable unregistered roles, color/order symmetry and a case where moving-baseline filtering would be incorrect. Never call a frozen rescore alone an optimality oracle.

Before opening new tuning outcomes, lock the protocol and exact implementation. Use prior-study inputs only for the initial runtime pilot. Only a passing tuning candidate advances to validation; only a passing validation candidate advances to final. Final is opened once. A failed stage ends candidate testing, retains B and permits only clearly labeled baseline-only coverage of remaining rosters. There is no further tuning after this study.

On the lexicographically first two tuning roster IDs in each of eight strata (16 already opened rosters), audit reversed input, swapped team colors, all 45 player-pair swaps and actual effective-score perturbations of +0.1 and −0.1 to the lexicographically smallest player ID, with unchanged input records. Each engine has 32 perturbation scenarios. Reevaluate perturbed selections using original frozen scores and disclose discontinuities. The candidate's layout-change count must not exceed baseline's, ignoring team colors. For every protected coordinate, the candidate's largest deterioration from its own unperturbed selection must not exceed baseline's largest deterioration (lower-coordinate increase or higher-coordinate decrease, floored at zero, tolerance 1e-8). These are additional adoption vetoes. These repeated inspections are not new roster cases or confidence intervals. Run the final single-process timing pilot after worker activity stops.

Only if every adoption gate passes may a separate runtime activation assign a new policy/formula version and apply the same policy through recommendation, manual evaluation, selection, saving and reevaluation. Preserve historical versions/drafts, authentication, ownership, concurrent edits and idempotency. Then perform focused/full tests, disposable-data browser flow, deployment-candidate checks and verified production deployment. No production experiment data is created or modified. If rejected, publish the evidence and the unchanged production state without claiming deployment of the rejected policy.

Pregame historical snapshots and actual outcomes of novel layouts remain unavailable. No simulation or within-snapshot Pareto comparison establishes actual win-rate improvement.
