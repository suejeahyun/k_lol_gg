import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAdoption, type ComparisonRow } from "../scripts/balance-severity/gates";
import { classifyPareto, PARETO_KEYS, type Metrics } from "../scripts/balance-severity/metrics";

// These synthetic metric-level fixtures isolate acceptance policy. The separate
// domain/oracle tests establish that actual layouts produce consistent metrics.
function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    teamGap: 8, lanes: [40, 20, 4, 10, 8], laneSum: 82, maxLaneGap: 40,
    largeLaneCount: 2, adcGap: 10, supportGap: 8, bottomGap: 2,
    mainCount: 6, subCount: 2, autoCount: 2, registeredAutoCount: 2,
    unregistered: 0, burdenImbalance: 2, subImbalance: 2,
    rules: [0, 0, 0, 0, 0, 0], bottomViolations: 0, bottomExcess: 0,
    unknownTier: 0, confidence: 0.5, zeroSampleCount: 0, missingSourceCount: 0,
    cost: 100, risk: [0, 0, 0, 2, 30, 0, 2, 0, 0, 0, 0, 0, 0, 0, 100],
    signedLaneGaps: [40, -20, -4, 10, -8], blueSeverelyDisadvantagedLanes: 1,
    redSeverelyDisadvantagedLanes: 1, lanesOver25: 1, laneExcessOver25: 15,
    qualityViolationCount: 2, excessRisk: 30,
    verification: {
      ADC: { known: true, currentMajorTierGap: 0, passes: true, missingPlayerCount: 0 },
      SUP: { known: true, currentMajorTierGap: 0, passes: true, missingPlayerCount: 0 },
    },
    ...overrides,
  };
}

function passingRows(count = 20): ComparisonRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-roster-${index}`, subgroups: ["ALL_SYNTHETIC"],
    baseline: metrics(), candidate: metrics({ maxLaneGap: 36 }),
  }));
}

function assertAccepted(rows: ComparisonRow[]) {
  const result = evaluateAdoption(rows);
  assert.equal(result.accepted, true, result.failures.join("\n"));
  assert.deepEqual(result.failures, []);
  return result;
}

function assertFailure(rows: ComparisonRow[], failure: string) {
  const result = evaluateAdoption(rows);
  assert.equal(result.accepted, false);
  assert.ok(result.failures.includes(failure), JSON.stringify(result.failures));
  return result;
}

test("severity gates accept an independent improvement despite worse old ranking diagnostics", () => {
  const rows = passingRows();
  for (const row of rows) {
    row.candidate.risk = row.candidate.risk.map(() => 999);
    row.candidate.cost = 999;
    row.candidate.excessRisk = 999;
    row.candidate.qualityViolationCount = 3;
    row.candidate.rules = [1, 1, 1, 1, 1, 1];
  }
  const before = structuredClone(rows);
  assertAccepted(rows);
  assert.deepEqual(rows, before, "evaluation must not rewrite input metrics");
});

test("severity primary requires a strictly better mean and a material three-point example", () => {
  const unchanged = passingRows();
  unchanged.forEach(row => { row.candidate.maxLaneGap = row.baseline.maxLaneGap; });
  assertFailure(unchanged, "PRIMARY_MEAN_NOT_STRICTLY_IMPROVED");

  const tooSmall = passingRows();
  tooSmall.forEach(row => { row.candidate.maxLaneGap = row.baseline.maxLaneGap - 2.9999; });
  assertFailure(tooSmall, "NO_MAX_LANE_IMPROVEMENT_AT_LEAST_3");
  tooSmall[0].candidate.maxLaneGap = tooSmall[0].baseline.maxLaneGap - 3;
  assertAccepted(tooSmall);
});

test("a better maximum-lane mean cannot hide a worse p95", () => {
  const rows = passingRows();
  rows[19].baseline.maxLaneGap = 60;
  rows[19].candidate.maxLaneGap = 60;
  rows[18].candidate.maxLaneGap = 43;
  const result = assertFailure(rows, "OVERALL_REGRESSION:maxLaneGap:p95");
  assert.ok(!result.failures.includes("PRIMARY_MEAN_NOT_STRICTLY_IMPROVED"));
  assert.ok(!result.failures.includes("OVERALL_REGRESSION:maxLaneGap:max"));
  assert.ok(!result.failures.some(failure => failure.startsWith("INDIVIDUAL_")));
});

test("better maximum-lane mean and p95 cannot hide a worse absolute maximum", () => {
  const rows = passingRows();
  rows[19].baseline.maxLaneGap = 60;
  rows[19].candidate.maxLaneGap = 63;
  const result = assertFailure(rows, "OVERALL_REGRESSION:maxLaneGap:max");
  assert.ok(!result.failures.includes("PRIMARY_MEAN_NOT_STRICTLY_IMPROVED"));
  assert.ok(!result.failures.includes("OVERALL_REGRESSION:maxLaneGap:p95"));
  assert.ok(!result.failures.some(failure => failure.startsWith("INDIVIDUAL_")));
});

test("each strength metric enforces the individual three-point ceiling despite better aggregate tails", () => {
  for (const key of ["maxLaneGap", "teamGap", "adcGap", "supportGap", "bottomGap"] as const) {
    const rows = passingRows();
    rows.forEach((row, index) => {
      row.baseline[key] = index === 0 ? 20 : 60;
      row.candidate[key] = index === 0 ? 23 : 55;
    });
    assertAccepted(rows);
    rows[0].candidate[key] = 23.000000005;
    assertAccepted(rows);
    rows[0].candidate[key] = 23.0001;
    const result = assertFailure(rows, `INDIVIDUAL_INCREASE_OVER_3:${key}:${rows[0].id}`);
    assert.ok(!result.failures.some(failure => failure.startsWith("OVERALL_REGRESSION")));
  }
});

test("large-lane and burden increases use one-person ceilings rather than the strength allowance", () => {
  for (const key of ["largeLaneCount", "autoCount", "burdenImbalance", "subImbalance"] as const) {
    const rows = passingRows();
    rows.forEach((row, index) => {
      row.baseline[key] = index === 0 ? 0 : 3;
      row.candidate[key] = index === 0 ? 1 : 2;
    });
    assertAccepted(rows);
    rows[0].candidate[key] = 2;
    const result = assertFailure(rows, `INDIVIDUAL_INCREASE_OVER_1:${key}:${rows[0].id}`);
    assert.ok(!result.failures.some(failure => failure.startsWith("OVERALL_REGRESSION")));
  }
});

test("other strength and burden metrics have their own aggregate gates", () => {
  for (const key of ["teamGap", "adcGap", "supportGap", "bottomGap", "largeLaneCount", "autoCount", "burdenImbalance", "subImbalance"] as const) {
    const rows = passingRows();
    rows.forEach(row => { row.candidate[key] = row.baseline[key] + 1; });
    const result = assertFailure(rows, `OVERALL_REGRESSION:${key}:mean`);
    assert.ok(result.failures.includes(`OVERALL_REGRESSION:${key}:p95`));
    assert.ok(result.failures.includes(`OVERALL_REGRESSION:${key}:max`));
    assert.ok(!result.failures.some(failure => failure.startsWith("INDIVIDUAL_")));
  }
});

test("a fully quality-compliant baseline cannot acquire a warning", () => {
  const rows = passingRows();
  rows[0].baseline = metrics({ maxLaneGap: 20, largeLaneCount: 1, qualityViolationCount: 0 });
  rows[0].candidate = metrics({ maxLaneGap: 16, largeLaneCount: 1, qualityViolationCount: 0 });
  assertAccepted(rows);
  rows[0].candidate.qualityViolationCount = 1;
  assertFailure(rows, `QUALITY_COMPLIANCE_LOST:${rows[0].id}`);
});

test("the selected bottom violation, excess and unregistered prefix must remain exactly equal", () => {
  for (const key of ["bottomViolations", "bottomExcess", "unregistered"] as const) {
    for (const direction of [-1, 1]) {
      const rows = passingRows();
      rows[0].baseline[key] = 1;
      rows[0].candidate[key] = 1 + direction;
      assertFailure(rows, `RELAXATION_PREFIX_CHANGED:${key}:${rows[0].id}`);
    }
  }
});

test("a protected group of ten cannot be hidden by global improvements; nine is disclosed without a safety claim", () => {
  const rows = passingRows();
  rows.forEach((row, index) => {
    row.baseline.adcGap = index < 10 ? 4 : 20;
    row.candidate.adcGap = index < 10 ? 5 : 18;
    if (index < 9) row.subgroups.push("SMALL_PROTECTED_GROUP");
  });
  const nine = assertAccepted(rows).groups.find(group => group.name === "SMALL_PROTECTED_GROUP")!;
  assert.equal(nine.count, 9);
  assert.equal(nine.gateApplies, false);
  assert.deepEqual(nine.regressions, ["adcGap:mean", "adcGap:p95", "adcGap:max"]);
  rows[9].subgroups.push("SMALL_PROTECTED_GROUP");
  const ten = assertFailure(rows, "PROTECTED_GROUP_REGRESSION:SMALL_PROTECTED_GROUP:adcGap:mean");
  assert.equal(ten.groups.find(group => group.name === "SMALL_PROTECTED_GROUP")!.gateApplies, true);
  assert.ok(!ten.failures.some(failure => failure.startsWith("OVERALL_REGRESSION")));
});

test("small protected groups still obey individual ceilings", () => {
  const rows = passingRows();
  rows[0].subgroups.push("ONE_PLAYER_GROUP");
  rows[0].baseline.supportGap = 1;
  rows[0].candidate.supportGap = 4;
  rows.slice(1).forEach(row => { row.candidate.supportGap = 7; });
  assertAccepted(rows);
  rows[0].candidate.supportGap = 4.001;
  assertFailure(rows, `INDIVIDUAL_INCREASE_OVER_3:supportGap:${rows[0].id}`);
});

test("every protected strength and burden metric can veto an otherwise improving whole population", () => {
  const strength = ["maxLaneGap", "teamGap", "adcGap", "supportGap", "bottomGap"] as const;
  const burden = ["autoCount", "burdenImbalance", "subImbalance"] as const;
  for (const key of [...strength, ...burden]) {
    const rows = passingRows();
    const isBurden = burden.some(value => value === key);
    rows.forEach((row, index) => {
      row.baseline[key] = index < 10 ? isBurden ? 0 : 20 : isBurden ? 3 : 60;
      row.candidate[key] = index < 10 ? isBurden ? 1 : 21 : isBurden ? 2 : 50;
    });
    assertAccepted(rows);
    rows.slice(0, 10).forEach(row => { row.subgroups.push("PROTECTED_TEN"); });
    const result = assertFailure(rows, `PROTECTED_GROUP_REGRESSION:PROTECTED_TEN:${key}:mean`);
    assert.ok(result.failures.includes(`PROTECTED_GROUP_REGRESSION:PROTECTED_TEN:${key}:max`));
    if (!isBurden) assert.ok(result.failures.includes(`PROTECTED_GROUP_REGRESSION:PROTECTED_TEN:${key}:p95`));
    assert.ok(!result.failures.some(failure => failure.startsWith("OVERALL_REGRESSION")));
  }
});

test("Pareto reports mixed tradeoffs separately on the fixed independent vector", () => {
  const base = metrics();
  assert.equal(classifyPareto(base, metrics()), "identical");
  assert.equal(classifyPareto(base, metrics({ maxLaneGap: 36, teamGap: 9 })), "mixed");
  for (const key of PARETO_KEYS) {
    assert.equal(classifyPareto(base, metrics({ [key]: base[key] - 1 })), "improved", key);
    assert.equal(classifyPareto(base, metrics({ [key]: base[key] + 1 })), "worsened", key);
  }
  assert.equal(classifyPareto(base, metrics({
    cost: 999, risk: [999], excessRisk: 999, qualityViolationCount: 4,
    rules: [9, 9, 9, 9, 9, 9], confidence: 0, zeroSampleCount: 10,
  })), "identical", "diagnostics must not silently change the preregistered vector");
  assert.equal(classifyPareto(base, metrics({ maxLaneGap: 40 + 5e-9 })), "identical");
  assert.equal(classifyPareto(base, metrics({ maxLaneGap: 40 + 2e-8 })), "worsened");
});

test("an empty evaluation cannot pass adoption", () => {
  assert.throws(() => evaluateAdoption([]), { message: "ADOPTION_REQUIRES_OBSERVATIONS" });
});

test("non-finite gate measurements fail closed instead of bypassing comparisons", () => {
  for (const key of ["maxLaneGap", "teamGap", "adcGap", "supportGap", "bottomGap", "largeLaneCount", "autoCount", "burdenImbalance", "subImbalance", "bottomViolations", "bottomExcess", "unregistered", "qualityViolationCount"] as const) {
    for (const side of ["baseline", "candidate"] as const) {
      for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        const rows = passingRows();
        rows[0][side][key] = invalid;
        assert.throws(() => evaluateAdoption(rows), { message: `FINITE_METRIC_REQUIRED:${key}` });
      }
    }
  }
});
