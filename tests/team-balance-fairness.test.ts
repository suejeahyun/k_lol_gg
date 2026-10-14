import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInhouseFairness,
  getInhouseLaneDirection,
  INHOUSE_FAIRNESS_POSITIONS,
  measureInhouseMatchup,
  parseInhouseMajorTier,
  type InhouseFairnessAssignment,
  type InhouseFairnessReport,
} from "../src/modules/team-tools/domain/inhouse-fairness";

type Assignment = InhouseFairnessAssignment;
function roster(red = [60, 60, 60, 60, 60], blue = [60, 60, 60, 60, 60]): Assignment[] {
  return (["RED", "BLUE"] as const).flatMap((team, t) =>
    INHOUSE_FAIRNESS_POSITIONS.map((position, p) => ({
      playerId: String(t * 5 + p + 1), team, position, roleType: "MAIN" as const,
      score: (t ? blue : red)[p], finalBaseScore: (t ? blue : red)[p],
      currentTier: "골드4", peakTier: "플래티넘1",
      mainPositions: [position], subPositions: [],
    })));
}
function status(report: InhouseFairnessReport, code: string) {
  const check = report.checks.find((item) => item.code === code);
  assert.ok(check, `missing check: ${code}`);
  return check.status;
}
const check = test;
function metricsAgree(players: Assignment[]) {
  const report = evaluateInhouseFairness(players);
  const ordered = (team: "RED" | "BLUE") => INHOUSE_FAIRNESS_POSITIONS.map((position) =>
    players.find((a) => a.team === team && a.position === position)!);
  const metric = measureInhouseMatchup(ordered("RED"), ordered("BLUE"));
  assert.equal(metric.hardViolationCount, report.hardViolations.length);
  assert.deepEqual(metric.ruleViolations, report.ruleViolations, "fast/full numbered-rule priorities disagree");
  for (const field of ["qualityViolationCount", "directionalPenalty", "unknownTierCount", "autoCount",
    "autoImbalance", "maxLaneGap", "totalGap", "largeLaneCount", "bottomGap", "lineGapTotal"] as const) {
    assert.equal(metric[field], report[field], `metric/report disagree: ${field}`);
  }
  return report;
}

check("major tiers include Korean/English aliases and ignore divisions/LP", () => {
  assert.equal(parseInhouseMajorTier("Gold IV"), 3);
  assert.equal(parseInhouseMajorTier("골드 1 (25LP)"), 3);
  assert.equal(parseInhouseMajorTier("EMERALD II"), 5);
  assert.equal(parseInhouseMajorTier("다4"), 6);
  assert.equal(parseInhouseMajorTier("마스터 3층"), 7);
  assert.equal(parseInhouseMajorTier("Grandmaster 450 LP"), 8);
  assert.equal(parseInhouseMajorTier("GRANDMASTER 450"), 8);
  assert.equal(parseInhouseMajorTier("MASTER 0"), 7);
  assert.equal(parseInhouseMajorTier("GOLD Ⅱ"), 3);
  assert.equal(parseInhouseMajorTier("아이언4"), 0);
  for (const value of ["", "UNRANKED", "silverfish", "goldfish", "그랜드", "DIAMOND 9", "미등록"]) {
    assert.equal(parseInhouseMajorTier(value), null, value);
  }
});

check("equal teams and the agreed example pass", () => {
  assert.equal(metricsAgree(roster()).status, "BALANCED");
  const report = metricsAgree(roster([70, 72, 58, 65, 55], [60, 60, 72, 60, 68]));
  assert.equal(report.status, "BALANCED");
  assert.equal(report.totalGap, 0);
  assert.equal(report.bottomGap, 8);
});

check("exactly three major tiers are forbidden; two and three divisions are allowed", () => {
  const players = roster();
  players[3].currentTier = "다이아몬드4";
  assert.equal(metricsAgree(players).status, "INVALID");
  assert.equal(status(evaluateInhouseFairness(players), "BOTTOM_TIER_ADC"), "FAIL");
  players[3].currentTier = "에메랄드1";
  assert.equal(metricsAgree(players).status, "BALANCED");
  players[3].currentTier = "골드1";
  assert.equal(metricsAgree(players).status, "BALANCED");
});

check("ADC and SUP limits are independent and cannot cancel each other", () => {
  const players = roster();
  players[3].currentTier = "다이아4";
  players[9].currentTier = "다이아4";
  const report = metricsAgree(players);
  assert.equal(report.hardViolations.length, 2);
  assert.equal(report.status, "INVALID");
  assert.equal(report.ruleViolations?.[3], 2, "rule 4 counts both forbidden bottom matchups");
});

check("role discount and peak tier cannot bypass current-tier limits", () => {
  const players = roster();
  players[3].currentTier = "다이아4";
  players[3].peakTier = "골드4";
  players[3].score = 40;
  players[3].roleType = "SUB";
  const snapshot = JSON.stringify(players);
  assert.equal(metricsAgree(players).status, "INVALID");
  assert.equal(JSON.stringify(players), snapshot, "evaluation must not mutate strength or input");
});

check("unknown current tier requires review even when peak tier is known", () => {
  const players = roster();
  players[3].currentTier = "UNRANKED";
  players[3].peakTier = "챌린저";
  const report = metricsAgree(players);
  assert.equal(report.status, "REVIEW_REQUIRED");
  assert.equal(report.unknownTierCount, 1);
  assert.equal(status(report, "BOTTOM_TIER_ADC"), "WARN");
  players[4].currentTier = "다이아4";
  assert.equal(metricsAgree(players).status, "INVALID", "known prohibition wins over missing data");
});

check("opposing large lane gaps do not disappear into equal team totals", () => {
  const report = metricsAgree(roster([80, 60, 40, 60, 60]));
  assert.equal(report.totalGap, 0);
  assert.equal(report.largeLaneCount, 2);
  assert.equal(report.qualityViolationCount, 1);
  assert.equal(status(report, "MULTIPLE_LARGE_GAPS"), "WARN");
});

check("quality thresholds preserve inclusive ties and exact boundaries", () => {
  assert.equal(getInhouseLaneDirection(3), 0);
  assert.equal(getInhouseLaneDirection(-3), 0);
  assert.equal(getInhouseLaneDirection(3.01), 1);
  assert.equal(getInhouseLaneDirection(-3.01), -1);
  assert.equal(getInhouseLaneDirection(3.00005), -getInhouseLaneDirection(-3.00005));
  assert.equal(status(metricsAgree(roster([85, 35, 60, 60, 60])), "MAX_LANE_GAP"), "PASS");
  assert.equal(status(metricsAgree(roster([85.01, 34.99, 60, 60, 60])), "MAX_LANE_GAP"), "WARN");
  assert.equal(status(metricsAgree(roster([63, 63, 63, 63, 63])), "TEAM_POWER"), "PASS");
  assert.equal(status(metricsAgree(roster([63.01, 63, 63, 63, 63])), "TEAM_POWER"), "WARN");
  assert.equal(status(metricsAgree(roster([60, 60, 60, 70, 60])), "BOTTOM_POWER"), "PASS");
  assert.equal(status(metricsAgree(roster([60, 60, 60, 70.01, 60])), "BOTTOM_POWER"), "WARN");
});

check("compensation stacking retains both teams' usable carry lanes", () => {
  const report = metricsAgree(roster([56, 80, 56, 56, 52]));
  assert.equal(status(report, "SUPPORT_JUNGLE"), "PASS");
  assert.equal(status(report, "JUNGLE_CARRY_LANE"), "WARN");
  assert.equal(status(report, "BOTH_WIN_PATHS"), "WARN");
  assert.equal(report.ruleViolations?.[2], 1, "two explanations of the same missing carry path count once");
  const repaired = metricsAgree(roster([57, 80, 56, 56, 52]));
  assert.equal(status(repaired, "JUNGLE_CARRY_LANE"), "PASS", "a tied lane is usable");
  assert.equal(status(repaired, "BOTH_WIN_PATHS"), "PASS");
});

check("same-team top/mid and ADC/SUP advantages are diagnosed", () => {
  const report = metricsAgree(roster([65, 50, 65, 65, 65]));
  assert.equal(status(report, "TOP_MID_SPLIT"), "WARN");
  assert.equal(status(report, "BOTTOM_SPLIT"), "WARN");
  const neutralMid = metricsAgree(roster([65, 50, 63, 65, 65]));
  assert.equal(status(neutralMid, "TOP_MID_SPLIT"), "PASS");
});

check("weak support needs a tied or stronger jungle without altering scores", () => {
  assert.equal(status(metricsAgree(roster([60, 64, 60, 60, 64])), "SUPPORT_JUNGLE"), "WARN");
  assert.equal(status(metricsAgree(roster([60, 63, 60, 60, 64])), "SUPPORT_JUNGLE"), "PASS");
  assert.equal(status(metricsAgree(roster([60, 56, 60, 60, 64])), "SUPPORT_JUNGLE"), "PASS");
});

check("top players split when possible without forcing impossible roles", () => {
  const players = roster();
  players[3].finalBaseScore = 100;
  players[8].finalBaseScore = 99;
  let report = metricsAgree(players);
  assert.equal(status(report, "TOP_PLAYERS_SPLIT"), "PASS");
  assert.equal(status(report, "TOP_PLAYERS_MID_JUNGLE"), "PASS");
  players[3].subPositions = ["MID"];
  players[8].subPositions = ["JGL"];
  report = metricsAgree(players);
  assert.equal(status(report, "TOP_PLAYERS_MID_JUNGLE"), "WARN");
  players[8].finalBaseScore = 60;
  players[2].finalBaseScore = 99;
  assert.equal(status(metricsAgree(players), "TOP_PLAYERS_SPLIT"), "WARN");
});

check("ties do not depend on array ordering or player IDs", () => {
  const players = roster();
  const original = metricsAgree(players);
  const permuted = metricsAgree([...players].reverse().map((a) => ({ ...a, playerId: String(100 - Number(a.playerId)) })));
  assert.deepEqual(permuted, original);
});

check("mid/jungle priority cannot claim success by forcing the two players into reversed capabilities", () => {
  const players = roster();
  players[2].finalBaseScore = 100;
  players[6].finalBaseScore = 99;
  players[2].mainPositions = ["JGL"];
  players[6].mainPositions = ["MID"];
  players[2].roleType = "AUTO";
  players[6].roleType = "AUTO";
  assert.equal(status(metricsAgree(players), "TOP_PLAYERS_MID_JUNGLE"), "WARN");
  players[2].subPositions = ["MID"];
  players[6].subPositions = ["JGL"];
  assert.equal(status(metricsAgree(players), "TOP_PLAYERS_MID_JUNGLE"), "PASS");
});

check("off-role burden is counted and disclosed independently of team strength", () => {
  const players = roster();
  players[0].roleType = "AUTO";
  players[1].roleType = "AUTO";
  const report = metricsAgree(players);
  assert.equal(report.autoCount, 2);
  assert.equal(report.autoImbalance, 2);
  assert.equal(report.status, "CONDITIONAL");
  players[1].roleType = "MAIN";
  players[5].roleType = "AUTO";
  assert.equal(metricsAgree(players).autoImbalance, 0);
});

check("explicit possible positions constrain manual edits while legacy inputs stay valid", () => {
  const players = roster();
  assert.equal(metricsAgree(players).status, "BALANCED");
  players[0].allowedPositions = ["MID"];
  let report = metricsAgree(players);
  assert.equal(report.status, "INVALID");
  assert.equal(status(report, "ALLOWED_POSITION_1"), "FAIL");
  players[0].allowedPositions = ["TOP"];
  assert.equal(metricsAgree(players).status, "BALANCED");
  players[0].allowedPositions = [];
  report = metricsAgree(players);
  assert.equal(report.status, "INVALID", "an explicit empty capability set must not mean unrestricted");
});

check("invalid roster, duplicate player, duplicate role and nonfinite scores fail", () => {
  assert.equal(evaluateInhouseFairness(roster().slice(1)).status, "INVALID");
  const duplicates = roster();
  duplicates[1].playerId = duplicates[0].playerId;
  assert.equal(evaluateInhouseFairness(duplicates).status, "INVALID");
  const roles = roster();
  roles[1].position = "TOP";
  assert.equal(evaluateInhouseFairness(roles).status, "INVALID");
  const invalid = roster();
  invalid[0].score = NaN;
  assert.equal(evaluateInhouseFairness(invalid).status, "INVALID");
  assert.equal(evaluateInhouseFairness(invalid).totalGap, 0);
});

check("search metrics match full evaluation and stay symmetric across 200 varied cases", () => {
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const tiers = ["골드1", "다이아4", "에메랄드3", "", "SILVER II"];
  for (let n = 0; n < 200; n += 1) {
    const players = roster().map((a) => ({
      ...a, score: Math.round((35 + random() * 55) * 100) / 100,
      finalBaseScore: Math.floor(random() * 7) * 10 + 40,
      currentTier: tiers[Math.floor(random() * tiers.length)],
      roleType: random() > 0.85 ? "AUTO" as const : "MAIN" as const,
      subPositions: ["MID", "JGL"] as const,
    }));
    const original = metricsAgree(players);
    const mirrored = metricsAgree(players.map((a) => ({ ...a, team: a.team === "RED" ? "BLUE" : "RED" })));
    for (const field of ["status", "qualityViolationCount", "directionalPenalty", "unknownTierCount", "autoCount",
      "autoImbalance", "maxLaneGap", "totalGap", "largeLaneCount", "bottomGap", "lineGapTotal"] as const) {
      assert.equal(original[field], mirrored[field], `side-dependent result: ${field}, fixture ${n}`);
    }
    assert.equal(original.hardViolations.length, mirrored.hardViolations.length);
    assert.deepEqual(original.ruleViolations, mirrored.ruleViolations, "numbered priority must be team-color neutral");
  }
});
