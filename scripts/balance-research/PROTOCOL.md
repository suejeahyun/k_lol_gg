# Team balance research protocol — frozen before outcome inspection

Registered 2026-10-18 (Asia/Seoul), baseline commit `c679a1849bad2623da1339b87a83ecaa9fff485b`, formula `V2_INHOUSE_RELAXED_2026_10_16`. This is a finite, manually invoked experiment; it creates no schedule.

## Data and grouping

`snapshot.ts` runs one PostgreSQL `REPEATABLE READ READ ONLY` transaction and rolls it back. It calls the existing production rating provider at the transaction timestamp, excludes names/accounts/secrets, replaces transient UUIDs with anonymous player/game labels, and stores player-level information only under ignored `.private/`. The snapshot digest identifies the exact input for every comparison. Legacy tie order is preserved using anonymous ordinal values, never original legacy IDs.

Use observed ten-person groups from published games, saved/generated drafts and valid applications first. Replay uses the fixed current snapshot, so it is **not historical prediction**. Registered positions come from actual application or draft data; observed match roles are never promoted to registered preferences. Players without recorded preferences remain unavailable for recombination. Use source-specific preferences for draft/application replays where retained; other replays use the latest valid application, or the latest draft only when no valid application exists. A newer draft does not override an existing application in this research snapshot; disclose this limitation.

Target 1,000 unique real-player rosters after an initial small runtime pilot; minimum target 300 if measured computation makes 1,000 impractical. Canonical roster identity is the sorted set of ten anonymous player IDs; different input orders, team colors, games and role assignments do not create additional rosters. Include all eligible observed groups before stratified recombinations. Recombination strata cycle through similar tier, mixed extreme tiers, main-role congestion, jungle shortage, support shortage, sparse experience, unknown tier, and broad random coverage. If a stratum is unavailable in the real pool, report absence and cover it only in separately counted synthetic boundaries.

After canonical deduplication, stable SHA-256 hash of `balance-research-20261018-v1|<roster identity>` orders groups within source/stratum; allocate 50% tuning, 25% validation, 25% sealed final. The same roster and its team-color reversal may not cross splits. Synthetic boundaries do not enter real-player improvement percentages.

## Frozen candidates and independent metrics

Keep all player ratings, administrator overrides and positions fixed. Test exactly these three selection formulas:

1. `BASELINE`: current strict search then relaxed exhaustive search. Relaxed comparison is bottom-tier violation count, tier excess, unregistered-role count, then existing safety/position/rules 1–6 priority, joint cost and canonical signature.
2. `SUB_TIE`: only after all baseline priority and numeric cost ties, compare absolute difference between the two teams' SUB counts before canonical signature.
3. `SUB_SOFT_1`: after all baseline priorities, add `1 × abs(blue SUB count − red SUB count)` to joint cost. This single weight is predeclared and must not be tuned on the final split.

Score changes (main/sub/other penalties, role MMR strength, sample confidence, old/recent-record weighting) require temporal pregame data or independent labels to establish improvement. Do not fit them to their own objective. If unavailable, retain their baseline values and explicitly reject unsupported tuning.

Evaluate every returned layout with the frozen baseline evaluator, independently of the candidate's ranking cost. Record total team strength gap; five lane gaps, maximum and count ≥15; ADC and SUP gaps separately plus signed bottom total; MAIN/SUB/registered AUTO/unregistered counts; absolute team burden difference where MAIN=0, SUB=1, AUTO=2; SUB count imbalance; every rule 1–6 count; unknown ranks, missing sources, zero samples and mean confidence; strict/relaxed mode and constraint counts. Record exact unique visited candidate placements separately from feasible and recommended layouts. Report baseline/revised timing median, p95 and maximum (shared enumeration timing is not claimed as production latency).

Baseline risk comparison is lexicographic: relaxed constraints → existing safety/position/rule priorities → baseline joint cost. Independent burden is assessed only alongside this risk vector. “Improved” means no baseline-risk regression and strictly less SUB or total burden imbalance; unchanged means identical baseline-risk and burden metrics; “worse” means baseline risk or burden worsens. Also disclose mixed tradeoffs, assignment change rate, per-metric improvements/regressions, worst changes, and strata-level rates rather than hiding them in an average.

## Selection and holdout discipline

Run tuning first. A candidate may advance only if it has no violation of structure, bottom hierarchy, rule ordering, independent evaluator agreement, determinism or data preservation; zero worse cases on the baseline risk vector; no worse mean or maximum lane/ADC/SUP gap, burden imbalance or unregistered count in any sufficiently represented stratum (n≥10); and at least one independent burden improvement. Run validation only for tuning survivors, with identical gates. If neither survives, retain baseline and stop tuning. Freeze the winning candidate before final evaluation, then run the final split exactly once; any gate failure retains baseline. Never use final outcomes to tune or switch to another candidate. Small strata and sparse data are reported rather than declared safe.

The conservative default preference is `SUB_TIE`; choose `SUB_SOFT_1` only if it meets every gate and improves more without regression. Do not continue trying weights after these predeclared candidates fail.

## Verification and prediction limits

For a deterministic stratified subset, compare baseline kernel output with the frozen public full-search function (signature, score and visited/feasible counts), and candidate output with an independent enumeration comparison. On a small subset test reversed participant order, swapped team colors, all 45 pair swaps in the selected layout, and a fixed +0.1 input score perturbation; report stability with explicit denominators. No swap creates a new roster case.

Historical outcome validation requires saved pregame participant/rating snapshots and known timestamps preceding each game. Split chronologically by unique roster/series; exclude any roster crossing periods. Current MMR, current rank and postgame aggregates cannot be used for historical prediction. Without enough valid pregame observations, report predictive validation as unavailable. New recommended layouts have unknown outcomes and cannot establish actual win-rate improvement.

Artifacts include aggregate inventory, snapshot/baseline/protocol hashes, roster source and split counts, stage results, representative anonymous cases and independent verification. No raw production rows or source identity mappings enter Git.

Implementation corrections before interpreting tuning outcomes: independent lane values use the baseline's four-decimal symmetric rounding before threshold tests; MAIN count and confidence improvement directions are increasing; generated stratum membership is asserted; overlapping low/high/unknown-tier and new-player subgroups are checked in addition to sampling strata. These are measurement corrections, not score or candidate changes. If tuning rejects every candidate, the remaining manifest rosters are still enumerated for baseline coverage, timing and worst-case reporting; rejected candidates are not inspected or reconsidered on those held-out groups.

Anonymization correction before reading tuning outcomes: anonymous player labels must preserve source UUID lexical order for the canonical signature tie-break, while anonymous legacy ordinals separately preserve normalization and symmetry-anchor order. The initial pilot used legacy order for both and is superseded. Its running tuning job was stopped without interpreting candidate results; snapshot, manifest, pilot and experiments were regenerated under the corrected mapping. No original UUIDs or identity map were retained.
