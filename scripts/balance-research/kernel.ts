import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import type {
  EvaluatedTeamBalanceAssignment,
  EvaluatedTeamBalanceLayout,
  TeamBalanceCalculation,
  TeamBalanceLayoutEntry,
  TeamBalancePlayer,
} from "../../src/modules/team-tools/domain/team-balance";
import type {
  InhouseFairnessAssignment,
  InhouseMatchupMetrics,
} from "../../src/modules/team-tools/domain/inhouse-fairness";

export const EXPERIMENT_VARIANTS = ["BASELINE", "SUB_TIE", "SUB_SOFT_1"] as const;
export type ExperimentVariant = (typeof EXPERIMENT_VARIANTS)[number];

type PreparedTeam = {
  signature: string;
  assignments: readonly (EvaluatedTeamBalanceAssignment & InhouseFairnessAssignment)[];
  subCount: number;
};
type Pair = { red: PreparedTeam; blue: PreparedTeam; metrics: InhouseMatchupMetrics; cost: number; subImbalance: number };
type RelaxationOptions = Readonly<{ allowConstraintRelaxation?: boolean }>;

export type ExperimentSelectionValue = Pick<Pair, "metrics" | "cost" | "subImbalance">;
/** Custom comparisons cannot replace structural constraints, the fallback prefix, or the final canonical tie-break. */
export type ExperimentSelector<Name extends string = string> = {
  name: Name;
  compare(a: ExperimentSelectionValue, b: ExperimentSelectionValue): number;
};

/** The bridge exposes existing pure functions from the frozen source without changing the application API. */
type FrozenKernel = {
  normalizePlayers(input: readonly TeamBalancePlayer[]): readonly unknown[];
  combinationsWithRedAnchor(length: number): number[][];
  prepareTeams(team: "RED" | "BLUE", players: readonly unknown[], relaxed: boolean): PreparedTeam[];
  evaluateCandidate(red: PreparedTeam, blue: PreparedTeam): unknown;
  materialize(candidate: unknown, options: RelaxationOptions): EvaluatedTeamBalanceLayout;
  calculateTeamBalanceCandidates(input: readonly TeamBalancePlayer[]): TeamBalanceCalculation;
  evaluateTeamBalanceLayout(input: readonly TeamBalancePlayer[], layout: readonly TeamBalanceLayoutEntry[], options: RelaxationOptions): EvaluatedTeamBalanceLayout;
  measureInhouseMatchup(red: PreparedTeam["assignments"], blue: PreparedTeam["assignments"]): InhouseMatchupMetrics;
  compareInhouseConstraintRelaxation(a: InhouseMatchupMetrics, b: InhouseMatchupMetrics): number;
  compareInhousePriority(a: InhouseMatchupMetrics, b: InhouseMatchupMetrics): number;
  inhouseJointCost(metrics: InhouseMatchupMetrics, subCount: number): number;
};

export type SelectorCalculation<Name extends string> = {
  variants: Record<Name, EvaluatedTeamBalanceLayout>;
  search: {
    teamCombinationCount: number;
    /** Raw inspections; fallback revisits strict pairs. Use uniqueEvaluatedLayoutCount for case totals. */
    evaluatedLayoutCount: number;
    /** Role-pair layouts inspected at least once; excludes strict/fallback revisits and variant reuse. */
    uniqueEvaluatedLayoutCount: number;
    /** Unique role pairs that pass the active strict/fallback constraints. Do not multiply by variants. */
    feasibleLayoutCount: number;
    relaxed: boolean;
  };
  elapsedMs: number;
};
export type ExperimentCalculation = SelectorCalculation<ExperimentVariant>;

function signatureOrder(a: Pair, b: Pair): number {
  if (a.blue.signature !== b.blue.signature) return a.blue.signature < b.blue.signature ? -1 : 1;
  if (a.red.signature !== b.red.signature) return a.red.signature < b.red.signature ? -1 : 1;
  return 0;
}

function compareLegacySelection(kernel: FrozenKernel, a: ExperimentSelectionValue, b: ExperimentSelectionValue, variant: ExperimentVariant): number {
  const priority = kernel.compareInhousePriority(a.metrics, b.metrics);
  if (priority) return priority;
  const costDifference = variant === "SUB_SOFT_1"
    ? (a.cost + a.subImbalance) - (b.cost + b.subImbalance)
    : a.cost - b.cost;
  return costDifference || (variant === "SUB_TIE" ? a.subImbalance - b.subImbalance : 0);
}

/**
 * Freeze the three pure domain modules first. This function copies only source
 * code, never participant data. Scratch must be outside the frozen source dir.
 */
export async function loadBalanceExperimentKernel(sourceDirectory: string, scratchDirectory: string) {
  const source = path.resolve(sourceDirectory);
  const scratch = path.resolve(scratchDirectory);
  if (source === scratch || source.startsWith(`${scratch}${path.sep}`) || scratch.startsWith(`${source}${path.sep}`)) {
    throw new Error("Experiment source and scratch directories must be separate.");
  }
  await mkdir(scratch, { recursive: true });
  for (const name of ["inhouse-fairness.ts", "inhouse-joint-search.ts"]) {
    await copyFile(path.join(source, name), path.join(scratch, name));
  }
  const scoreSource = await readFile(path.join(source, "team-balance.ts"), "utf8");
  const bridge = "\nexport { normalizePlayers, combinationsWithRedAnchor, prepareTeams, evaluateCandidate, materialize, measureInhouseMatchup, compareInhouseConstraintRelaxation, compareInhousePriority, inhouseJointCost };\n";
  const entry = path.join(scratch, "team-balance.ts");
  await writeFile(entry, scoreSource + bridge, "utf8");
  const kernel = await import(pathToFileURL(entry).href) as FrozenKernel;

  const baselineSelector: ExperimentSelector<"BASELINE"> = { name: "BASELINE", compare: (a, b) => compareLegacySelection(kernel, a, b, "BASELINE") };
  function enumerate<Name extends string>(input: readonly TeamBalancePlayer[], selectors: readonly ExperimentSelector<Name>[]): SelectorCalculation<Name> {
      const started = performance.now();
      const players = kernel.normalizePlayers(input);
      const combinations = kernel.combinationsWithRedAnchor(players.length);
      const best = new Map<Name, Pair>();
      let evaluatedLayoutCount = 0;
      let feasibleLayoutCount = 0;
      let relaxed = false;
      for (const relax of [false, true]) {
        relaxed = relax;
        for (const indexes of combinations) {
          const redIndexes = new Set(indexes);
          const redLayouts = kernel.prepareTeams("RED", players.filter((_, index) => redIndexes.has(index)), relax);
          const blueLayouts = kernel.prepareTeams("BLUE", players.filter((_, index) => !redIndexes.has(index)), relax);
          for (const red of redLayouts) for (const blue of blueLayouts) {
            evaluatedLayoutCount += 1;
            const metrics = kernel.measureInhouseMatchup(red.assignments, blue.assignments);
            if (metrics.hardViolationCount > 0 && !relax) continue;
            feasibleLayoutCount += 1;
            const pair: Pair = { red, blue, metrics,
              cost: kernel.inhouseJointCost(metrics, red.subCount + blue.subCount),
              subImbalance: Math.abs(red.subCount - blue.subCount) };
            for (const selector of selectors) {
              const current = best.get(selector.name);
              const comparison = current ? (relax ? kernel.compareInhouseConstraintRelaxation(pair.metrics, current.metrics) : 0)
                || selector.compare(pair, current) || signatureOrder(pair, current) : -1;
              if (comparison < 0) best.set(selector.name, pair);
            }
          }
        }
        if (best.size) break;
      }
      const variants = Object.fromEntries(selectors.map(({ name }) => {
        const pair = best.get(name);
        if (!pair) throw new Error("Validated ten-player input unexpectedly has no structural layout.");
        return [name, kernel.materialize(kernel.evaluateCandidate(pair.red, pair.blue), { allowConstraintRelaxation: relaxed })];
      })) as Record<Name, EvaluatedTeamBalanceLayout>;
      return { variants, search: { teamCombinationCount: combinations.length, evaluatedLayoutCount,
        uniqueEvaluatedLayoutCount: relaxed ? combinations.length * 120 * 120 : evaluatedLayoutCount,
        feasibleLayoutCount, relaxed },
        elapsedMs: performance.now() - started };
  }
  return {
    calculateBaseline: kernel.calculateTeamBalanceCandidates,
    evaluateFrozenLayout: kernel.evaluateTeamBalanceLayout,
    calculate(input: readonly TeamBalancePlayer[]): ExperimentCalculation {
      return enumerate(input, EXPERIMENT_VARIANTS.map(name => ({ name, compare: (a, b) => compareLegacySelection(kernel, a, b, name) })));
    },
    calculateWithSelectors<Name extends string>(input: readonly TeamBalancePlayer[], selectors: readonly ExperimentSelector<Name>[]): SelectorCalculation<"BASELINE" | Name> {
      if (selectors.some(selector => selector.name === "BASELINE") || new Set(selectors.map(selector => selector.name)).size !== selectors.length) {
        throw new Error("Custom selector names must be distinct and may not replace BASELINE.");
      }
      return enumerate<"BASELINE" | Name>(input, [baselineSelector, ...selectors]);
    },
  };
}
