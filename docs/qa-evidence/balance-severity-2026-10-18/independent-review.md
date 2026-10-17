# Severity study independent review

## Review scope and status

Preparation was reviewed on 2026-10-18 before the new candidate was evaluated on the new study rosters. This document separates that preparation and execution-path review from the subsequent independent tuning-outcome verification below. Neither review establishes an adoptable improvement or authorizes activation of a new production formula.

The registered candidate is `EXCESS_FIRST`, compared with production commit `131abbf777a331b056a96ab587957cf654387a78`, formula `V2_INHOUSE_RELAXED_2026_10_16`. The candidate changes only the order of quality-violation count and existing excess magnitude. The previous study remains separate.

## Completed preparation review

The independent reviewer read `scripts/balance-severity/PROTOCOL.md`, the preparation and hash-lock code, selectors, metrics, adoption gates, stage runner, independent oracle, pilot and publication code, and the shared frozen-source enumeration kernel.

Protocol corrections were made before candidate outcomes were inspected:

- Added an individual maximum-lane regression ceiling of 3 points, in addition to aggregate mean, p95 and maximum protections.
- Added an individual large-lane-count increase ceiling of 1 and explicitly named the protected burden metrics.
- Fixed the independent Pareto vector and its lower-is-better directions; old ranking cost and quality warnings remain separate diagnostics.
- Required candidate, measurement and gate code hashes to be locked before tuning and unchanged across stages.

The new gates permit the registered count-versus-severity hypothesis to be tested without treating the old optimizer's complete ranking as an automatic veto. Existing quality thresholds and warnings remain unchanged. Individual 3-point and 1-person ceilings are operational limits, not outcome-calibrated probabilities. A candidate still must pass every registered gate; this review makes no promise that it will pass.

## Independent input verification

Read-only checks computed these values from the old and new manifests without calculating candidate layouts or printing participant identities:

| Check | Result |
| --- | --- |
| New rosters / unique ten-player sets | 1,000 / 1,000 |
| Tuning / validation / final | 500 / 250 / 250 |
| Rosters without exactly ten distinct players | 0 |
| Exact overlap with the preceding 1,000 rosters | 0 |
| New roster sharing nine players with an old roster | 0 |
| New roster sharing nine players with another new roster | 0 |
| Rosters in each of the eight predefined strata | 125 |
| Invalid stratum predicates against the 138 eligible players | 0 |
| Mismatches against the registered deterministic split assignment | 0 |
| Frozen domain files matching production Git source after LF normalization | 3 / 3 |

The three source comparisons used `team-balance.ts`, `inhouse-fairness.ts` and `inhouse-joint-search.ts` from the production commit above. These checks establish combination separation and source consistency. The player pool and snapshot are shared with the preceding study; this is not independent-player, temporal or external validation. All new rosters are recombinations of real players, not newly observed matches.

## Synthetic gate regression tests

`tests/team-balance-severity-gates.test.ts` contains 15 passing synthetic tests. The test file also passed ESLint. These tests use metric-level fixtures and do not count as real-player roster observations or evidence of candidate improvement.

The tests verify:

- Strict primary-mean improvement, a material 3-point example, and independent p95/maximum protection.
- Individual 3-point strength and 1-unit burden/large-lane ceilings, including numeric tolerance boundaries, even when aggregate results improve.
- Preservation of previously complete quality compliance and equality of the optimal bottom-violation/excess/unregistered prefix.
- Protected-group behavior at nine versus ten observations, each protected strength and burden metric, and individual ceilings for small groups.
- Separate Pareto improvement, identical, mixed and deterioration classifications; old cost/risk and other diagnostics do not silently change this vector or veto adoption.
- Rejection of empty input and 78 non-finite-number cases covering both baseline/candidate inputs, 13 gate measurements and NaN/positive infinity/negative infinity.
- Input metrics remain unchanged by gate evaluation.

Domain and full-search oracle tests are separate from these gate tests. Their aggregate verification will be included with the final test evidence.

## Execution-path review and resolved findings

The initial runner compared frozen/current aggregate score objects without explicitly comparing each assignment's rating components, did not guarantee both encountered search modes were included in oracle checks, and did not enforce the registered input-order/team-color checks before publishing a passing stage. These findings were corrected before the new candidate evaluation began.

The reviewed runner now:

- Selects only the requested stage's rosters. Validation/final require the previous stage's matching input lock and accepted status; after rejection only a baseline coverage audit is allowed.
- Uses exclusive creation for stage-start markers, worker results and summaries, preventing ordinary reruns and overwrites.
- Rechecks source/input hashes at stage entry and before writing the summary.
- Requires exact agreement between completed roster IDs and the requested stage manifest, with all candidate rows present in an evaluation and none in a baseline-only audit.
- Compares frozen/current score objects and assignment rating components for each selected layout, and verifies that participant inputs remain unchanged.
- Runs the original frozen baseline search and a separately patched full-search candidate oracle on a stratified subset plus each worker's first encountered strict/relaxed mode. Summary assertions require oracle coverage for every mode present in the stage.
- On that subset, checks reversed input order, team-color-invariant scalar metrics, numbered rules and tier verification, and the expected sign/team reversal for directional lane measures.
- Counts shared candidate placements once, excluding oracle/pilot repetitions and the strict-search revisits contained in a relaxed exhaustive search.

The code-lock scope includes the protocol, preparation, pilot, publication, selector, oracle, metric, gate, runner, shared kernel, current domain and frozen baseline sources. The separate stability script was subsequently included in that lock before execution; its hash was verified during the tuning-outcome review. Public example keys distinguish maximum-lane improvement from overall Pareto improvement and include only positive deltas in maximum-lane regression examples.

No additional blocking execution-path issue remained after these corrections. This is approval to proceed with the preregistered experiment after the complete code lock, not approval to adopt or deploy its candidate.

## Tuning outcome verification — completed after rejection

The following review was performed after the tuning runner finished and rejected `EXCESS_FIRST`. It is separate from the preparation review above. Only tuning candidate results were opened. The reviewer did not generate candidate results for validation or final rosters.

The independent checker verified the current locked source hashes, frozen source hashes, snapshot bytes, roster manifest and exact tuning roster IDs. It read the four tuning worker result files and recalculated the selected baseline and candidate layouts for all 500 tuning rosters with the frozen production evaluator: **1,000 layout rescores**. These are verification repetitions, not additional participant combinations or exhaustive-search placements.

The checker derived signed lane gaps directly from assignment effective scores and independently recomputed team, individual bottom-role and combined bottom gaps; large-lane counts; quality-warning counts and excess magnitude; original-role eligibility, preference counts and team burdens; sample/confidence diagnostics; and individual ADC/SUP tier verification. It checked the frozen numbered-rule outcomes, original input preservation and subgroup membership against the snapshot. Stored metric values matched. A separate calculation reproduced every reported metric distribution/change count, Pareto classification, adoption failure and protected-group regression without calling the study's gate or Pareto helpers.

| Independently verified result | Value |
| --- | --- |
| Unique tuning rosters | 500 |
| Unique candidate placements from shared enumeration | 466,571,408 |
| Selected layouts independently rescored | 1,000 |
| Changed assignments | 46 / 500 (9.2%) |
| Pure Pareto improvement | 0 / 500 (0%) |
| Identical independent metric vector | 454 / 500 (90.8%) |
| Mixed improvement/regression | 46 / 500 (9.2%) |
| Pure Pareto deterioration | 0 / 500 (0%) |
| Individual-ceiling failure checks | 81 |
| Distinct rosters failing an individual ceiling | 45 / 500 (9.0%) |
| Overall distribution failure checks | 5 |
| Protected-group failure checks | 52 |
| Predefined/overlapping groups with a regression | 13 |
| Total failed checks, all independently reproduced | 138 |

**The 138 failures are checks, not 138 distinct rosters.** Multiple measurements can fail for one roster, and protected groups overlap. Likewise, the 46 mixed cases must not be presented as 46 pure deteriorations or 46 unqualified improvements.

The aggregate maximum-lane metrics improved: mean 24.58366 → 24.31558 and p95 50.51 → 49.77, with the absolute maximum unchanged at 81.07. Maximum-lane gap improved in 19 rosters, was unchanged in 470, and worsened in 11. These aggregate changes do not pass the complete adoption protocol: individual regressions exceeded their ceilings, team-gap mean and p95 worsened, bottom-gap mean worsened, and burden-imbalance mean and maximum worsened.

| Failed aggregate metric | Baseline | Candidate |
| --- | ---: | ---: |
| Team-gap mean | 6.07862 | 6.08650 |
| Team-gap p95 | 14.52 | 15.08 |
| Bottom-gap mean | 8.44468 | 8.94464 |
| Burden-imbalance mean | 1.29 | 1.30 |
| Burden-imbalance maximum | 5 | 6 |

Every protected group's member count and regression list matched the stage summary. The groups were the eight sampling strata plus includes-low-tier, includes-high-tier, includes-unknown-tier, includes-new-player and majority-under-five-games. All had at least ten members. The new-player group contained 493 tuning rosters, the unknown-tier group 337, and the majority-under-five-games group 365; they are overlapping combinations, not counts of distinct players.

The following largest individual increases were independently reproduced from the frozen layout rescores. Identifiers are anonymous roster labels, not player identities.

| Metric | Anonymous roster / sampling stratum | Baseline | Candidate | Increase |
| --- | --- | ---: | ---: | ---: |
| Maximum lane gap | `S-72439358142c` / low sample | 23.57 | 39.13 | 15.56 |
| Team gap | `S-edc2e6b983e7` / low sample | 4.08 | 20.70 | 16.62 |
| ADC gap | `S-99133b97817a` / low sample | 3.76 | 26.64 | 22.88 |
| SUP gap | `S-f7d141fbee29` / jungle shortage | 11.37 | 28.19 | 16.82 |
| Bottom gap | `S-e385418721e3` / main-role congestion | 1.48 | 23.68 | 22.20 |
| Burden imbalance | `S-d575d15f0374` / mixed tiers | 1 | 4 | 3 |

The review confirms the rejection independently of the old ranking-cost diagnostic. No quality-compliance-loss or optimal bottom-prefix-change failure was found; the rejection follows from the preregistered independent regression protections. Input-lock digest: `d7bed367e4ee67073bd745fd14106aeba91f2dea682b7ef79882f8f385361a54`.

The independent checker's temporary implementation and aggregate output were written only under ignored `.tmp/`; no participant identity data or production credentials were printed or committed. It did not modify the study implementation, protocol, metrics, parameters or result files.

## Candidate holdout and release status

The candidate failed tuning and remains unadopted. Validation/final candidate results must remain unopened; evaluation of their 500 rosters is a **baseline-only coverage audit**, not candidate holdout validation. The completed baseline audits and public artifacts were subsequently verified separately below.

This study has not activated or deployed a new runtime formula. The production baseline remains `V2_INHOUSE_RELAXED_2026_10_16`. The combination simulations and frozen rescores do not establish actual win-rate improvement.

## Final public-artifact and baseline-audit verification

After both baseline-only audits completed, the independent reviewer checked all three private stage summaries and their 1,000 result rows against `experiment-report.json` and `representative-cases.json`. Each stage contained exactly its manifest roster IDs. Every validation/final row had `candidate: null`; their summaries contained no candidate metrics, Pareto results or candidate-oracle comparisons. The public report correctly records **500 candidate comparisons plus 500 baseline-only audits**, with 0 newly observed matches.

| Stage | Unique rosters | Unique placements | Candidate evaluated |
| --- | ---: | ---: | --- |
| Tuning | 500 | 466,571,408 | Yes |
| Validation roster coverage | 250 | 239,631,280 | No |
| Final roster coverage | 250 | 230,545,216 | No |
| Total | 1,000 | 936,747,904 | 500 rosters only |

Placement counts were independently recomputed from registered-role eligibility, without scoring or selecting any new candidate. For each roster, the checker counted legal role assignments for both halves of all 126 team-color-equivalent partitions using a separate matching-count calculation. A relaxed search contains `126 × 120 × 120 = 1,814,400` unique structural placements. This reproduced every stored unique/raw count and the total above. The raw inspection total was 936,757,392; **9,488 strict-search revisits were excluded** from the unique total. Selector reuse, pilot/oracle repetitions and subsequent verification rescores were not multiplied into that count.

The public verification counts matched the result rows: 44 baseline full-search oracle comparisons, 15 independent candidate full-search comparisons, 1,500 frozen layout reevaluations and frozen/current score comparisons, 44 rosters checked for input-order/team-color invariance, and 1,000 input-preservation checks. The separate reviewer performed the additional 1,000 tuning-layout rescores described above; these do not change the study's roster or placement denominators.

Bottom-tier completeness was recomputed directly from selected assignments and the fixed snapshot's current tiers:

| Baseline coverage across 1,000 rosters | Verified | Unverifiable |
| --- | ---: | ---: |
| Both ADC and SUP comparisons known | 471 | 529 |
| ADC comparison | 714 | 286 |
| SUP comparison | 599 | 401 |

All known baseline comparisons passed the individual tier limit. The 529 rosters with at least one unknown bottom comparison must not be described as fully verified. The candidate's 500 tuning rosters likewise matched the report: both roles known in 240, at least one unknown in 260; ADC known/unknown 363/137 and SUP 305/195. These are roster/role observations, not distinct-player counts.

The final single-process pilot contains nine preceding-study rosters, none from the new manifest, and contributes zero new study rosters or placements. Its timing distributions were recalculated from the individual measurements: baseline median 50.4209 ms and p95/maximum 2,208.7270 ms; candidate median 47.1159 ms and p95/maximum 2,265.8822 ms. The candidate's higher mean and tail time do not support a production speedup claim. Contended worker timings are reported separately.

Public examples matched their private source rows exactly. Maximum-lane improvement examples are labeled specifically for that metric, mixed examples retain their mixed classification, and maximum-lane regression examples have positive regression deltas. No candidate result is attributed to the baseline-only stages.

A read-only privacy check covered the 12 existing public JSON/Markdown/text/log artifacts at review time. The two research JSON artifacts contained no player/account identity or credential fields. No production UUID, email, database connection string, bearer credential, JWT or recognized service-token pattern was found. Two UUID occurrences were the fixed synthetic `11111111-1111-4111-8111-111111111111` used in anonymous HTTP authorization checks, not production identities. No original player data or credentials were printed during verification.

The final public artifacts are consistent with candidate rejection and retention of the existing runtime formula. No new runtime deployment or actual win-rate improvement is claimed for this study. Independent checking did not modify any locked study source or private result file.
