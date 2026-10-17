import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";
import { BASELINE_COMMIT, DIRECTORY, SNAPSHOT_SHA256, STRATA, hash, inputHashes, writeImmutable, PREVIOUS_MANIFESTS, type Roster } from "./study";

await mkdir(DIRECTORY, { recursive: true });
if (process.argv.includes("--lock")) {
  const locked = await inputHashes();
  await writeImmutable(`${DIRECTORY}/input-lock.json`, JSON.stringify(locked, null, 2) + "\n");
  console.log(JSON.stringify({ locked: true, snapshotSha256: locked.snapshotSha256, rosterManifestSha256: locked.rosterManifestSha256 }));
} else {
  const snapshotRaw = await readFile(".private/balance-research/snapshot.json", "utf8");
  assert.equal(hash(snapshotRaw), SNAPSHOT_SHA256);
  await writeImmutable(`${DIRECTORY}/snapshot.json`, snapshotRaw);
  execFileSync(process.execPath, ["--import", "tsx", "scripts/balance-research/freeze-baseline.ts", BASELINE_COMMIT, `${DIRECTORY}/baseline`], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const snapshot = JSON.parse(snapshotRaw) as { players: TeamBalancePlayer[] };
  const players = snapshot.players.filter(p => p.eligiblePositions.length > 0);
  assert.equal(players.length, 138);
  const previousRaw = await Promise.all(PREVIOUS_MANIFESTS.map(path => readFile(path, "utf8")));
  const previousManifests = Object.fromEntries(PREVIOUS_MANIFESTS.map((path, index) => [path, hash(previousRaw[index])]));
  const old = { rosters: previousRaw.flatMap(raw => (JSON.parse(raw) as { rosters: { playerIds: string[] }[] }).rosters) };
  assert.equal(old.rosters.length, 2000);
  let seed = 2026101803;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function pick<T>(pool: readonly T[], count: number) { assert.ok(pool.length >= count); const values = [...pool]; for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values.slice(0, count); }
  const tiers = new Map(players.map(p => [p.playerId, parseInhouseMajorTier(p.rating?.v1?.currentTier)]));
  const known = players.filter(p => tiers.get(p.playerId) !== null).sort((a, b) => tiers.get(a.playerId)! - tiers.get(b.playerId)!);
  const low = known.slice(0, Math.ceil(known.length / 3)); const high = known.slice(-Math.ceil(known.length / 3));
  const nineKeys = (ids: string[]) => ids.map((_, index) => ids.filter((_, i) => i !== index).join("|"));
  const oldKeys = new Set(old.rosters.map(r => [...r.playerIds].sort().join("|")));
  assert.equal(oldKeys.size, 2000);
  const prohibitedNine = new Set(old.rosters.flatMap(r => nineKeys([...r.playerIds].sort())));
  const rosters: Roster[] = []; let attempts = 0; let rejectedOverlap = 0;
  for (const stratum of STRATA) {
    let kept = 0;
    while (kept < 125) {
      assert.ok(++attempts <= 100000, "STRATIFIED_SAMPLE_INFEASIBLE");
      let selected: TeamBalancePlayer[];
      if (stratum === "SIMILAR_TIER") { const anchor = tiers.get(known[Math.floor(random() * Math.max(1, known.length - 15))].playerId)!; const pool = known.filter(p => Math.abs(tiers.get(p.playerId)! - anchor) <= 1); if (pool.length < 10) continue; selected = pick(pool, 10); }
      else if (stratum === "MIXED_TIERS") selected = [...pick(low, 5), ...pick(high, 5)];
      else if (stratum === "MAIN_CONGESTION") { const role = ["TOP", "JGL", "MID", "ADC", "SUP"][Math.floor(random() * 5)]; const main = pick(players.filter(p => p.eligiblePositions.some(e => e.position === role && e.preference === "MAIN")), 6); selected = [...main, ...pick(players.filter(p => !main.includes(p)), 4)]; }
      else if (stratum === "JUNGLE_SHORTAGE" || stratum === "SUPPORT_SHORTAGE") selected = pick(players.filter(p => !p.eligiblePositions.some(e => e.position === (stratum === "JUNGLE_SHORTAGE" ? "JGL" : "SUP"))), 10);
      else if (stratum === "LOW_SAMPLE" || stratum === "UNKNOWN_TIER") { const count = stratum === "LOW_SAMPLE" ? 6 : 3; const subset = pick(players.filter(p => stratum === "LOW_SAMPLE" ? (p.rating?.v1?.internalGames ?? 0) < 5 : tiers.get(p.playerId) === null), count); selected = [...subset, ...pick(players.filter(p => !subset.includes(p)), 10 - count)]; }
      else selected = pick(players, 10);
      const ids = selected.map(p => p.playerId).sort(); assert.equal(new Set(ids).size, 10);
      if (oldKeys.has(ids.join("|")) || nineKeys(ids).some(key => prohibitedNine.has(key))) { rejectedOverlap++; continue; }
      if (stratum === "SIMILAR_TIER") assert.ok(Math.max(...selected.map(p => tiers.get(p.playerId)!)) - Math.min(...selected.map(p => tiers.get(p.playerId)!)) <= 2);
      if (stratum === "MIXED_TIERS") assert.ok(selected.filter(p => low.includes(p)).length === 5 && selected.filter(p => high.includes(p)).length === 5);
      if (stratum === "MAIN_CONGESTION") assert.ok(["TOP", "JGL", "MID", "ADC", "SUP"].some(role => selected.filter(p => p.eligiblePositions.some(e => e.position === role && e.preference === "MAIN")).length >= 6));
      if (stratum === "LOW_SAMPLE") assert.ok(selected.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5).length >= 6);
      if (stratum === "UNKNOWN_TIER") assert.ok(selected.filter(p => tiers.get(p.playerId) === null).length >= 3);
      nineKeys(ids).forEach(key => prohibitedNine.add(key));
      rosters.push({ id: `A-${hash(ids.join("|")).slice(0, 12)}`, source: "RECOMBINED_REAL_PLAYERS", stratum, playerIds: ids, split: "tuning" }); kept++;
    }
  }
  let splitIndex = 0;
  for (const stratum of STRATA) {
    const group = rosters.filter(r => r.stratum === stratum).sort((a, b) => hash(`balance-policy-20261018-v1|${a.playerIds.join("|")}`).localeCompare(hash(`balance-policy-20261018-v1|${b.playerIds.join("|")}`)));
    for (const r of group) r.split = (["tuning", "tuning", "validation", "final"] as const)[splitIndex++ % 4];
  }
  const counts = Object.fromEntries(["tuning", "validation", "final"].map(stage => [stage, rosters.filter(r => r.split === stage).length]));
  assert.deepEqual(counts, { tuning: 500, validation: 250, final: 250 });
  assert.equal(new Set(rosters.map(r => r.id)).size, 1000);
  const manifest = { seed: 2026101803, splitSalt: "balance-policy-20261018-v1", snapshotSha256: SNAPSHOT_SHA256, previousManifests, uniqueRosters: 1000, observed: 0, recombined: 1000, synthetic: 0, attempts, rejectedOverlap, exactOldOverlap: 0, ninePlayerOverlapWithOldOrNew: 0, overlapLimit: 8, playerIndependent: false, counts, strata: STRATA.map(stratum => ({ stratum, count: 125 })), rosters };
  await writeImmutable(`${DIRECTORY}/rosters.json`, JSON.stringify(manifest, null, 2) + "\n");
  const priorStudy = JSON.parse(previousRaw[1]) as { snapshotSha256: string; rosters: Roster[] };
  const pilotRosters = STRATA.flatMap(stratum => priorStudy.rosters.filter(r => r.stratum === stratum).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2));
  assert.equal(pilotRosters.length, 16);
  await writeImmutable(`${DIRECTORY}/pilot-rosters.json`, JSON.stringify({ source: "PREVIOUS_SEVERITY_STUDY_ALREADY_OPENED", method: "FIRST_TWO_ANONYMOUS_IDS_PER_STRATUM_NO_OUTCOME_FILTER", snapshotSha256: priorStudy.snapshotSha256, uniqueNewRosters: 0, rosters: pilotRosters }, null, 2) + "\n");
  console.log(JSON.stringify({ ...manifest, rosters: undefined }, null, 2));
}
