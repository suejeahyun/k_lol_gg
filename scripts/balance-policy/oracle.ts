import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EvaluatedTeamBalanceAssignment, EvaluatedTeamBalanceLayout, TeamBalanceCalculation, TeamBalanceLayoutEntry, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import type { InhouseFairnessAssignment, InhouseMatchupMetrics } from "../../src/modules/team-tools/domain/inhouse-fairness";

type Assignment = EvaluatedTeamBalanceAssignment & InhouseFairnessAssignment & { majorTier: number | null };
type Frozen = {
  normalizePlayers(players: readonly TeamBalancePlayer[]): readonly unknown[];
  createAssignment(player: unknown, team: "RED" | "BLUE", position: typeof POSITIONS[number]): Omit<Assignment, "majorTier">;
  parseInhouseMajorTier(raw: string): number | null;
  calculateTeamBalanceCandidates(players: readonly TeamBalancePlayer[]): TeamBalanceCalculation;
  evaluateTeamBalanceLayout(players: readonly TeamBalancePlayer[], layout: readonly TeamBalanceLayoutEntry[], options: { allowConstraintRelaxation: boolean }): EvaluatedTeamBalanceLayout;
  measureInhouseMatchup(red: readonly Assignment[], blue: readonly Assignment[]): InhouseMatchupMetrics;
};
const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const EPS = 1e-8;
const rounded = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 10000) / 10000;

/** Deliberately separate from the candidate's vector builder, guard and comparator. */
function describe(red: readonly Assignment[], blue: readonly Assignment[]) {
  const signed = POSITIONS.map((_, index) => rounded(red[index]!.score - blue[index]!.score));
  const lanes = signed.map(Math.abs);
  const roleCount = (team: readonly Assignment[], role: "AUTO" | "SUB") => team.filter(a => a.roleType === role).length;
  const redAuto = roleCount(red, "AUTO"); const blueAuto = roleCount(blue, "AUTO");
  const redSub = roleCount(red, "SUB"); const blueSub = roleCount(blue, "SUB");
  const redBurden = redSub + 2 * redAuto; const blueBurden = blueSub + 2 * blueAuto;
  const all = [...red, ...blue];
  const unknownSlots = (index: number) => Number(red[index]!.majorTier === null) + Number(blue[index]!.majorTier === null);
  const bottomRanks = [3, 4].map(index => red[index]!.majorTier === null || blue[index]!.majorTier === null
    ? null : Math.abs(red[index]!.majorTier! - blue[index]!.majorTier!));
  const prefix = [bottomRanks.filter(gap => gap !== null && gap >= 3).length,
    bottomRanks.reduce<number>((sum, gap) => sum + (gap !== null && gap >= 3 ? gap - 2 : 0), 0),
    all.filter(a => a.allowedPositions && !a.allowedPositions.includes(a.position)).length];
  const vector = { lanes, teamGap: Math.abs(rounded(signed.reduce((sum, gap) => sum + gap, 0))), bottomGap: Math.abs(rounded(signed[3]! + signed[4]!)),
    autoCount: redAuto + blueAuto, subCount: redSub + blueSub, totalBurden: redBurden + blueBurden,
    maxTeamBurden: Math.max(redBurden, blueBurden), burdenImbalance: Math.abs(redBurden - blueBurden),
    adcUnknownSlots: unknownSlots(3), supportUnknownSlots: unknownSlots(4),
    minViableCarryLanes: Math.min([0, 2, 3].filter(index => signed[index]! >= -3).length, [0, 2, 3].filter(index => signed[index]! <= 3).length),
    totalEffectiveScore: rounded(all.reduce((sum, a) => sum + a.score, 0)) };
  return { vector, prefix, autoImbalance: Math.abs(redAuto - blueAuto), unknownCount: all.filter(a => a.majorTier === null).length };
}

function dominates(value: ReturnType<typeof describe>["vector"], baseline: ReturnType<typeof describe>["vector"]) {
  const signedChanges = [...value.lanes.map((gap, index) => gap - baseline.lanes[index]!),
    value.teamGap - baseline.teamGap, value.bottomGap - baseline.bottomGap,
    value.autoCount - baseline.autoCount, value.subCount - baseline.subCount,
    value.totalBurden - baseline.totalBurden, value.maxTeamBurden - baseline.maxTeamBurden, value.burdenImbalance - baseline.burdenImbalance,
    value.adcUnknownSlots - baseline.adcUnknownSlots, value.supportUnknownSlots - baseline.supportUnknownSlots,
    baseline.minViableCarryLanes - value.minViableCarryLanes, baseline.totalEffectiveScore - value.totalEffectiveScore];
  return signedChanges.every(change => change <= EPS) && signedChanges.some(change => change < -EPS);
}

function key(description: ReturnType<typeof describe>, rules: readonly number[], red: readonly Assignment[], blue: readonly Assignment[]): (number | string)[] {
  const value = description.vector;
  const maximum = Math.max(...value.lanes); const large = value.lanes.filter(gap => gap >= 15).length;
  const count = Number(value.teamGap > 15) + Number(maximum > 25) + Number(value.bottomGap > 10) + Number(large > 1);
  const excess = Math.max(0, maximum - 25) + Math.max(0, value.teamGap - 15) + Math.max(0, value.bottomGap - 10) + 15 * Math.max(0, large - 1);
  return [maximum, rounded(value.lanes.reduce((sum, gap) => sum + gap, 0)), value.teamGap, value.bottomGap, value.burdenImbalance,
    count, excess, description.unknownCount, value.autoCount, description.autoImbalance, ...rules,
    blue.map(a => a.playerId).join(","), red.map(a => a.playerId).join(",")];
}

function compare(a: readonly (number | string)[], b: readonly (number | string)[]) {
  for (let index = 0; index < a.length; index++) {
    const left = a[index]!; const right = b[index]!;
    if (typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= EPS) continue;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, other) => index !== other)).map(rest => [value, ...rest]));
}
function anchoredSplits(): number[][] {
  const result: number[][] = [];
  function visit(chosen: number[], next: number) {
    if (chosen.length === 5) { result.push(chosen); return; }
    for (let index = next; index < 10; index++) visit([...chosen, index], index + 1);
  }
  visit([0], 1);
  return result;
}

/**
 * Uses the original public baseline, independently generates split/permutation
 * layouts, and spells out the candidate's protection/ranking math. Only frozen
 * normalization, player scoring, rule diagnostics and final rescoring are shared.
 */
export async function loadAnchoredParetoOracle(sourceDirectory: string, scratchDirectory: string) {
  const source = path.resolve(sourceDirectory); const scratch = path.resolve(scratchDirectory);
  if (source === scratch || source.startsWith(`${scratch}${path.sep}`) || scratch.startsWith(`${source}${path.sep}`)) throw new Error("Separate oracle scratch required.");
  await mkdir(scratch, { recursive: true });
  for (const file of ["inhouse-fairness.ts", "inhouse-joint-search.ts"]) await copyFile(path.join(source, file), path.join(scratch, file));
  const entry = path.join(scratch, "team-balance.ts");
  await writeFile(entry, await readFile(path.join(source, "team-balance.ts"), "utf8")
    + "\nexport { normalizePlayers, createAssignment, parseInhouseMajorTier, measureInhouseMatchup };\n");
  const frozen = await import(pathToFileURL(entry).href) as Frozen;
  return {
    calculate(input: readonly TeamBalancePlayer[]) {
      const baseline = frozen.calculateTeamBalanceCandidates(input).candidates[0]!;
      const relaxed = Boolean(baseline.score.fairness?.constraintRelaxation);
      const normalized = frozen.normalizePlayers(input);
      const cached = Object.fromEntries((["RED", "BLUE"] as const).map(team => [team, normalized.map(player => POSITIONS.map(position => {
        const assignment = frozen.createAssignment(player, team, position);
        return { ...assignment, majorTier: frozen.parseInhouseMajorTier(assignment.currentTier) };
      }))])) as Record<"RED" | "BLUE", Assignment[][]>;
      const baselineTeams = Object.fromEntries((["RED", "BLUE"] as const).map(team => [team, POSITIONS.map((position, index) => {
        const playerId = baseline.assignments.find(a => a.team === team && a.position === position)!.playerId;
        return cached[team].find(player => player[0]!.playerId === playerId)![index]!;
      })])) as Record<"RED" | "BLUE", Assignment[]>;
      const reference = describe(baselineTeams.RED, baselineTeams.BLUE);
      let winner: { red: Assignment[]; blue: Assignment[]; key: (number | string)[] } | null = null;
      let inspections = 0; let feasibleLayouts = 0; let optimalPrefixLayouts = 0; let eligibleLayouts = 0;
      for (const redIds of anchoredSplits()) {
        const blueIds = Array.from({ length: 10 }, (_, index) => index).filter(index => !redIds.includes(index));
        const layouts = (team: "RED" | "BLUE", ids: number[]) => permutations(ids)
          .map(order => order.map((player, index) => cached[team][player]![index]!))
          .filter(layout => relaxed || layout.every(assignment => !assignment.allowedPositions || assignment.allowedPositions.includes(assignment.position)));
        const redLayouts = layouts("RED", redIds); const blueLayouts = layouts("BLUE", blueIds);
        for (const red of redLayouts) for (const blue of blueLayouts) {
          inspections++;
          const description = describe(red, blue);
          if (!relaxed && description.prefix.some(value => value > 0)) continue;
          feasibleLayouts++;
          if (description.prefix.some((value, index) => value !== reference.prefix[index])) continue;
          optimalPrefixLayouts++;
          if (!dominates(description.vector, reference.vector)) continue;
          eligibleLayouts++;
          const order = key(description, frozen.measureInhouseMatchup(red, blue).ruleViolations, red, blue);
          if (!winner || compare(order, winner.key) < 0) winner = { red, blue, key: order };
        }
      }
      const candidate = winner ? frozen.evaluateTeamBalanceLayout(input,
        [...winner.red, ...winner.blue].map(({ playerId, position, team }) => ({ playerId, position, team })), { allowConstraintRelaxation: relaxed }) : baseline;
      return { baseline, candidate, search: { relaxed, inspections, feasibleLayouts, optimalPrefixLayouts, eligibleLayouts } };
    },
  };
}
