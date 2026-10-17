import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import type { EvaluatedTeamBalanceLayout, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";
import { loadBalanceExperimentKernel } from "./kernel";
import { independentMetrics } from "./metrics";

const directory = ".private/balance-research";
const snapshot = JSON.parse(await readFile(`${directory}/snapshot.json`, "utf8"));
const manifest = JSON.parse(await readFile(`${directory}/rosters.json`, "utf8"));
const report = JSON.parse(await readFile("docs/qa-evidence/balance-research-2026-10-18/experiment-report.json", "utf8"));
const tuning = JSON.parse(await readFile(`${directory}/tuning-summary.json`, "utf8"));
const kernel = await loadBalanceExperimentKernel(`${directory}/baseline`, `${directory}/case-replay-kernel`);
const playerById = new Map<string, TeamBalancePlayer>(snapshot.players.map((p: TeamBalancePlayer) => [p.playerId, p]));
const cases = new Map<string, string>();
cases.set(tuning.summaries.find((s: { variant: string }) => s.variant === "SUB_SOFT_1").worstCases[0].id, "REJECTED_SUB_BURDEN_TRADEOFF");
cases.set(report.representativeBaselineCases.worstLaneGap[0].roster, "WORST_BASELINE_LANE");
if (report.representativeBaselineCases.balancedTotalLargeLanes[0]) cases.set(report.representativeBaselineCases.balancedTotalLargeLanes[0].roster, "SIMILAR_TEAM_TOTAL_LARGE_LANES");
cases.set(report.representativeBaselineCases.unavoidableRoleDeviation[0].roster, "UNAVOIDABLE_UNREGISTERED_ROLES");
const results = [];
for (const [id, reason] of cases) {
  const roster = manifest.rosters.find((r: { id: string }) => r.id === id);
  const players: TeamBalancePlayer[] = roster.playerIds.map((playerId: string) => ({ ...playerById.get(playerId)!, eligiblePositions: roster.eligibility?.[playerId] ?? playerById.get(playerId)!.eligiblePositions }));
  function describe(layout: EvaluatedTeamBalanceLayout) {
    const metric = independentMetrics(players, layout);
    const signed = layout.score.positions.map(p => ({ position: p.position, blueMinusRed: Math.round((p.blueScore - p.redScore) * 10000) / 10000 }));
    return { metrics: metric, signedLaneGaps: signed, severelyDisadvantagedLanes: { BLUE: signed.filter(p => p.blueMinusRed <= -15).length, RED: signed.filter(p => p.blueMinusRed >= 15).length }, bottomTierVerification: ["ADC", "SUP"].map(position => {
      const ranks = layout.assignments.filter(a => a.position === position).map(a => parseInhouseMajorTier(players.find(p => p.playerId === a.playerId)?.rating?.v1?.currentTier));
      return { position, verified: ranks.every(r => r !== null), majorTierGap: ranks.some(r => r === null) ? null : Math.abs(ranks[0]! - ranks[1]!) };
    }), unregisteredRoles: layout.assignments.filter(a => !players.find(p => p.playerId === a.playerId)!.eligiblePositions.some(p => p.position === a.position)).map(a => ({ team: a.team, position: a.position })) };
  }
  const baseline = kernel.calculateBaseline(players).candidates[0];
  let candidate = null;
  if (reason === "REJECTED_SUB_BURDEN_TRADEOFF") {
    assert.equal(roster.split, "tuning");
    const all = kernel.calculate(players);
    assert.equal(baseline.signature, all.variants.BASELINE.signature);
    candidate = describe(all.variants.SUB_SOFT_1);
  }
  results.push({ roster: id, reason, source: roster.source, stratum: roster.stratum, split: roster.split, baseline: describe(baseline), rejectedSubSoftCandidate: candidate });
}
await writeFile("docs/qa-evidence/balance-research-2026-10-18/representative-cases.json", JSON.stringify({ snapshotSha256: manifest.snapshotSha256, countedAsAdditionalUniqueRosters: false, results }, null, 2) + "\n");
console.log(JSON.stringify({ cases: results.length, snapshotSha256: manifest.snapshotSha256 }));
