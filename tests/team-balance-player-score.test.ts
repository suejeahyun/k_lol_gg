import assert from "node:assert/strict";
import test from "node:test";

import { formatPlayerTierEditValue, playerTierEditState } from "../src/modules/players/domain/player-tier";
import {
  evaluateTeamBalanceLayout,
  evaluateTeamBalancePlayerScore,
  TEAM_BALANCE_POSITIONS,
  TEAM_BALANCE_TEAMS,
  TEAM_BALANCE_V1_FORMULA_VERSION,
  TeamBalanceDomainError,
  withTeamBalancePlayerOverride,
  type TeamBalancePlayer,
  type TeamBalancePosition,
  type TeamBalanceV1RatingInputs,
} from "../src/modules/team-tools/domain/team-balance";

function player(tier: string | null, input: Partial<TeamBalanceV1RatingInputs> = {}): TeamBalancePlayer {
  return {
    playerId: "score-subject",
    eligiblePositions: TEAM_BALANCE_POSITIONS.map((position) => ({ position, preference: "MAIN" })),
    rating: {
      overall: 50, confidence: 0, sampleSize: 0, positions: null,
      v1: {
        legacyPlayerId: null, currentTier: tier, peakTier: tier, season: null,
        internalGames: 0, internalPositionGames: {}, recentSolo: null,
        balanceOverrideScore: 0, mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [],
        ...input,
      },
    },
  };
}

function layoutWith(subject: TeamBalancePlayer, position: TeamBalancePosition = "TOP") {
  const layout = TEAM_BALANCE_TEAMS.flatMap((team) => TEAM_BALANCE_POSITIONS.map((slot) => ({
    team, position: slot, playerId: team === "BLUE" && slot === position ? subject.playerId : `${team}-${slot}`,
  })));
  const players = layout.map((entry) => entry.playerId === subject.playerId ? subject : { ...player("GOLD I"), playerId: entry.playerId });
  return evaluateTeamBalanceLayout(players, layout);
}

test("canonical UI Roman division values retain the same score as Korean numeric divisions", () => {
  const families = [
    ["IRON", "아이언", 10], ["BRONZE", "브론즈", 20], ["SILVER", "실버", 30],
    ["GOLD", "골드", 40], ["PLATINUM", "플래티넘", 50], ["EMERALD", "에메랄드", 60], ["DIAMOND", "다이아", 70],
  ] as const;
  for (const [family, korean, rawBase] of families) {
    for (const [index, division] of ["I", "II", "III", "IV"].entries()) {
      const canonical = formatPlayerTierEditValue(family, division);
      assert.equal(canonical, `${family} ${division}`);
      const expected = Number(((rawBase + 6 - index * 2) * 0.9 + 5).toFixed(2));
      const actual = evaluateTeamBalancePlayerScore(player(canonical!));
      assert.equal(actual.baseScore, expected, canonical!);
      assert.deepEqual(actual, evaluateTeamBalancePlayerScore(player(`${korean} ${index + 1}`)));
      assert.equal(layoutWith(player(canonical!)).assignments.find((entry) => entry.playerId === "score-subject")?.rating.effectiveScore, expected);
    }
  }
  assert.equal(evaluateTeamBalancePlayerScore(player("골드1")).baseScore, 46.4);
  assert.equal(evaluateTeamBalancePlayerScore(player("GOLD Ⅱ")).baseScore, 44.6);
});

test("canonical UI bare LP values use existing high-tier thresholds and caps", () => {
  const examples = [
    ["MASTER", "0", 78.8], ["MASTER", "99", 78.8], ["MASTER", "100", 81.5], ["MASTER", "120", 81.5],
    ["MASTER", "900", 103.1], ["MASTER", "9999", 103.1],
    ["GRANDMASTER", "199", 105.8], ["GRANDMASTER", "200", 106.7], ["GRANDMASTER", "450", 107.6], ["GRANDMASTER", "9999", 109.4],
    ["CHALLENGER", "199", 111.2], ["CHALLENGER", "200", 112.1], ["CHALLENGER", "1000", 115.7], ["CHALLENGER", "9999", 117.5],
  ] as const;
  for (const [family, lp, expected] of examples) {
    const canonical = formatPlayerTierEditValue(family, lp);
    assert.equal(canonical, `${family} ${lp}`);
    const score = evaluateTeamBalancePlayerScore(player(canonical!));
    assert.equal(score.baseScore, expected, canonical!);
    assert.deepEqual(score, evaluateTeamBalancePlayerScore(player(`${family} ${lp}LP`)));
    assert.equal(layoutWith(player(canonical!)).assignments.find((entry) => entry.playerId === "score-subject")?.rating.effectiveScore, expected);
  }
  assert.equal(evaluateTeamBalancePlayerScore(player("마스터 3층")).baseScore, 84.2);
  assert.equal(evaluateTeamBalancePlayerScore(player("그랜드마스터 450")).baseScore, 107.6);
  assert.equal(evaluateTeamBalancePlayerScore(player("챌린저 1000점")).baseScore, 115.7);
});

test("missing-tier fallback and established component weights remain unchanged", () => {
  assert.equal(evaluateTeamBalancePlayerScore(player(null)).baseScore, 32);
  assert.equal(evaluateTeamBalancePlayerScore(player(null, { peakTier: "GOLD II" })).baseScore, 41.96);
  assert.equal(evaluateTeamBalancePlayerScore(player("GOLD II", { peakTier: null })).baseScore, 44.6);
  const score = evaluateTeamBalancePlayerScore(player("골드1", {
    peakTier: "다이아2", season: { totalGames: 20, wins: 10, mvpCount: 2 },
    internalGames: 20, internalPositionGames: { TOP: 10 },
  }));
  assert.equal(score.baseScore, 64.7);
  assert.equal(score.positions[0]?.positionSkill, 2);
  assert.equal(score.positions[0]?.effectiveScore, 66.7);
});

test("editing legacy master floors preserves their score when the form saves canonical LP", () => {
  for (let floor = 1; floor <= 10; floor++) {
    const original = `마스터 ${floor}층`;
    const editing = playerTierEditState(original);
    assert.deepEqual(editing, { tier: "MASTER", detail: String((floor - 1) * 100) });
    const saved = formatPlayerTierEditValue(editing.tier, editing.detail);
    assert.equal(saved, `MASTER ${(floor - 1) * 100}`);
    assert.deepEqual(evaluateTeamBalancePlayerScore(player(saved!)), evaluateTeamBalancePlayerScore(player(original)));
    assert.equal(layoutWith(player(saved!)).assignments.find((entry) => entry.playerId === "score-subject")?.rating.effectiveScore,
      layoutWith(player(original)).assignments.find((entry) => entry.playerId === "score-subject")?.rating.effectiveScore);
  }
});

test("single-player breakdown and override preview share layout calculations for all positions", () => {
  const subject = {
    ...player("DIAMOND II", {
      season: { totalGames: 25, wins: 16, mvpCount: 4 },
      internalGames: 25, internalPositionGames: { TOP: 12, JGL: 6, MID: 3 },
      recentSolo: { games: 20, wins: 14, kda: 4, mainPosition: "TOP", subPosition: "MID", positionConfidence: 0.8, averageDamage: 25000, averageVisionScore: 25 },
      balanceOverrideScore: -80, mmr: { overall: 65, confidence: 0.8, positions: { TOP: 80, MID: 60 } },
    }),
    eligiblePositions: [{ position: "TOP", preference: "MAIN" }, { position: "MID", preference: "SUB" }] as const,
  };
  const score = evaluateTeamBalancePlayerScore(subject);
  const original = JSON.stringify(score);
  assert.deepEqual(score.positions.map((entry) => entry.position), TEAM_BALANCE_POSITIONS);
  assert.deepEqual(score.positions.map((entry) => entry.preference), ["MAIN", "AUTO", "SUB", "AUTO", "AUTO"]);
  assert.equal(score.positions[2]?.rolePenalty, 12, "canonical DIAMOND II receives high-tier sub-role penalty");
  assert.ok(score.positions.some((entry) => entry.effectiveScore === 0), "fixture exercises the lower clamp");
  for (const nextOverride of [-1000, 0, 3, 1000]) {
    const preview = withTeamBalancePlayerOverride(score, nextOverride);
    const updated = { ...subject, rating: { ...subject.rating!, v1: { ...subject.rating!.v1!, balanceOverrideScore: nextOverride } } };
    assert.deepEqual(preview, evaluateTeamBalancePlayerScore(updated));
    for (const position of preview.positions) {
      const evaluated = layoutWith(updated, position.position);
      assert.equal(position.effectiveScore, evaluated.assignments.find((entry) => entry.playerId === subject.playerId)?.rating.effectiveScore);
      assert.equal(evaluated.score.v1?.formulaVersion, TEAM_BALANCE_V1_FORMULA_VERSION);
    }
  }
  assert.equal(JSON.stringify(score), original, "preview never mutates the stored breakdown");
});

test("single-player fallback preserves confidence-adjusted position scores and validates input", () => {
  const subject: TeamBalancePlayer = { ...player(null), rating: {
    overall: 70, confidence: 0.5, sampleSize: 5, positions: { TOP: { score: 90, confidence: 0.8, sampleSize: 7 } },
  } };
  const score = evaluateTeamBalancePlayerScore(subject);
  assert.equal(score.baseScore, 60);
  assert.equal(score.overrideScore, 0);
  for (const position of score.positions) {
    assert.equal(position.effectiveScore, position.position === "TOP" ? 82 : 60);
    assert.equal(position.effectiveScore, layoutWith(subject, position.position).assignments.find((entry) => entry.playerId === subject.playerId)?.rating.effectiveScore);
  }
  for (const value of [1001, -1001, 0.5, Number.NaN]) {
    assert.throws(() => withTeamBalancePlayerOverride(score, value), (error) => error instanceof TeamBalanceDomainError && error.code === "INVALID_SCORE");
  }
  assert.throws(() => evaluateTeamBalancePlayerScore({ ...subject, eligiblePositions: [] }), (error) => error instanceof TeamBalanceDomainError && error.code === "MISSING_ELIGIBLE_POSITION");
  assert.throws(() => evaluateTeamBalancePlayerScore({ ...subject, playerId: " " }), (error) => error instanceof TeamBalanceDomainError && error.code === "INVALID_PLAYER_ID");
});

test("high-tier distribution warnings do not claim a main-role departure", () => {
  const allMain = layoutWith(player(formatPlayerTierEditValue("DIAMOND", "I")!));
  assert.ok(allMain.assignments.every((entry) => entry.preference === "MAIN"));
  assert.equal(allMain.score.v1?.highTierPriorityPenalty, 28);
  assert.ok(!allMain.score.v1?.warnings.includes("고티어 주포지션 이탈이 있습니다."));
  assert.ok(allMain.score.v1?.warnings.includes("고티어 인원 분포 차이가 있습니다."));
  assert.ok(allMain.score.v1?.warnings.includes("고티어 상대 라인 전력 차이가 있습니다."));
  const sub = layoutWith({ ...player("DIAMOND II"), eligiblePositions: [{ position: "TOP", preference: "SUB" }] });
  assert.ok(sub.score.v1?.warnings.includes("고티어 주포지션 이탈이 있습니다."));
  assert.ok(!layoutWith(player("GOLD I")).score.v1?.warnings.some((warning) => warning.startsWith("고티어")));
});
