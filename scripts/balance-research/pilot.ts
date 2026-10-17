import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { loadBalanceExperimentKernel } from "./kernel";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";

const directory = ".private/balance-research";
const snapshot = JSON.parse(await readFile(`${directory}/snapshot.json`, "utf8"));
const manifest = JSON.parse(await readFile(`${directory}/rosters.json`, "utf8"));
const kernel = await loadBalanceExperimentKernel(`${directory}/baseline`, `${directory}/pilot-kernel`);
const playerMap = new Map<string, TeamBalancePlayer>(snapshot.players.map((p: TeamBalancePlayer) => [p.playerId, p]));
const seen = new Set<string>();
const results = [];
for (const roster of manifest.rosters) {
  if (roster.split !== "tuning" || seen.has(roster.stratum)) continue;
  seen.add(roster.stratum);
  const players = roster.playerIds.map((id: string) => ({ ...playerMap.get(id)!, eligiblePositions: roster.eligibility?.[id] ?? playerMap.get(id)!.eligiblePositions }));
  const result = kernel.calculate(players);
  const start = performance.now();
  const baseline = kernel.calculateBaseline(players);
  const baselineMs = performance.now() - start;
  assert.equal(result.variants.BASELINE.signature, baseline.candidates[0].signature);
  assert.deepEqual(result.variants.BASELINE.score, baseline.candidates[0].score);
  assert.equal(result.search.feasibleLayoutCount, baseline.search.feasibleLayoutCount);
  const row = { id: roster.id, stratum: roster.stratum, sharedMs: result.elapsedMs, baselineMs, search: result.search };
  results.push(row); console.log(JSON.stringify(row));
}
await writeFile(`${directory}/pilot.json`, JSON.stringify({ snapshotSha256: manifest.snapshotSha256, uniqueRosters: results.length, results }, null, 2) + "\n");
