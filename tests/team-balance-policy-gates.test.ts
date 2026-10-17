import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAdoption, type ComparisonRow } from "../scripts/balance-policy/gates";
import { classifyPareto, isMaterial, type Metrics } from "../scripts/balance-policy/metrics";

function metrics(change: Partial<Metrics> = {}): Metrics {
  return { teamGap: 6, lanes: [20, 12, 10, 8, 8], laneSum: 58, maxLaneGap: 20, largeLaneCount: 1, adcGap: 8, supportGap: 8, bottomGap: 4, mainCount: 6, subCount: 2, autoCount: 2, registeredAutoCount: 2, unregistered: 0, burdenImbalance: 0, subImbalance: 0, rules: [0, 0, 0, 0, 0, 0], bottomViolations: 0, bottomExcess: 0, unknownTier: 0, confidence: 0.2, reportedConfidence: 0.2, zeroSampleCount: 1, missingSourceCount: 0, cost: 100, risk: [0], signedLaneGaps: [20, -12, 10, -8, 8], blueSeverelyDisadvantagedLanes: 0, redSeverelyDisadvantagedLanes: 1, lanesOver25: 0, laneExcessOver25: 0, qualityViolationCount: 0, excessRisk: 0, verification: { ADC: { known: true, currentMajorTierGap: 0, passes: true, missingPlayerCount: 0 }, SUP: { known: true, currentMajorTierGap: 0, passes: true, missingPlayerCount: 0 } }, topGap: 20, jungleGap: 12, midGap: 10, totalBurden: 6, maxTeamBurden: 3, nonMainCount: 4, autoImbalance: 0, adcUnknownSlots: 0, supportUnknownSlots: 0, blueViableCarryLanes: 2, redViableCarryLanes: 2, minViableCarryLanes: 2, totalEffectiveScore: 500, ...change };
}
function rows(n: number, improved = n): ComparisonRow[] { return Array.from({ length: n }, (_, i) => ({ id: `synthetic-${i}`, subgroups: ["SYNTHETIC"], baseline: metrics(), candidate: i < improved ? metrics({ jungleGap: 9, laneSum: 55 }) : metrics(), baselineMs: 1, candidateMs: 2 })); }
test("policy material rate uses ceiling independently per stage and does not require max-gap improvement", () => {
  assert.equal(evaluateAdoption(rows(500, 5)).accepted, true);
  assert.equal(evaluateAdoption(rows(500, 4)).accepted, false);
  assert.equal(evaluateAdoption(rows(250, 3)).accepted, true);
  assert.equal(evaluateAdoption(rows(250, 2)).accepted, false);
  assert.equal(evaluateAdoption(rows(1, 1)).requiredMaterialCount, 1);
});
test("one worsened line cannot be hidden by other lanes or by mean improvement", () => {
  const r = rows(20); assert.equal(evaluateAdoption(r).accepted, true);
  r[0].candidate.topGap += 0.01;
  assert.ok(evaluateAdoption(r).failures.some(f => f.startsWith("INDIVIDUAL_PROTECTION_REGRESSION:topGap:")));
});
test("quality and individual bottom protections remain independently enforced", () => {
  for (const key of ["qualityViolationCount", "adcGap", "supportGap", "bottomGap", "adcUnknownSlots", "supportUnknownSlots"] as const) {
    const r = rows(20); r[0].candidate[key] += 1;
    assert.ok(evaluateAdoption(r).failures.some(f => f.startsWith(`INDIVIDUAL_PROTECTION_REGRESSION:${key}:`)), key);
  }
  const r = rows(20); r[0].candidate.bottomViolations = 1;
  assert.ok(evaluateAdoption(r).failures.some(f => f.startsWith("RELAXATION_PREFIX_CHANGED:bottomViolations:")));
});
test("group confidence and zero-sample regressions veto a globally unchanged uncertainty mean", () => {
  for (const key of ["confidence", "zeroSampleCount"] as const) {
    const r = rows(20); assert.equal(evaluateAdoption(r).accepted, true);
    r.forEach((row, i) => { row.subgroups = [i < 10 ? "GROUP_A" : "GROUP_B"]; const delta = key === "confidence" ? -0.01 : 1; row.candidate[key] += i < 10 ? delta : -delta; });
    assert.ok(evaluateAdoption(r).failures.some(f => f === `PROTECTED_GROUP_REGRESSION:GROUP_A:${key}:mean`));
  }
});
test("uncertainty needs whole-stage non-regression even with groups smaller than ten", () => {
  const r = rows(9); r[0].candidate.confidence -= 0.01;
  const gate = evaluateAdoption(r);
  assert.ok(gate.failures.includes("OVERALL_REGRESSION:confidence:mean"));
  assert.equal(gate.groups[0].gateApplies, false);
});
test("material effect excludes changes to carry count or effective strength alone", () => {
  const b = metrics(); const c = metrics({ minViableCarryLanes: 3, totalEffectiveScore: 510 });
  assert.equal(classifyPareto(b, c), "improved"); assert.equal(isMaterial(b, c), false);
  assert.equal(isMaterial(b, metrics({ laneSum: 55 })), true);
  assert.equal(isMaterial(b, metrics({ laneSum: 55.0001 })), false);
});
test("contended timing is diagnostic and cannot substitute for final standalone runtime gate", () => {
  const r = rows(20); r.forEach(row => { row.candidateMs = 100; });
  const gate = evaluateAdoption(r);
  assert.equal(gate.accepted, true); assert.equal(gate.timing.diagnosticOnly, true); assert.equal(gate.timing.standalonePublicBaselineGateStillRequired, true);
});
test("non-finite measurements and empty evaluations fail closed", () => {
  assert.throws(() => evaluateAdoption([]), /ADOPTION_REQUIRES_OBSERVATIONS/);
  for (const key of ["topGap", "totalEffectiveScore", "confidence", "zeroSampleCount", "qualityViolationCount"] as const) for (const value of [NaN, Infinity, -Infinity]) {
    const r = rows(1); r[0].candidate[key] = value; assert.throws(() => evaluateAdoption(r), /FINITE_METRIC_REQUIRED/);
  }
});
