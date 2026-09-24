import assert from "node:assert/strict";
import test from "node:test";
import type { RiotMatchDto, RiotMatchParticipantDto } from "../src/modules/riot/domain/riot-player-analytics";
import { aggregatePlayerMatches, DEFAULT_PLAYER_MATCH_FILTERS, filterPlayerMatches, koreanMatchDate, playerBuildAggregates, playerChampionAggregates, playerDailyAggregates, playerEncounters, playerLaneSnapshot, playerPositionAggregates, playerRankPoints, playerReportMetrics } from "../src/components/riot/player-analytics";

function participant(overrides: Partial<RiotMatchParticipantDto> = {}): RiotMatchParticipantDto {
  return { participantId: 1, teamId: 100, riotId: "Synthetic#TEST", championId: 1, championName: "Annie", position: "MID", win: true, kills: 5, deaths: 2, assists: 5, champLevel: 16, cs: 180, goldEarned: 12000, damageToChampions: 18000, damageTaken: null, visionScore: 24, wardsPlaced: null, wardsKilled: null, controlWardsBought: null, items: [1001, 2003, 0, 0, 0, 0, 3340], summonerSpells: [4, 14], runes: { primaryStyleId: 8100, secondaryStyleId: 8200, perkIds: [8112], statPerks: [5008] }, doubleKills: null, tripleKills: null, quadraKills: null, pentaKills: null, killingSprees: null, turretKills: null, turretPlatesTaken: null, inhibitorKills: null, objectivesStolen: null, damageToObjectives: 3000, ...overrides };
}
function match(overrides: Partial<RiotMatchDto> = {}, self: Partial<RiotMatchParticipantDto> = {}): RiotMatchDto {
  return { matchId: "KR_SYNTHETIC_1", startedAt: "2026-09-01T15:30:00.000Z", durationSeconds: 1800, queueId: 420, mapId: 11, gameVersion: "16.17.1", selfParticipantId: 1, remake: false, timelineStatus: "PENDING", participants: [participant(self), participant({ participantId: 2, riotId: "SyntheticAlly#TEST", position: "SUP" }), participant({ participantId: 6, teamId: 200, championId: 2, championName: "Olaf", riotId: "SyntheticEnemy#TEST", win: false })], teams: [], timeline: null, ...overrides };
}

test("Riot player filters compose over Korea dates, positions, patches and queues without changing the source", () => {
  const rows = [match(), match({ matchId: "KR_SYNTHETIC_2", queueId: 440 }), match({ matchId: "KR_SYNTHETIC_3", startedAt: "2026-09-01T14:59:00.000Z" })];
  assert.equal(koreanMatchDate(rows[0].startedAt), "2026-09-02");
  assert.deepEqual(filterPlayerMatches(rows, { ...DEFAULT_PLAYER_MATCH_FILTERS, from: "2026-09-02", to: "2026-09-02", queue: "420", position: "MID", patch: "16.17", champion: "1", result: "win" }).map((row) => row.matchId), ["KR_SYNTHETIC_1"]);
  assert.equal(rows[0].matchId, "KR_SYNTHETIC_1");
  assert.equal(filterPlayerMatches(rows, { ...DEFAULT_PLAYER_MATCH_FILTERS, result: "loss" }).length, 0);
});

test("Riot aggregations exclude remakes, preserve unknown roles and do not turn missing provider statistics into zero", () => {
  const rows = [match({}, { deaths: 0, cs: null, visionScore: null, position: null }), match({ remake: true }, { kills: 900 })];
  const total = aggregatePlayerMatches(rows);
  assert.equal(total.games, 1); assert.equal(total.kda, 10); assert.equal(total.csPerMinute, null); assert.equal(total.visionPerMinute, null);
  assert.equal(total.killParticipation, 100);
  assert.equal(total.perfect, true);
  assert.equal(aggregatePlayerMatches([match({}, { kills: 0, deaths: 0, assists: 0 })]).perfect, false);
  assert.equal(aggregatePlayerMatches([match({}, { kills: 0, deaths: 0, assists: 0 })]).kda, 0);
  const roles = playerPositionAggregates(rows);
  assert.equal(roles.find((row) => row.position === "UNKNOWN")?.share, 100);
  assert.equal(roles.reduce((sum, row) => sum + row.games, 0), 1);
  assert.equal(playerChampionAggregates(rows)[0].games, 1);
  assert.equal(playerDailyAggregates(rows)[0].date, "2026-09-02");
});

test("Riot KDA uses aggregate kills and deaths; per-minute values use each actual game duration", () => {
  const rows = [match(), match({ matchId: "KR_SYNTHETIC_2", durationSeconds: 1200 }, { kills: 1, assists: 1, deaths: 10, win: false })];
  const total = aggregatePlayerMatches(rows);
  assert.equal(total.kda, 1); assert.equal(total.winRate, 50); assert.equal(total.csPerMinute, 7.5);
  assert.equal(total.kills, 3); assert.equal(total.deaths, 6); assert.equal(total.assists, 3);
});

test("Champion turret-plate averages use observed values only, preserve real zero and exclude remakes", () => {
  const rows = [match({}, { turretPlatesTaken: 2 }), match({ matchId: "KR_SYNTHETIC_2" }, { turretPlatesTaken: 0 }), match({ matchId: "KR_SYNTHETIC_3" }, { turretPlatesTaken: null }), match({ matchId: "KR_SYNTHETIC_REMAKE", remake: true }, { turretPlatesTaken: 5 })];
  const total = aggregatePlayerMatches(rows);
  assert.equal(total.games, 3); assert.equal(total.turretPlateGames, 2); assert.equal(total.averageTurretPlates, 1);
  const champion = playerChampionAggregates(rows)[0];
  assert.equal(champion.turretPlateGames, 2); assert.equal(champion.averageTurretPlates, 1);
  const zero = aggregatePlayerMatches([match({}, { turretPlatesTaken: 0 })]);
  assert.equal(zero.averageTurretPlates, 0); assert.equal(zero.turretPlateGames, 1);
  const missing = aggregatePlayerMatches([match({}, { turretPlatesTaken: null })]);
  assert.equal(missing.averageTurretPlates, null); assert.equal(missing.turretPlateGames, 0);
});

test("Observed rank coordinates remain continuous across promotion and do not fabricate missing ranks", () => {
  const base = { date: "2026-09-02", wins: 10, losses: 5, recordedAt: "2026-09-02T00:00:00Z" };
  assert.equal(playerRankPoints({ ...base, tier: "GOLD", rank: "I", leaguePoints: 90 }), 1590);
  assert.equal(playerRankPoints({ ...base, tier: "PLATINUM", rank: "IV", leaguePoints: 10 }), 1610);
  assert.equal(playerRankPoints({ ...base, tier: null, rank: null, leaguePoints: null }), null);
  assert.equal(playerRankPoints({ ...base, tier: "MASTER", rank: "I", leaguePoints: 100 }), 2900);
});

test("Encounter summaries distinguish repeated same-team players from same-role opponent champions", () => {
  const rows = [match(), match({ matchId: "KR_SYNTHETIC_2" }, { win: false })];
  assert.equal(playerEncounters(rows, "ally")[0].label, "SyntheticAlly#TEST");
  assert.equal(playerEncounters(rows, "ally")[0].games, 2);
  assert.equal(playerEncounters(rows, "enemy")[0].label, "SyntheticEnemy#TEST");
  assert.equal(playerEncounters(rows, "opponent")[0].championId, 2);
  assert.equal(playerEncounters(rows, "opponent")[0].winRate, 50);
  assert.equal(playerEncounters([match({}, { position: null })], "opponent").length, 0);
});

test("Build aggregation treats reordered slots as one combination and excludes empty slots and trinkets", () => {
  const rows = [match(), match({ matchId: "KR_SYNTHETIC_2" }, { items: [2003, 1001, 0, 0, 0, 0, 3364], win: false })];
  const builds = playerBuildAggregates(rows, "items");
  assert.equal(builds.length, 1); assert.equal(builds[0].games, 2); assert.equal(builds[0].winRate, 50); assert.deepEqual(builds[0].ids, [1001, 2003]);
});

test("Laning and early participation reports require real timeline coverage rather than approximated results", () => {
  const noTimeline = match();
  assert.equal(playerLaneSnapshot(noTimeline, 15), null);
  assert.equal(playerReportMetrics([noTimeline]).find((row) => row.id === "lane")?.value, null);
  const withTimeline = match({ timelineStatus: "AVAILABLE", timeline: { frameInterval: 60000, frames: [{ timestamp: 900000, participants: [ { participantId: 1, totalGold: 6500, cs: 130, xp: 5000, level: 11, x: null, y: null }, { participantId: 6, totalGold: 5900, cs: 110, xp: 4500, level: 10, x: null, y: null }] }], events: [] } });
  assert.deepEqual(playerLaneSnapshot(withTimeline, 15), { gold: 600, cs: 20, xp: 500 });
  assert.equal(playerReportMetrics([withTimeline]).find((row) => row.id === "lane")?.value, 600);
  assert.equal(playerReportMetrics([withTimeline]).find((row) => row.id === "roam")?.value, 0);
  assert.equal(playerLaneSnapshot({ ...withTimeline, durationSeconds: 840 }, 15), null);
  const deferred = match({ timelineDeferred: true, timelineStatus: "AVAILABLE", timelineSummary: { goldDiffAt10: 200, csDiffAt10: 5, goldDiffAt15: 600, csDiffAt15: 20, xpDiffAt15: 500, earlyTakedowns: 3 } });
  assert.deepEqual(playerLaneSnapshot(deferred, 15), { gold: 600, cs: 20, xp: 500 });
  assert.equal(playerReportMetrics([deferred]).find((row) => row.id === "roam")?.value, 3);
});
