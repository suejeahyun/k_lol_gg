import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerReportSnapshot, parsePlayerReportSnapshots, playerReportStorageKey } from "../src/components/riot/player-report-snapshot";
import { DEFAULT_PLAYER_MATCH_FILTERS, filterPlayerMatches } from "../src/components/riot/player-analytics";
import { playerPurchaseHistory, playerTimelineBuilds } from "../src/components/riot/player-build-analytics";
import { normalizeRiotMatch } from "../src/modules/riot/domain/riot-match-normalizer";
import type { RiotMatchDto, RiotTimelineEventDto } from "../src/modules/riot/domain/riot-player-analytics";
import { analyticsMatch, analyticsPuuid } from "./fixtures/riot-analytics";

function match(): RiotMatchDto { const result = normalizeRiotMatch(analyticsMatch("KR_100", Date.parse("2026-09-15T00:00:00.000Z")), "KR_100", analyticsPuuid); assert.ok(result); return result; }
function event(input: Partial<RiotTimelineEventDto>): RiotTimelineEventDto { return { type: "ITEM_PURCHASED", timestamp: 0, participantId: 1, killerId: null, victimId: null, assistingParticipantIds: [], itemId: null, beforeId: null, afterId: null, skillSlot: null, monsterType: null, monsterSubType: null, buildingType: null, towerType: null, teamId: null, laneType: null, x: null, y: null, ...input }; }
function purchases(events: readonly RiotTimelineEventDto[]): RiotMatchDto { return { ...match(), timelineStatus: "AVAILABLE", timeline: { frameInterval: 60_000, frames: [], events } }; }

test("Report snapshots persist computed historical results and filters without raw matches or participant identities", () => {
  const input = { id: "synthetic-report", playerId: "synthetic-player", riotId: "Synthetic#TEST", createdAt: "2026-09-25T00:00:00Z", sourceUpdatedAt: "2026-09-24T00:00:00Z", filters: { ...DEFAULT_PLAYER_MATCH_FILTERS, patch: "16.18,16.19" }, matches: [match()] };
  const result = createPlayerReportSnapshot(input);
  assert.equal(result.aggregate.games, 1); assert.equal(result.metrics.length, 6); assert.deepEqual(result.matchIds, ["KR_100"]);
  const serialized = JSON.stringify([result]);
  assert.doesNotMatch(serialized, /puuid|participants|Synthetic1#TEST|private-not-for-projection|timeline/);
  assert.equal(parsePlayerReportSnapshots(serialized, input.playerId, input.riotId)[0].filters.patch, "16.18,16.19");
  assert.equal(parsePlayerReportSnapshots(serialized, "different-player", input.riotId).length, 0);
  assert.equal(parsePlayerReportSnapshots(serialized, input.playerId, "Different#TEST").length, 0);
  assert.notEqual(playerReportStorageKey(input.playerId, input.riotId), playerReportStorageKey(input.playerId, "Different#TEST"));
});

test("Malformed browser snapshots are rejected rather than crashing the report view", () => {
  const valid = createPlayerReportSnapshot({ id: "synthetic-report", playerId: "p", riotId: "R#T", createdAt: "2026-09-25T00:00:00Z", sourceUpdatedAt: "2026-09-24T00:00:00Z", filters: DEFAULT_PLAYER_MATCH_FILTERS, matches: [match()] });
  for (const input of ["{", "[]", JSON.stringify([{ ...valid, metrics: [null] }]), JSON.stringify([{ ...valid, aggregate: { games: 1 } }]), JSON.stringify([{ ...valid, formulaVersion: "future" }]), JSON.stringify(Array(11).fill(valid))]) assert.deepEqual(parsePlayerReportSnapshots(input, "p", "R#T"), []);
});

test("Multiple patch selections use a union and still intersect with other filters", () => {
  const rows = [match(), { ...match(), matchId: "KR_101", gameVersion: "16.18.1" }, { ...match(), matchId: "KR_102", gameVersion: "16.17.1" }, { ...match(), matchId: "KR_103", gameVersion: "16.18.1", queueId: 440 }];
  assert.deepEqual(filterPlayerMatches(rows, { ...DEFAULT_PLAYER_MATCH_FILTERS, patch: "16.18,16.19", queue: "420" }).map((row) => row.matchId), ["KR_100", "KR_101"]);
});

test("Purchase history removes undone purchases before classifying starting items and ordered cores", () => {
  const row = purchases([event({ timestamp: 20_000, itemId: 1001 }), event({ timestamp: 25_000, itemId: 1056 }), event({ timestamp: 30_000, type: "ITEM_UNDO", beforeId: 1056 }), event({ timestamp: 600_000, itemId: 3089 }), event({ timestamp: 601_000, type: "ITEM_UNDO", beforeId: 3089 }), event({ timestamp: 700_000, itemId: 3020 }), event({ timestamp: 1_000_000, itemId: 3157 }), event({ timestamp: 1_200_000, itemId: 3089 })]);
  assert.deepEqual(playerPurchaseHistory(row).map((item) => item.id), [1001, 3020, 3157, 3089]);
  assert.deepEqual(playerTimelineBuilds([row], "start").rows[0].ids, [1001]);
  assert.deepEqual(playerTimelineBuilds([row], "boots").rows[0].ids, [3020]);
  assert.deepEqual(playerTimelineBuilds([row], "core2").rows[0].ids, [3157, 3089]);
  assert.equal(playerTimelineBuilds([row], "core3").rows.length, 0);
});

test("Build adoption denominator includes observed matches that ended before a second core but excludes missing timelines", () => {
  const two = purchases([event({ timestamp: 800_000, itemId: 3157 }), event({ timestamp: 1_200_000, itemId: 3089 })]);
  const one = purchases([event({ timestamp: 800_000, itemId: 3157 })]);
  const rows = playerTimelineBuilds([two, one, match(), { ...two, remake: true }], "core2");
  assert.equal(rows.eligibleGames, 2); assert.equal(rows.rows[0].games, 1); assert.equal(rows.rows[0].pickRate, 50); assert.equal(rows.rows[0].winRate, 100);
});

test("Skill patterns preserve observed sequence and never infer missing level-ups", () => {
  const row = purchases([event({ type: "SKILL_LEVEL_UP", skillSlot: 1 }), event({ type: "SKILL_LEVEL_UP", skillSlot: 3 }), event({ type: "SKILL_LEVEL_UP", skillSlot: 2 })]);
  assert.deepEqual(playerTimelineBuilds([row], "skills").rows[0].ids, [1, 3, 2]);
});

test("Special map items use the official map classification and mode-specific adoption denominators", () => {
  const special = purchases([event({ timestamp: 800_000, itemId: 3039 })]);
  assert.equal(playerTimelineBuilds([special], "core1").rows.length, 0);
  const aram = { ...special, queueId: 450, mapId: 12 };
  assert.equal(playerTimelineBuilds([aram], "core1").rows[0].ids[0], 3039);
  const shared = purchases([event({ timestamp: 800_000, itemId: 3089 })]);
  const mixed = playerTimelineBuilds([shared, { ...shared, queueId: 450, mapId: 12 }], "core1");
  assert.equal(mixed.rows.length, 2);
  assert.ok(mixed.rows.every((row) => row.eligibleGames === 1 && row.pickRate === 100));
});
