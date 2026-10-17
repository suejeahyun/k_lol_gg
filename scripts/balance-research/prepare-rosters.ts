import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";

const directory = process.argv[2] ?? ".private/balance-research";
const target = Number(process.argv[3] ?? 1000);
const raw = await readFile(`${directory}/snapshot.json`, "utf8");
const snapshot = JSON.parse(raw) as { players: TeamBalancePlayer[]; observedRosters: { source: string; observedOn: string; playerIds: string[]; eligibility?: Record<string, TeamBalancePlayer["eligiblePositions"]> }[] };
const players = snapshot.players.filter(p => p.eligiblePositions.length > 0);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let seed = 20261018;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function pick<T>(pool: readonly T[], count: number) { const values = [...pool]; for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values.slice(0, count); }
const tiers = new Map(players.map(p => [p.playerId, parseInhouseMajorTier(p.rating?.v1?.currentTier)]));
const tierPlayers = players.filter(p => tiers.get(p.playerId) !== null).sort((a, b) => tiers.get(a.playerId)! - tiers.get(b.playerId)!);
const rosterMap = new Map<string, { id: string; source: string; stratum: string; playerIds: string[]; eligibility?: Record<string, TeamBalancePlayer["eligiblePositions"]>; observedOn?: string; split?: string }>();
function add(source: string, stratum: string, playerIds: string[], extra: { eligibility?: Record<string, TeamBalancePlayer["eligiblePositions"]>; observedOn?: string } = {}) {
  const sorted = [...new Set(playerIds)].sort();
  if (sorted.length !== 10) return false;
  const key = sorted.join("|");
  if (rosterMap.has(key)) return false;
  rosterMap.set(key, { id: `R-${hash(key).slice(0, 12)}`, source, stratum, playerIds: sorted, ...extra }); return true;
}
for (const r of snapshot.observedRosters) add(r.source, "OBSERVED", r.playerIds, r);
const unavailable = new Set<string>();
const strata = ["SIMILAR_TIER", "MIXED_TIERS", "MAIN_CONGESTION", "JUNGLE_SHORTAGE", "SUPPORT_SHORTAGE", "LOW_SAMPLE", "UNKNOWN_TIER", "BROAD_POOL"];
let attempts = 0;
while (rosterMap.size < target && attempts < target * 100) {
  const stratum = strata[attempts++ % strata.length];
  let selected: TeamBalancePlayer[] = [];
  if (stratum === "SIMILAR_TIER") {
    const start = Math.floor(random() * Math.max(1, tierPlayers.length - 15));
    const anchor = tiers.get(tierPlayers[start]?.playerId);
    const pool = tierPlayers.filter(p => Math.abs(tiers.get(p.playerId)! - (anchor ?? 0)) <= 1);
    if (pool.length >= 10) selected = pick(pool, 10);
  } else if (stratum === "MIXED_TIERS") selected = [...pick(tierPlayers.slice(0, Math.ceil(tierPlayers.length / 3)), 5), ...pick(tierPlayers.slice(-Math.ceil(tierPlayers.length / 3)), 5)];
  else if (stratum === "MAIN_CONGESTION") {
    const role = ["TOP", "JGL", "MID", "ADC", "SUP"][Math.floor(random() * 5)];
    const same = players.filter(p => p.eligiblePositions.some(e => e.position === role && e.preference === "MAIN"));
    const primary = pick(same, 6); selected = [...primary, ...pick(players.filter(p => !primary.includes(p)), 10 - primary.length)];
  } else if (stratum === "JUNGLE_SHORTAGE" || stratum === "SUPPORT_SHORTAGE") {
    const role = stratum === "JUNGLE_SHORTAGE" ? "JGL" : "SUP";
    const pool = players.filter(p => !p.eligiblePositions.some(e => e.position === role));
    if (pool.length >= 10) selected = pick(pool, 10);
  } else if (stratum === "LOW_SAMPLE") {
    const low = pick(players.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5), 6);
    selected = [...low, ...pick(players.filter(p => !low.includes(p)), 10 - low.length)];
  } else if (stratum === "UNKNOWN_TIER") {
    const unknown = pick(players.filter(p => tiers.get(p.playerId) === null), 3);
    if (unknown.length) selected = [...unknown, ...pick(players.filter(p => !unknown.includes(p)), 10 - unknown.length)];
  } else selected = pick(players, 10);
  if (selected.length < 10) unavailable.add(stratum);
  else add("RECOMBINED_REAL_PLAYERS", stratum, selected.map(p => p.playerId));
}
if (rosterMap.size < 300) throw new Error("INSUFFICIENT_UNIQUE_ROSTERS");
const grouped = Map.groupBy([...rosterMap.values()], r => `${r.source}|${r.stratum}`);
let splitIndex = 0;
for (const group of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g)) {
  group.sort((a, b) => hash(`balance-research-20261018-v1|${a.playerIds.join("|")}`).localeCompare(hash(`balance-research-20261018-v1|${b.playerIds.join("|")}`)));
  for (const row of group) row.split = ["tuning", "tuning", "validation", "final"][splitIndex++ % 4];
}
const rosters = [...rosterMap.values()];
const byId = new Map(players.map(p => [p.playerId, p]));
for (const roster of rosters) {
  const selected = roster.playerIds.map(id => byId.get(id)!);
  if (roster.stratum === "MAIN_CONGESTION") assert.ok(["TOP", "JGL", "MID", "ADC", "SUP"].some(role => selected.filter(p => p.eligiblePositions.some(e => e.position === role && e.preference === "MAIN")).length >= 6));
  if (roster.stratum === "LOW_SAMPLE") assert.ok(selected.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5).length >= 6);
  if (roster.stratum === "UNKNOWN_TIER") assert.ok(selected.some(p => tiers.get(p.playerId) === null));
  if (roster.stratum === "JUNGLE_SHORTAGE" || roster.stratum === "SUPPORT_SHORTAGE") assert.ok(selected.every(p => !p.eligiblePositions.some(e => e.position === (roster.stratum === "JUNGLE_SHORTAGE" ? "JGL" : "SUP"))));
  if (roster.stratum === "SIMILAR_TIER") { const ranks = selected.map(p => tiers.get(p.playerId)!); assert.ok(Math.max(...ranks) - Math.min(...ranks) <= 2); }
}
const counts = [...Map.groupBy(rosters, r => `${r.source}|${r.stratum}|${r.split}`)].map(([key, values]) => ({ key, count: values.length }));
const manifest = { seed: 20261018, snapshotSha256: hash(raw), uniqueRosters: rosters.length, observed: rosters.filter(r => r.source !== "RECOMBINED_REAL_PLAYERS").length, recombined: rosters.filter(r => r.source === "RECOMBINED_REAL_PLAYERS").length, synthetic: 0, unavailableStrata: [...unavailable].filter(s => !rosters.some(r => r.stratum === s)), counts, rosters };
await writeFile(`${directory}/rosters.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ...manifest, rosters: undefined }, null, 2));
