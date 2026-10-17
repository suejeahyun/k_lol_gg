import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import type { EvaluatedTeamBalanceLayout, TeamBalanceCalculation, TeamBalanceLayoutEntry, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import type { InhouseFairnessAssignment, InhouseMatchupMetrics } from "../../src/modules/team-tools/domain/inhouse-fairness";

export const ANCHORED_PARETO_POLICY_VERSION = "ANCHORED_PARETO_2026_10_18_V1";
export const POLICY_EPSILON = 1e-8;
type PreparedTeam = { signature: string; assignments: readonly InhouseFairnessAssignment[]; subCount: number; autoCount: number };
type Pair = { red: PreparedTeam; blue: PreparedTeam; metrics: InhouseMatchupMetrics; cost: number };
type Batch = { red: PreparedTeam[]; blue: PreparedTeam[] };
type Options = Readonly<{ allowConstraintRelaxation?: boolean }>;
type FrozenKernel = {
  normalizePlayers(input: readonly TeamBalancePlayer[]): readonly unknown[];
  combinationsWithRedAnchor(length: number): number[][];
  prepareTeams(team: "RED" | "BLUE", players: readonly unknown[], relaxed: boolean): PreparedTeam[];
  evaluateCandidate(red: PreparedTeam, blue: PreparedTeam): unknown;
  materialize(candidate: unknown, options: Options): EvaluatedTeamBalanceLayout;
  calculateTeamBalanceCandidates(input: readonly TeamBalancePlayer[]): TeamBalanceCalculation;
  evaluateTeamBalanceLayout(input: readonly TeamBalancePlayer[], layout: readonly TeamBalanceLayoutEntry[], options: Options): EvaluatedTeamBalanceLayout;
  measureInhouseMatchup(red: PreparedTeam["assignments"], blue: PreparedTeam["assignments"]): InhouseMatchupMetrics;
  compareInhouseConstraintRelaxation(a: InhouseMatchupMetrics, b: InhouseMatchupMetrics): number;
  compareInhousePriority(a: InhouseMatchupMetrics, b: InhouseMatchupMetrics): number;
  inhouseJointCost(metrics: InhouseMatchupMetrics, subCount: number): number;
  parseInhouseMajorTier(raw: string): number | null;
};

/** Every coordinate is protected individually; derived diagnostics are not weighted compensation. */
export type PolicyVector = {
  lanes: readonly number[];
  teamGap: number; bottomGap: number;
  autoCount: number; subCount: number; totalBurden: number; maxTeamBurden: number; burdenImbalance: number;
  adcUnknownSlots: number; supportUnknownSlots: number;
  minViableCarryLanes: number; totalEffectiveScore: number;
};
export const LOWER_PROTECTED_KEYS = ["teamGap", "bottomGap", "autoCount", "subCount", "totalBurden", "maxTeamBurden", "burdenImbalance", "adcUnknownSlots", "supportUnknownSlots"] as const;
export const HIGHER_PROTECTED_KEYS = ["minViableCarryLanes", "totalEffectiveScore"] as const;

export function isAnchoredParetoImprovement(value: PolicyVector, baseline: PolicyVector): boolean {
  if (value.lanes.length !== 5 || baseline.lanes.length !== 5) throw new Error("FIVE_LANE_COORDINATES_REQUIRED");
  const differences = [...value.lanes.map((gap, index) => gap - baseline.lanes[index]!),
    ...LOWER_PROTECTED_KEYS.map(key => value[key] - baseline[key]),
    ...HIGHER_PROTECTED_KEYS.map(key => baseline[key] - value[key])];
  if (!differences.every(Number.isFinite)) throw new Error("FINITE_PROTECTION_COORDINATES_REQUIRED");
  return differences.every(difference => difference <= POLICY_EPSILON) && differences.some(difference => difference < -POLICY_EPSILON);
}

export function hasMaterialPolicyGain(value: PolicyVector, baseline: PolicyVector) {
  return sum(baseline.lanes) - sum(value.lanes) >= 3 - POLICY_EPSILON
    || baseline.autoCount + baseline.subCount - value.autoCount - value.subCount >= 1 - POLICY_EPSILON
    || baseline.burdenImbalance - value.burdenImbalance >= 1 - POLICY_EPSILON;
}

function round(value: number) { return Math.sign(value) * Math.round(Math.abs(value) * 10000) / 10000; }
function sum(values: readonly number[]) { return round(values.reduce((total, value) => total + value, 0)); }
function signatureOrder(a: Pair, b: Pair) {
  return a.blue.signature === b.blue.signature
    ? a.red.signature === b.red.signature ? 0 : a.red.signature < b.red.signature ? -1 : 1
    : a.blue.signature < b.blue.signature ? -1 : 1;
}

export function measurePolicyProtection(red: PreparedTeam, blue: PreparedTeam, parseTier: (raw: string) => number | null): PolicyVector {
  const gaps = red.assignments.map((assignment, index) => round(assignment.score - blue.assignments[index]!.score));
  const redBurden = red.subCount + red.autoCount * 2;
  const blueBurden = blue.subCount + blue.autoCount * 2;
  const unknown = (index: number) => Number(parseTier(red.assignments[index]!.currentTier) === null)
    + Number(parseTier(blue.assignments[index]!.currentTier) === null);
  const redPaths = [0, 2, 3].filter(index => gaps[index]! >= -3).length;
  const bluePaths = [0, 2, 3].filter(index => gaps[index]! <= 3).length;
  return { lanes: gaps.map(Math.abs), teamGap: Math.abs(sum(gaps)), bottomGap: Math.abs(sum(gaps.slice(3))),
    autoCount: red.autoCount + blue.autoCount, subCount: red.subCount + blue.subCount,
    totalBurden: redBurden + blueBurden, maxTeamBurden: Math.max(redBurden, blueBurden), burdenImbalance: Math.abs(redBurden - blueBurden),
    adcUnknownSlots: unknown(3), supportUnknownSlots: unknown(4), minViableCarryLanes: Math.min(redPaths, bluePaths),
    totalEffectiveScore: sum([...red.assignments, ...blue.assignments].map(assignment => assignment.score)) };
}

function requiredPair(value: Pair | null): Pair {
  if (!value) throw new Error("Validated ten-player roster must have a fallback layout.");
  return value;
}

function compareEligible(kernel: FrozenKernel, a: Pair, aVector: PolicyVector, b: Pair, bVector: PolicyVector) {
  const left = [Math.max(...aVector.lanes), sum(aVector.lanes), aVector.teamGap, aVector.bottomGap, aVector.burdenImbalance];
  const right = [Math.max(...bVector.lanes), sum(bVector.lanes), bVector.teamGap, bVector.bottomGap, bVector.burdenImbalance];
  for (let index = 0; index < left.length; index++) {
    const difference = left[index]! - right[index]!;
    if (Math.abs(difference) > POLICY_EPSILON) return difference;
  }
  return kernel.compareInhousePriority(a.metrics, b.metrics) || signatureOrder(a, b);
}

export type AnchoredParetoCalculation = {
  policyVersion: typeof ANCHORED_PARETO_POLICY_VERSION;
  baseline: EvaluatedTeamBalanceLayout; candidate: EvaluatedTeamBalanceLayout;
  baselineVector: PolicyVector; candidateVector: PolicyVector;
  changed: boolean; materialGain: boolean;
  baselineElapsedMs: number; selectionElapsedMs: number; elapsedMs: number;
  search: {
    teamCombinationCount: number; relaxed: boolean;
    /** Placements inspected at least once. Never multiplied by passes or policies. */
    uniqueEvaluatedLayoutCount: number;
    evaluatedLayoutCount: number; firstPassInspections: number; secondPassInspections: number;
    feasibleLayoutCount: number; optimalPrefixLayoutCount: number; eligibleLayoutCount: number;
    preparedTeamLayoutCount: number;
  };
};

/** Exact baseline followed by an anchored full scan; preparation is retained between passes. */
export async function loadAnchoredParetoKernel(sourceDirectory: string, scratchDirectory: string) {
  const source = path.resolve(sourceDirectory); const scratch = path.resolve(scratchDirectory);
  if (source === scratch || source.startsWith(`${scratch}${path.sep}`) || scratch.startsWith(`${source}${path.sep}`)) {
    throw new Error("Frozen source and experiment scratch must be separate.");
  }
  await mkdir(scratch, { recursive: true });
  for (const file of ["inhouse-fairness.ts", "inhouse-joint-search.ts"]) await copyFile(path.join(source, file), path.join(scratch, file));
  const entry = path.join(scratch, "team-balance.ts");
  const bridge = "\nexport { normalizePlayers, combinationsWithRedAnchor, prepareTeams, evaluateCandidate, materialize, measureInhouseMatchup, compareInhouseConstraintRelaxation, compareInhousePriority, inhouseJointCost, parseInhouseMajorTier };\n";
  await writeFile(entry, await readFile(path.join(source, "team-balance.ts"), "utf8") + bridge);
  const kernel = await import(pathToFileURL(entry).href) as FrozenKernel;

  return {
    calculateBaseline: kernel.calculateTeamBalanceCandidates,
    evaluateFrozenLayout: kernel.evaluateTeamBalanceLayout,
    calculate(input: readonly TeamBalancePlayer[]): AnchoredParetoCalculation {
      const started = performance.now();
      const players = kernel.normalizePlayers(input);
      const combinations = kernel.combinationsWithRedAnchor(players.length);
      let baselinePair: Pair | null = null;
      let batches: Batch[] = [];
      let relaxed = false;
      let firstPassInspections = 0;
      let feasibleLayoutCount = 0;
      let activeModeInspections = 0;
      let preparedTeamLayoutCount = 0;
      for (const allowRelaxation of [false, true]) {
        relaxed = allowRelaxation;
        batches = []; activeModeInspections = 0; preparedTeamLayoutCount = 0;
        for (const indexes of combinations) {
          const redIndexes = new Set(indexes);
          const red = kernel.prepareTeams("RED", players.filter((_, index) => redIndexes.has(index)), relaxed);
          const blue = kernel.prepareTeams("BLUE", players.filter((_, index) => !redIndexes.has(index)), relaxed);
          batches.push({ red, blue }); preparedTeamLayoutCount += red.length + blue.length;
          for (const redTeam of red) for (const blueTeam of blue) {
            firstPassInspections++; activeModeInspections++;
            const metrics = kernel.measureInhouseMatchup(redTeam.assignments, blueTeam.assignments);
            if (!relaxed && metrics.hardViolationCount > 0) continue;
            feasibleLayoutCount++;
            const pair: Pair = { red: redTeam, blue: blueTeam, metrics, cost: kernel.inhouseJointCost(metrics, redTeam.subCount + blueTeam.subCount) };
            const current: Pair | null = baselinePair;
            const comparison: number = current ? (relaxed ? kernel.compareInhouseConstraintRelaxation(metrics, current.metrics) : 0)
              || kernel.compareInhousePriority(metrics, current.metrics) || pair.cost - current.cost || signatureOrder(pair, current) : -1;
            if (comparison < 0) baselinePair = pair;
          }
        }
        if (baselinePair) break;
      }
      const anchor = requiredPair(baselinePair);
      const baselineVector = measurePolicyProtection(anchor.red, anchor.blue, kernel.parseInhouseMajorTier);
      const baseline = kernel.materialize(kernel.evaluateCandidate(anchor.red, anchor.blue), { allowConstraintRelaxation: relaxed });
      const baselineElapsedMs = performance.now() - started;
      const selectionStarted = performance.now();
      let selectedPair: Pair | null = null;
      let selectedVector: PolicyVector | null = null;
      let secondPassInspections = 0; let optimalPrefixLayoutCount = 0; let eligibleLayoutCount = 0;
      for (const batch of batches) for (const red of batch.red) for (const blue of batch.blue) {
        secondPassInspections++;
        const metrics = kernel.measureInhouseMatchup(red.assignments, blue.assignments);
        if (!relaxed && metrics.hardViolationCount > 0) continue;
        if (kernel.compareInhouseConstraintRelaxation(metrics, anchor.metrics) !== 0) continue;
        optimalPrefixLayoutCount++;
        const vector = measurePolicyProtection(red, blue, kernel.parseInhouseMajorTier);
        if (!isAnchoredParetoImprovement(vector, baselineVector)) continue;
        eligibleLayoutCount++;
        const pair: Pair = { red, blue, metrics, cost: 0 };
        if (!selectedPair || compareEligible(kernel, pair, vector, selectedPair, selectedVector!) < 0) {
          selectedPair = pair; selectedVector = vector;
        }
      }
      const candidate = selectedPair
        ? kernel.materialize(kernel.evaluateCandidate(selectedPair.red, selectedPair.blue), { allowConstraintRelaxation: relaxed }) : baseline;
      const candidateVector = selectedVector ?? baselineVector;
      const selectionElapsedMs = performance.now() - selectionStarted;
      return { policyVersion: ANCHORED_PARETO_POLICY_VERSION, baseline, candidate, baselineVector, candidateVector,
        changed: selectedPair !== null, materialGain: hasMaterialPolicyGain(candidateVector, baselineVector),
        baselineElapsedMs, selectionElapsedMs, elapsedMs: performance.now() - started,
        search: { teamCombinationCount: combinations.length, relaxed, uniqueEvaluatedLayoutCount: activeModeInspections,
          evaluatedLayoutCount: firstPassInspections + secondPassInspections, firstPassInspections, secondPassInspections,
          feasibleLayoutCount, optimalPrefixLayoutCount, eligibleLayoutCount, preparedTeamLayoutCount } };
    },
  };
}
