import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isUsableTeamScoreResponse } from "../src/app/(admin)/admin/balance-ai/team-score-response";

const player = { playerId: "test-player", displayName: "Player", riotId: "Player#KR1", currentTier: null, peakTier: null };
const item = { ...player, score: 0, baseScore: 25, reason: "reset", revision: 1, updatedAt: "2026-10-09T00:00:00Z" };
const pagination = <T>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
const overview = {
  kind: "overview", formulaVersion: "test", ratingGeneration: null,
  scoreBasis: "ACTIVE_REGISTERED_PLAYERS_BASE_SCORE", activePlayerCount: 1,
  configured: pagination([item]), tiers: [{ tier: "UNRANKED", tierLabel: "Unranked", playerCount: 1, averageBaseScore: 25, medianBaseScore: 25 }],
};
const detail = {
  kind: "player", formulaVersion: "test", ratingGeneration: 1, player, previewPreference: "MAIN",
  override: { playerId: player.playerId, score: 0, reason: "reset", revision: 1, configured: true, updatedAt: item.updatedAt },
  history: pagination([{ id: 1, actorLabel: "Admin", beforeScore: null, afterScore: 0, reason: "reset", revision: 1, createdAt: item.updatedAt }]),
  breakdown: { baseScore: 25, overrideScore: 0, positions: ["TOP", "JGL", "MID", "ADC", "SUP"].map((position) => ({
    position, preference: "MAIN", baseScore: 25, soloForm: 0, positionSkill: 0, mmrBonus: 0, rolePenalty: 0, overrideScore: 0, effectiveScore: 25,
  })) },
};

test("team-score UI accepts complete overview and player responses", () => {
  assert.equal(isUsableTeamScoreResponse(overview, "overview", null), true);
  assert.equal(isUsableTeamScoreResponse(detail, "player", player.playerId), true);
  assert.equal(isUsableTeamScoreResponse({ ...overview, tiers: [] }, "overview", null), true);
});

test("team-score UI rejects missing arrays, invalid numbers, dates and mismatched player responses", () => {
  for (const invalid of [null, { ...overview, configured: {} }, { ...overview, tiers: null }, { ...overview, ratingGeneration: NaN },
    { ...overview, configured: pagination([{ ...item, baseScore: Infinity }]) }]) {
    assert.equal(isUsableTeamScoreResponse(invalid, "overview", null), false);
  }
  for (const invalid of [{ ...detail, breakdown: {} }, { ...detail, previewPreference: "AUTO" },
    { ...detail, breakdown: { ...detail.breakdown, positions: [] } },
    { ...detail, history: pagination([{ ...detail.history.items[0], createdAt: "invalid" }]) },
    { ...detail, breakdown: { ...detail.breakdown, positions: detail.breakdown.positions.map((position) => ({ ...position, soloForm: NaN })) } }]) {
    assert.equal(isUsableTeamScoreResponse(invalid, "player", player.playerId), false);
  }
  assert.equal(isUsableTeamScoreResponse(detail, "player", "different-player"), false);
  assert.equal(isUsableTeamScoreResponse(detail, "overview", null), false);
});

test("team-score UI hides mismatched revisions and reloads without discarding the draft", () => {
  const panels = readFileSync(new URL("../src/app/(admin)/admin/balance-ai/team-score-panels.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../src/app/(admin)/admin/balance-ai/team-balance-override-actions.tsx", import.meta.url), "utf8");
  assert.match(panels, /read\.data\.override\.revision !== currentRevision/);
  assert.match(panels, /const matchingData = read\.data\?\.override\.revision === currentRevision \? read\.data : null/);
  assert.match(panels, /id="team-score-stale-title"/);
  assert.match(actions, /currentRevision=\{current\.revision\}/);
  assert.match(actions, /onReload=\{\(\) => void load\(current\.playerId, true\)\}/);
});
