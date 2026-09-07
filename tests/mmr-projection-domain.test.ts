import assert from "node:assert/strict";
import test from "node:test";

import {
  MMR_FORMULA_VERSION,
  MMR_POSITIONS,
  rebuildMmrProjection,
  toPublicMmrProfileDto,
  toTeamBalanceMmrProviderDto,
  type MmrMatchSource,
} from "../src/modules/mmr";

function participants(redWins: boolean) {
  return (["BLUE", "RED"] as const).flatMap((team) =>
    MMR_POSITIONS.map((position, index) => ({
      playerId: `${team.toLowerCase()}-${position.toLowerCase()}`,
      team,
      position,
      kills: redWins === (team === "RED") ? 8 - index : 2,
      deaths: redWins === (team === "RED") ? 2 : 7,
      assists: position === "SUP" ? 14 : 6,
    })),
  );
}

function match(overrides: Partial<MmrMatchSource> = {}): MmrMatchSource {
  return {
    id: "match-1",
    orderKey: "2026-09-01:match-1",
    status: "PUBLISHED",
    games: [{
      id: "game-1",
      gameNumber: 1,
      winnerTeam: "RED",
      participants: participants(true),
    }],
    ...overrides,
  };
}

test("MMR rebuild is deterministic and ignores source array order", () => {
  const second = match({
    id: "match-2",
    orderKey: "2026-09-02:match-2",
    games: [{ id: "game-2", gameNumber: 1, winnerTeam: "BLUE", participants: participants(false) }],
  });
  const left = rebuildMmrProjection({ generation: 4, matches: [second, match()] });
  const right = rebuildMmrProjection({ generation: 4, matches: [match(), second] });
  assert.deepEqual(left, right);
  assert.equal(left.sourceMatchCount, 2);
  assert.equal(left.sourceGameCount, 2);
  assert.equal(left.matchEvents.length, 20);
  assert.ok(left.matchEvents.every((row) => row.formulaVersion === MMR_FORMULA_VERSION));
});

test("voided and draft matches never affect profiles", () => {
  const projection = rebuildMmrProjection({
    generation: 1,
    matches: [match({ status: "VOIDED" }), match({ id: "draft", status: "DRAFT" })],
  });
  assert.deepEqual(projection.profiles, []);
  assert.equal(projection.sourceMatchCount, 0);
});

test("winner and position performance update profiles within bounded scores", () => {
  const projection = rebuildMmrProjection({ generation: 1, matches: [match()] });
  const winner = projection.profiles.find((row) => row.playerId === "red-mid");
  const loser = projection.profiles.find((row) => row.playerId === "blue-mid");
  assert.ok(winner && loser);
  assert.ok(winner.overallScoreBp > loser.overallScoreBp);
  assert.ok(winner.positions.MID.scoreBp > loser.positions.MID.scoreBp);
  assert.equal(winner.sampleSize, 1);
  assert.equal(winner.positions.MID.sampleSize, 1);
  assert.equal(winner.confidenceBp, 333);
  assert.ok(projection.profiles.every((row) => row.overallScoreBp >= 100 && row.overallScoreBp <= 10_000));
});

test("manual adjustments are immutable ordered events and clamp at profile bounds", () => {
  const projection = rebuildMmrProjection({
    generation: 2,
    matches: [],
    manualAdjustments: [
      { id: "adjust-2", orderKey: "02", playerId: "player-a", position: "TOP", deltaBp: -1_000, reasonCode: "REVIEWED" },
      { id: "adjust-1", orderKey: "01", playerId: "player-a", position: null, deltaBp: 700, reasonCode: "CALIBRATION" },
    ],
  });
  assert.equal(projection.profiles[0]?.overallScoreBp, 5_700);
  assert.equal(projection.profiles[0]?.positions.TOP.scoreBp, 4_000);
  assert.deepEqual(projection.adjustmentEvents.map((row) => row.sourceEventId), ["adjust-1", "adjust-2"]);
  assert.equal(projection.profiles[0]?.sampleSize, 0);
});

test("public and team-balance DTOs expose only bounded score summaries", () => {
  const profile = rebuildMmrProjection({ generation: 1, matches: [match()] }).profiles[0];
  assert.ok(profile);
  const publicDto = toPublicMmrProfileDto(profile);
  const balanceDto = toTeamBalanceMmrProviderDto(profile);
  assert.deepEqual(Object.keys(publicDto).sort(), ["confidence", "overallScore", "playerId", "positions", "sampleSize"]);
  assert.equal("reasonCode" in publicDto, false);
  assert.ok(balanceDto.overall >= 1 && balanceDto.overall <= 100);
  assert.ok(balanceDto.positions.TOP.confidence >= 0 && balanceDto.positions.TOP.confidence <= 1);
});

test("malformed rosters, duplicate sources and unsafe adjustments fail closed", () => {
  assert.throws(
    () => rebuildMmrProjection({ generation: 1, matches: [match({ games: [{ id: "bad", gameNumber: 1, winnerTeam: "RED", participants: participants(true).slice(0, 9) }] })] }),
    /INVALID_GAME_PARTICIPANT_COUNT/,
  );
  assert.throws(
    () => rebuildMmrProjection({ generation: 1, matches: [match(), match()] }),
    /DUPLICATE_MMR_SOURCE_ID/,
  );
  assert.throws(
    () => rebuildMmrProjection({ generation: 1, matches: [], manualAdjustments: [{ id: "a", orderKey: "1", playerId: "p", position: null, deltaBp: 1_001, reasonCode: "BAD" }] }),
    /INVALID_ADJUSTMENT_DELTA/,
  );
});
