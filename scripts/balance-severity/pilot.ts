import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { loadBalanceExperimentKernel } from "../balance-research/kernel";
import { distribution } from "../balance-research/metrics";
import { EXCESS_FIRST_SELECTOR } from "./selector";
import { loadSeverityCandidateOracle } from "./oracle";
import { DIRECTORY, assertLock, readInputs } from "./study";

const phase = process.argv[2];
assert.ok(phase === "initial" || phase === "final", "PILOT_PHASE_REQUIRED");
await assertLock();
const { snapshot } = await readInputs();
const previous = JSON.parse(await readFile(".private/balance-research/rosters.json", "utf8")) as { rosters: { id: string; stratum: string; split: string; playerIds: string[]; eligibility?: Record<string, TeamBalancePlayer["eligiblePositions"]> }[] };
const kernel = await loadBalanceExperimentKernel(`${DIRECTORY}/baseline`, `${DIRECTORY}/pilot-${phase}-kernel`);
const oracle = await loadSeverityCandidateOracle(`${DIRECTORY}/baseline`, `${DIRECTORY}/pilot-${phase}-oracle`);
const byId = new Map(snapshot.players.map(p => [p.playerId, p]));
const seen = new Set<string>(); const results = [];
for (const roster of previous.rosters) {
  if (roster.split !== "tuning" || seen.has(roster.stratum)) continue;
  seen.add(roster.stratum);
  const players = roster.playerIds.map(id => ({ ...byId.get(id)!, eligiblePositions: roster.eligibility?.[id] ?? byId.get(id)!.eligiblePositions }));
  const calculated = kernel.calculateWithSelectors(players, [EXCESS_FIRST_SELECTOR]);
  let start = performance.now(); const baseline = kernel.calculateBaseline(players); const baselineMs = performance.now() - start;
  start = performance.now(); const candidate = oracle.calculateTeamBalanceCandidates(players); const candidateMs = performance.now() - start;
  assert.equal(calculated.variants.BASELINE.signature, baseline.candidates[0].signature);
  assert.equal(calculated.variants.EXCESS_FIRST.signature, candidate.candidates[0].signature);
  assert.deepEqual(calculated.variants.BASELINE.score, baseline.candidates[0].score);
  assert.deepEqual(calculated.variants.EXCESS_FIRST.score, candidate.candidates[0].score);
  results.push({ id: roster.id, stratum: roster.stratum, sharedMs: calculated.elapsedMs, baselineMs, candidateMs, relaxed: calculated.search.relaxed });
}
const report = { phase, source: "PREVIOUS_STUDY_ROSTERS_EXCLUDED_FROM_NEW_EVALUATION", uniqueNewStudyRosters: 0, countedStudyPlacements: 0, sampleCount: results.length, baseline: distribution(results.map(r => r.baselineMs)), candidate: distribution(results.map(r => r.candidateMs)), sharedEnumeration: distribution(results.map(r => r.sharedMs)), results };
await writeFile(`${DIRECTORY}/pilot-${phase}.json`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
