# Preregistered severity comparison — finite study 2026-10-18

This is a new, finite study following the user's explicit request to adjust and deploy a validated improvement. It creates no automation. Freeze this protocol before observing candidate outcomes. A failed candidate is not deployed merely because a change was requested.

## Fixed question and baseline

Does comparing the magnitude of existing quality-limit violations before their count reduce the worst lane mismatches without material regressions in team strength, either bottom role, position burden or protected participant groups?

Production baseline is commit `131abbf777a331b056a96ab587957cf654387a78`, formula `V2_INHOUSE_RELAXED_2026_10_16`. Freeze its three pure domain source files in `.private/balance-severity-20261018/baseline/`. The preceding study and its artifacts remain unchanged.

Use the existing read-only production snapshot captured at `2026-10-17T16:09:33.538Z`, SHA-256 `aecb6d6f5767f21ec1225427aea5c32e53a657bd4ede4319b50d0e498cd5e75d`. Copy its bytes into the new private study directory without refreshing or modifying ratings, overrides, original roles or missing values. Original identities, account data and credentials must never enter logs or Git.

## Unexposed combinations and split

All 103 observed combinations and the preceding 1,000 study rosters have already been inspected. They may supply explanatory examples and regression/pilot inputs, but never new tuning, validation or final observations. The new evaluation consists entirely of **recombinations of real players**, not additional observed games.

Generate 1,000 unique ten-player sets from the same 138 eligible players with deterministic seed `2026101802`. Exclude every old exact roster and every new duplicate. Also reject any roster sharing nine players with an old roster or another new roster; publish the overlap assertion. Use 125 rosters in each existing stratum: similar tier, mixed tiers, main-role congestion, jungle shortage, support shortage, low sample, unknown tier, and broad pool. Verify stratum predicates against actual retained inputs.

Sort each stratum by SHA-256 of `balance-severity-20261018-v1|<sorted ten-player IDs>` and allocate 500 tuning, 250 validation, 250 sealed final using a deterministic balanced assignment. Neither team-color reversal nor player order creates a new roster. No participant is newly unseen: this is a held-out **combination** evaluation within the same player pool and snapshot, not player-independent, temporal or external validation.

Lock snapshot, old roster manifest, new manifest, protocol, baseline files, candidate/kernel implementation and metric/gate execution code hashes before tuning. Hash protocol/source text with LF-normalized newlines for cross-platform reproducibility. Refuse stage execution if any locked input or implementation changes. Pilot and oracle repetitions are excluded from unique roster and placement counts.

## One candidate; unchanged policies and scores

Compare `BASELINE` against exactly one candidate, `EXCESS_FIRST`.

The only ranking change swaps the first two fields of the existing quality comparator:

```
BASELINE:     qualityViolationCount, excessRisk, unknownTierCount,
              AUTO count, AUTO imbalance, rule 1, 2, 3, 4, 5, 6, existing cost, signature
EXCESS_FIRST: excessRisk, qualityViolationCount, unknownTierCount,
              AUTO count, AUTO imbalance, rule 1, 2, 3, 4, 5, 6, existing cost, signature
```

`excessRisk` remains the existing sum of max(0, maximum lane gap − 25), max(0, team total gap − 15), max(0, bottom total gap − 10), and 15 × max(0, count of lane gaps ≥15 − 1). No coefficient or threshold changes. Because zero excess and zero quality violations are equivalent, candidates satisfying every existing quality limit continue to outrank those that do not.

Strict registered-role and individual ADC/SUP current-major-tier gap <3 search stays first. If infeasible, the unchanged outer prefix is bottom violation count → tier excess → unregistered-role count. Neither a missing tier nor a default score verifies the tier limit. Shape, rules 1→6 relative precedence, canonical symmetry and all player scoring components remain unchanged. Additional small quality warnings may occur; record them explicitly. No lower numbered rule is compensated by several later rules.

Do not test SUB weights, minimax ranking, role penalty smoothing, confidence, MMR or recency coefficient changes in this study. No further parameter search follows a failure.

## Independent evaluation and adoption gates

Evaluate each selected layout using the frozen baseline scores and evaluator. Recompute geometric metrics independently from assigned scores. Record five signed lane gaps, each team's severely disadvantaged lane count, max/total lane gaps, team gap, separate ADC/SUP and bottom-total gaps, MAIN/SUB/registered AUTO/unregistered counts, team burden (MAIN=0, SUB=1, AUTO=2), SUB imbalance, rule 1→6 counts, quality warnings, missing inputs and confidence. Save anonymous layouts privately so per-role current-tier verification can be aggregated exactly.

The candidate's own `excessRisk` reduction is not proof of improvement. The old complete ranking vector and joint cost are disclosed diagnostics, not veto gates: requiring their global non-regression would reject any useful change in the old objective by construction.

All following gates apply separately and identically to tuning, validation and final. Numeric comparisons use tolerance `1e-8`, never rounded presentation values.

1. **Invariants:** zero structure/policy/oracle/data-preservation failures; unchanged strict/fallback feasibility and optimal bottom-violation/excess/unregistered prefix; no previously fully quality-compliant roster becomes noncompliant; exact frozen/current per-player score agreement; deterministic player-order and team-color behavior.
2. **Primary:** maximum lane gap mean strictly decreases; its p95 and maximum do not increase; at least one roster improves maximum lane gap by at least 3 points; no individual roster increases maximum lane gap by more than 3 points.
3. **Other strength metrics:** team, ADC, SUP and bottom-total gap each have non-increasing mean, p95 and maximum; no individual roster increases any of these gaps by more than 3 points. This is an operational individual-regression ceiling based on the existing 3-point even-lane band, not a new pass threshold or an empirically calibrated probability. Existing 15/25/10 thresholds and warnings remain unchanged.
4. **Large gaps and role burden:** large-lane count mean, p95 and maximum do not increase, and its per-roster increase is at most 1. AUTO count, total burden imbalance and SUB imbalance each have non-increasing mean, p95 and maximum; their per-roster increase is at most 1. Unregistered count remains equal under the invariant prefix.
5. **Protected groups:** for every predefined stratum or overlapping group with n≥10, maximum lane/team/ADC/SUP/bottom gap means, p95 and maxima do not increase; AUTO count, total burden imbalance and SUB imbalance means and maxima do not increase. Overlapping groups are includes-low-tier (≤Silver), includes-high-tier (≥Diamond), includes-unknown-tier, includes-new-player (zero recorded games), and majority-under-five-games (≥6 of 10). Smaller groups receive individual ceilings and explicit case disclosure, not a claim of subgroup safety.

Publish pure Pareto improvement, identical, mixed tradeoff and pure deterioration counts on this fixed independent vector, all lower-is-better: maximum lane gap, team gap, ADC gap, SUP gap, bottom-total gap, large-lane count, AUTO count, burden imbalance, SUB imbalance, unregistered count. Also publish each metric's improvement/unchanged/worse counts and largest increases/decreases. Rule outcomes, quality-warning counts and old cost are separate diagnostics, not silently added to or removed from the Pareto vector after inspection. Publish all rule outcome differences even though comparator precedence is preserved. Do not hide a higher quality-warning count behind a lower aggregate score.

## Stage discipline and verification

Lock the exact candidate and measurement implementation before tuning, and require the same hashes at validation and final. Run tuning first, with no evaluation of sealed validation/final candidates. Only a passing candidate advances. Run final once. Failure at any stage retains baseline and ends this study's tuning. Remaining rosters may receive baseline-only coverage audit without storing or inspecting rejected-candidate metrics; label that scope accurately.

Reuse prepared teams and frozen per-layout calculations across the two selectors. Compare baseline outputs with the production full-search function and candidate outputs with a separately implemented full enumeration/comparator on a deterministic subset including strict and relaxed cases. A frozen rescore alone does not establish candidate optimality. Synthetic independent small exhaustive enumeration and the full 1,814,400-layout fallback are required. Inspect boundary equality at team 15, max lane 25, bottom 10 and large-lane threshold 15.

Use previous-study inputs for an initial runtime pilot, then run a single-process timing pilot after research workers stop. Report median, p95, maximum and sample count separately from contended worker timing. On a deterministic stratified subset whose stage is already open, test reversed input, team-color exchange, all 45 pair swaps and +0.1 effective score perturbations. These are not new roster cases or calibrated uncertainty intervals.

Only after every adoption gate passes may runtime activate the new formula version, preserving old stored score versions and drafts. Verify domain, storage, authorization, concurrency, idempotency and actual browser create → swap preview → evaluate → save → reevaluate against disposable data. Run complete checks, candidate deployment, source CI and canonical production reads. No production experiment records or data mutations are allowed.

Historical pregame linkage remains unavailable. Neither current-score simulations nor novel layouts establish actual win-rate improvement. If the candidate fails, report the failed gates and retain production ranking; do not publish a deployment claim for an unadopted formula.
