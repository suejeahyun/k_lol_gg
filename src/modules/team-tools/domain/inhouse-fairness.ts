/** Shared, deterministic rules for generated and manually edited in-house teams. */
export const INHOUSE_FAIRNESS_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
type FairnessPosition = (typeof INHOUSE_FAIRNESS_POSITIONS)[number];
type FairnessTeam = "RED" | "BLUE";

export const INHOUSE_FAIRNESS_LIMITS = {
  evenLaneGap: 3,
  largeLaneGap: 15,
  maxLaneGap: 25,
  maxTeamAverageGap: 3,
  maxBottomAverageGap: 5,
  maxLargeLaneCount: 1,
  bottomMajorTierGap: 3,
} as const;

export const INHOUSE_DIRECTIONAL_PENALTIES = {
  topPlayersTogether: 8,
  topPlayersOutsideMidJungle: 3,
  topMidStack: 3,
  bottomStack: 3,
  weakSupportWithoutJungle: 2,
  jungleWithoutCarryLane: 4,
  missingWinPath: 4,
} as const;

export type InhouseFairnessAssignment = {
  playerId: string;
  team: FairnessTeam;
  position: FairnessPosition;
  roleType: "MAIN" | "SUB" | "AUTO";
  score: number;
  currentTier: string;
  peakTier: string;
  finalBaseScore: number;
  mainPositions: readonly FairnessPosition[];
  subPositions: readonly FairnessPosition[];
  /** Explicit capability constraints; omitted for legacy unrestricted entries. */
  allowedPositions?: readonly FairnessPosition[];
};

export type InhouseFairnessCheck = {
  code: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
};

export type InhouseFairnessReport = {
  status: "BALANCED" | "CONDITIONAL" | "REVIEW_REQUIRED" | "INVALID";
  hardViolations: string[];
  warnings: string[];
  qualityViolationCount: number;
  directionalPenalty: number;
  autoCount: number;
  autoImbalance: number;
  maxLaneGap: number;
  totalGap: number;
  largeLaneCount: number;
  bottomGap: number;
  lineGapTotal: number;
  unknownTierCount: number;
  checks: InhouseFairnessCheck[];
};

const POSITION_LABEL: Record<FairnessPosition, string> = {
  TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서폿",
};

// A major tier is one step, independent of divisions, LP and role penalties.
// Keep aliases anchored so arbitrary text such as "silverfish" stays unknown.
const MAJOR_TIERS = [
  [9, "challenger|챌린저|챌|ch|c"],
  [8, "grandmaster|그랜드마스터|그마|gm"],
  [7, "master|마스터|마|m"],
  [6, "diamond|다이아몬드|다이아|다|d"],
  [5, "emerald|에메랄드|에메|에|e"],
  [4, "platinum|플래티넘|플레티넘|플래|플레|플|p"],
  [3, "gold|골드|골|g"],
  [2, "silver|실버|실|s"],
  [1, "bronze|브론즈|브|b"],
  [0, "iron|아이언|아|i"],
] as const;
const TIER_PATTERNS = MAJOR_TIERS.map(([rank, aliases]) => ({
  rank,
  pattern: rank >= 7
    ? new RegExp(`^(?:${aliases})(?:\\d+(?:lp|p|점|층)?|\\(\\d+(?:lp|p|점)\\))?$`, "i")
    : new RegExp(`^(?:${aliases})(?:(?:iv|iii|ii|i|[1-4]))?(?:(?:\\d+(?:\\.\\d+)?(?:lp|p|점))|(?:\\(\\d+(?:lp|p|점)\\)))?$`, "i"),
}));
const tierCache = new Map<string, number | null>();

export function parseInhouseMajorTier(raw: string | null | undefined): number | null {
  const source = raw ?? "";
  if (tierCache.has(source)) return tierCache.get(source)!;
  const compact = source.normalize("NFKC").trim().replace(/\s+/g, "");
  if (!compact) return null;
  const rank = TIER_PATTERNS.find(({ pattern }) => pattern.test(compact))?.rank ?? null;
  if (tierCache.size >= 256) tierCache.clear();
  tierCache.set(source, rank);
  return rank;
}

function round(value: number): number {
  // Round magnitude first to keep RED/BLUE swapping symmetric at half steps.
  return Math.sign(value) * Math.round(Math.abs(value) * 10000) / 10000;
}

function canPlayRegisteredPosition(a: InhouseFairnessAssignment, position: FairnessPosition): boolean {
  return (a.mainPositions.includes(position) || a.subPositions.includes(position)) &&
    (!a.allowedPositions || a.allowedPositions.includes(position));
}

function isHighestPair(a: InhouseFairnessAssignment, b: InhouseFairnessAssignment, highest: number, second: number): boolean {
  return Math.max(a.finalBaseScore, b.finalBaseScore) === highest &&
    Math.min(a.finalBaseScore, b.finalBaseScore) === second;
}

/** A small difference is a tie; the same boundaries are used by every rule. */
export function getInhouseLaneDirection(redMinusBlue: number): -1 | 0 | 1 {
  const gap = round(redMinusBlue);
  return Math.abs(gap) <= INHOUSE_FAIRNESS_LIMITS.evenLaneGap ? 0 : gap > 0 ? 1 : -1;
}

export type InhouseMatchupMetrics = {
  hardViolationCount: number;
  unknownTierCount: number;
  qualityViolationCount: number;
  directionalPenalty: number;
  autoCount: number;
  autoImbalance: number;
  maxLaneGap: number;
  totalGap: number;
  largeLaneCount: number;
  /** Absolute combined ADC/SUP gap. The quality threshold uses half this value. */
  bottomGap: number;
  lineGapTotal: number;
  topPlayersSplit: boolean;
  midJunglePossible: boolean;
  assignedMidJungle: boolean;
  topMidStack: boolean;
  bottomStack: boolean;
  unsupportedSupport: boolean;
  jungleWithoutCarry: boolean;
  redHasPath: boolean;
  blueHasPath: boolean;
};

/**
 * Allocation-light search metric. Callers supply valid teams in
 * TOP,JGL,MID,ADC,SUP order. Final/manual results use evaluateInhouseFairness,
 * which validates the roster and produces the human-readable checks.
 */
export function measureInhouseMatchup(
  red: readonly InhouseFairnessAssignment[],
  blue: readonly InhouseFairnessAssignment[],
): InhouseMatchupMetrics {
  let total = 0;
  let maxLaneGap = 0;
  let lineGapTotal = 0;
  let largeLaneCount = 0;
  let unknownTierCount = 0;
  let hardViolationCount = 0;
  let autoRed = 0;
  let autoBlue = 0;
  let highest = -Infinity;
  let second = -Infinity;
  for (let i = 0; i < 5; i += 1) {
    const r = red[i];
    const b = blue[i];
    const gap = round(r.score - b.score);
    const absGap = Math.abs(gap);
    total += gap;
    maxLaneGap = Math.max(maxLaneGap, absGap);
    lineGapTotal += absGap;
    if (absGap >= INHOUSE_FAIRNESS_LIMITS.largeLaneGap) largeLaneCount += 1;
    const rt = parseInhouseMajorTier(r.currentTier);
    const bt = parseInhouseMajorTier(b.currentTier);
    if (rt === null) unknownTierCount += 1;
    if (bt === null) unknownTierCount += 1;
    if (i >= 3 && rt !== null && bt !== null && Math.abs(rt - bt) >= INHOUSE_FAIRNESS_LIMITS.bottomMajorTierGap) hardViolationCount += 1;
    if (r.roleType === "AUTO") autoRed += 1;
    if (b.roleType === "AUTO") autoBlue += 1;
    if (r.allowedPositions && !r.allowedPositions.includes(r.position)) hardViolationCount += 1;
    if (b.allowedPositions && !b.allowedPositions.includes(b.position)) hardViolationCount += 1;
    for (let t = 0; t < 2; t += 1) {
      const score = t === 0 ? r.finalBaseScore : b.finalBaseScore;
      if (score > highest) { second = highest; highest = score; }
      else if (score > second) second = score;
    }
  }
  const totalGap = Math.abs(round(total));
  const bottomGap = Math.abs(round(red[3].score - blue[3].score + red[4].score - blue[4].score));
  maxLaneGap = round(maxLaneGap);
  const qualityViolationCount = Number(totalGap > INHOUSE_FAIRNESS_LIMITS.maxTeamAverageGap * 5) +
    Number(maxLaneGap > INHOUSE_FAIRNESS_LIMITS.maxLaneGap) +
    Number(bottomGap > INHOUSE_FAIRNESS_LIMITS.maxBottomAverageGap * 2) +
    Number(largeLaneCount > INHOUSE_FAIRNESS_LIMITS.maxLargeLaneCount);
  // Equal-score lobbies are common. Recognize an already-valid cross-team pair
  // before scanning all tied candidates, and stop as soon as all checks pass.
  let assignedMidJungle = (isHighestPair(red[2], blue[1], highest, second) &&
    canPlayRegisteredPosition(red[2], "MID") && canPlayRegisteredPosition(blue[1], "JGL")) ||
    (isHighestPair(red[1], blue[2], highest, second) &&
    canPlayRegisteredPosition(red[1], "JGL") && canPlayRegisteredPosition(blue[2], "MID"));
  let topPlayersSplit = assignedMidJungle;
  let midJunglePossible = assignedMidJungle;
  for (let i = 0; i < 10 && !assignedMidJungle; i += 1) {
    const a = i < 5 ? red[i] : blue[i - 5];
    if (a.finalBaseScore < second) continue;
    for (let j = i + 1; j < 10; j += 1) {
      const b = j < 5 ? red[j] : blue[j - 5];
      if (!isHighestPair(a, b, highest, second)) continue;
      const split = i < 5 && j >= 5;
      if (split) topPlayersSplit = true;
      const aMid = canPlayRegisteredPosition(a, "MID");
      const aJgl = canPlayRegisteredPosition(a, "JGL");
      const bMid = canPlayRegisteredPosition(b, "MID");
      const bJgl = canPlayRegisteredPosition(b, "JGL");
      if ((aMid && bJgl) || (aJgl && bMid)) {
        midJunglePossible = true;
        if (split && ((a.position === "MID" && b.position === "JGL" && aMid && bJgl) ||
          (a.position === "JGL" && b.position === "MID" && aJgl && bMid))) assignedMidJungle = true;
        if (assignedMidJungle) break;
      }
    }
  }
  const top = getInhouseLaneDirection(red[0].score - blue[0].score);
  const jgl = getInhouseLaneDirection(red[1].score - blue[1].score);
  const mid = getInhouseLaneDirection(red[2].score - blue[2].score);
  const adc = getInhouseLaneDirection(red[3].score - blue[3].score);
  const sup = getInhouseLaneDirection(red[4].score - blue[4].score);
  const topMidStack = top !== 0 && top === mid;
  const bottomStack = adc !== 0 && adc === sup;
  const unsupportedSupport = sup !== 0 && sup === jgl;
  const jungleWithoutCarry = jgl !== 0 && top * jgl < 0 && mid * jgl < 0 && adc * jgl < 0;
  const redHasPath = top >= 0 || mid >= 0 || adc >= 0;
  const blueHasPath = top <= 0 || mid <= 0 || adc <= 0;
  const directionalPenalty = Number(!topPlayersSplit) * INHOUSE_DIRECTIONAL_PENALTIES.topPlayersTogether +
    Number(midJunglePossible && !assignedMidJungle) * INHOUSE_DIRECTIONAL_PENALTIES.topPlayersOutsideMidJungle +
    Number(topMidStack) * INHOUSE_DIRECTIONAL_PENALTIES.topMidStack +
    Number(bottomStack) * INHOUSE_DIRECTIONAL_PENALTIES.bottomStack +
    Number(unsupportedSupport) * INHOUSE_DIRECTIONAL_PENALTIES.weakSupportWithoutJungle +
    Number(jungleWithoutCarry) * INHOUSE_DIRECTIONAL_PENALTIES.jungleWithoutCarryLane +
    Number(!redHasPath || !blueHasPath) * INHOUSE_DIRECTIONAL_PENALTIES.missingWinPath;
  return { hardViolationCount, unknownTierCount, qualityViolationCount, directionalPenalty,
    autoCount: autoRed + autoBlue, autoImbalance: Math.abs(autoRed - autoBlue),
    maxLaneGap, totalGap, largeLaneCount, bottomGap, lineGapTotal: round(lineGapTotal),
    topPlayersSplit, midJunglePossible, assignedMidJungle, topMidStack, bottomStack,
    unsupportedSupport, jungleWithoutCarry, redHasPath, blueHasPath };
}

/**
 * Evaluate actual assigned-role scores without changing player strength.
 * Thresholds are operational rules, not a calibrated win-probability model.
 */
export function evaluateInhouseFairness(
  assignments: readonly InhouseFairnessAssignment[],
): InhouseFairnessReport {
  const checks: InhouseFairnessCheck[] = [];
  const hardViolations: string[] = [];
  const warnings: string[] = [];
  let qualityViolationCount = 0;
  let directionalPenalty = 0;
  const add = (code: string, label: string, status: InhouseFairnessCheck["status"], detail: string) => {
    checks.push({ code, label, status, detail });
    if (status === "FAIL") hardViolations.push(detail);
    if (status === "WARN") warnings.push(detail);
  };

  const red = assignments.filter((a) => a.team === "RED");
  const blue = assignments.filter((a) => a.team === "BLUE");
  const autoRed = red.filter((a) => a.roleType === "AUTO").length;
  const autoBlue = blue.filter((a) => a.roleType === "AUTO").length;
  const autoCount = autoRed + autoBlue;
  const autoImbalance = Math.abs(autoRed - autoBlue);
  const unknownTierCount = assignments.filter((a) => parseInhouseMajorTier(a.currentTier) === null).length;
  const validNumbers = assignments.every((a) =>
    Number.isFinite(a.score) && Number.isFinite(a.finalBaseScore) && a.playerId.trim().length > 0 &&
    ["MAIN", "SUB", "AUTO"].includes(a.roleType));
  const validShape = assignments.length === 10 && red.length === 5 && blue.length === 5 &&
    new Set(assignments.map((a) => a.playerId)).size === 10 && validNumbers &&
    [red, blue].every((team) => INHOUSE_FAIRNESS_POSITIONS.every((position) =>
      team.filter((a) => a.position === position).length === 1));
  add("ROSTER", "인원·포지션 구성", validShape ? "PASS" : "FAIL", validShape
    ? "서로 다른 10명이 양 팀에 5명씩, 각 포지션에 1명씩 배치되었습니다."
    : "서로 다른 10명, 양 팀 각 5명, 각 포지션 1명과 유효한 점수가 필요합니다.");

  const report = (maxLaneGap: number, totalGap: number, metrics?: InhouseMatchupMetrics): InhouseFairnessReport => ({
    status: hardViolations.length ? "INVALID" : unknownTierCount ? "REVIEW_REQUIRED" :
      qualityViolationCount || directionalPenalty || autoCount ? "CONDITIONAL" : "BALANCED",
    hardViolations, warnings, qualityViolationCount, directionalPenalty,
    autoCount, autoImbalance, maxLaneGap, totalGap, unknownTierCount, checks,
    largeLaneCount: metrics?.largeLaneCount ?? 0,
    bottomGap: metrics?.bottomGap ?? 0,
    lineGapTotal: metrics?.lineGapTotal ?? 0,
  });
  // Do not infer matchups or emit NaN metrics for malformed manual input.
  if (!validShape) return report(0, 0);

  for (const a of assignments) {
    if (a.allowedPositions && !a.allowedPositions.includes(a.position)) {
      add(`ALLOWED_POSITION_${a.playerId}`, "가능 포지션 제한", "FAIL",
        `선수 ${a.playerId}의 ${POSITION_LABEL[a.position]} 배치는 등록된 가능 포지션에 포함되지 않습니다.`);
    }
  }

  const lanes = Object.fromEntries(INHOUSE_FAIRNESS_POSITIONS.map((position) => {
    const r = red.find((a) => a.position === position)!;
    const b = blue.find((a) => a.position === position)!;
    return [position, { red: r, blue: b, gap: round(r.score - b.score) }];
  })) as Record<FairnessPosition, { red: InhouseFairnessAssignment; blue: InhouseFairnessAssignment; gap: number }>;
  const metrics = measureInhouseMatchup(
    INHOUSE_FAIRNESS_POSITIONS.map((p) => lanes[p].red),
    INHOUSE_FAIRNESS_POSITIONS.map((p) => lanes[p].blue),
  );
  const { maxLaneGap, totalGap } = metrics;
  const teamAverageGap = round(totalGap / 5);
  const bottomAverageGap = round(metrics.bottomGap / 2);
  const largeLanes = INHOUSE_FAIRNESS_POSITIONS.filter((position) =>
    Math.abs(lanes[position].gap) >= INHOUSE_FAIRNESS_LIMITS.largeLaneGap);

  add("TIER_DATA", "현재 티어 확인", unknownTierCount ? "WARN" : "PASS", unknownTierCount
    ? `${unknownTierCount}명의 현재 티어를 확인할 수 없어 검토가 필요합니다. 최고 티어·임시 점수로 바텀 제한을 통과시키지 않습니다.`
    : "10명의 현재 티어를 확인했습니다.");
  for (const position of ["ADC", "SUP"] as const) {
    const lane = lanes[position];
    const r = parseInhouseMajorTier(lane.red.currentTier);
    const b = parseInhouseMajorTier(lane.blue.currentTier);
    const gap = r === null || b === null ? null : Math.abs(r - b);
    add(`BOTTOM_TIER_${position}`, `${POSITION_LABEL[position]} 티어 제한`, gap === null ? "WARN" :
      gap >= INHOUSE_FAIRNESS_LIMITS.bottomMajorTierGap ? "FAIL" : "PASS", gap === null
      ? `${POSITION_LABEL[position]} 맞대결의 현재 티어가 누락되어 큰 등급 3단계 제한을 검증할 수 없습니다.`
      : `${POSITION_LABEL[position]} 현재 티어 차이는 큰 등급 ${gap}단계입니다.${gap >= INHOUSE_FAIRNESS_LIMITS.bottomMajorTierGap ? " 3단계 이상 맞대결은 허용하지 않습니다." : ""}`);
  }

  const quality = (code: string, label: string, fails: boolean, detail: string) => {
    if (fails) qualityViolationCount += 1;
    add(code, label, fails ? "WARN" : "PASS", detail);
  };
  quality("TEAM_POWER", "팀 전체 전력", totalGap > INHOUSE_FAIRNESS_LIMITS.maxTeamAverageGap * 5,
    `팀 평균 전력 차이 ${teamAverageGap}점 / 권장 최대 ${INHOUSE_FAIRNESS_LIMITS.maxTeamAverageGap}점.`);
  quality("MAX_LANE_GAP", "최대 대면 격차", maxLaneGap > INHOUSE_FAIRNESS_LIMITS.maxLaneGap,
    `가장 큰 대면 격차 ${maxLaneGap}점 / 권장 최대 ${INHOUSE_FAIRNESS_LIMITS.maxLaneGap}점.`);
  quality("MULTIPLE_LARGE_GAPS", "큰 격차가 있는 포지션", largeLanes.length > INHOUSE_FAIRNESS_LIMITS.maxLargeLaneCount,
    `${INHOUSE_FAIRNESS_LIMITS.largeLaneGap}점 이상 격차 ${largeLanes.length}곳${largeLanes.length ? ` (${largeLanes.map((p) => POSITION_LABEL[p]).join(", ")})` : ""}. 서로 반대 방향의 격차도 각각 셉니다.`);
  quality("BOTTOM_POWER", "바텀 합산 전력", metrics.bottomGap > INHOUSE_FAIRNESS_LIMITS.maxBottomAverageGap * 2,
    `바텀 평균 전력 차이 ${bottomAverageGap}점 / 권장 최대 ${INHOUSE_FAIRNESS_LIMITS.maxBottomAverageGap}점.`);

  add("AUTO_ROLES", "주·부포지션 이탈", autoCount ? "WARN" : "PASS", autoCount
    ? `주·부포지션 외 배치: RED ${autoRed}명 / BLUE ${autoBlue}명. 이탈 인원을 먼저 줄이고 부담을 분산해야 합니다.`
    : "모두 등록된 주·부포지션에 배치되었습니다.");

  const direction = (code: string, label: string, fails: boolean, penalty: number, detail: string) => {
    if (fails) directionalPenalty += penalty;
    add(code, label, fails ? "WARN" : "PASS", detail);
  };
  // With tied ratings, any pair representing the top two ratings is legitimate.
  // This avoids arbitrary input ordering or player IDs deciding who is penalized.
  direction("TOP_PLAYERS_SPLIT", "상위 두 명 분산", !metrics.topPlayersSplit,
    INHOUSE_DIRECTIONAL_PENALTIES.topPlayersTogether, metrics.topPlayersSplit
      ? "상위 두 명을 서로 다른 팀에 배치했습니다. 동점자는 동등하게 취급합니다."
      : "기본 전력 상위 두 명이 같은 팀에 배치되었습니다.");
  direction("TOP_PLAYERS_MID_JUNGLE", "상위 두 명 미드·정글", metrics.midJunglePossible && !metrics.assignedMidJungle,
    INHOUSE_DIRECTIONAL_PENALTIES.topPlayersOutsideMidJungle, !metrics.midJunglePossible
      ? "상위 두 명의 등록 주·부포지션으로 미드·정글 분담이 불가능하여 강제하지 않습니다."
      : metrics.assignedMidJungle ? "상위 두 명이 서로 다른 팀에서 미드와 정글을 나눠 맡았습니다."
        : "상위 두 명이 가능한 미드·정글 분담을 충족하지 못했습니다.");

  const { topMidStack, bottomStack, unsupportedSupport, jungleWithoutCarry, redHasPath, blueHasPath } = metrics;
  direction("TOP_MID_SPLIT", "탑·미드 강점 분산", topMidStack, INHOUSE_DIRECTIONAL_PENALTIES.topMidStack,
    topMidStack ? "탑과 미드의 뚜렷한 우세가 한 팀에 몰렸습니다." : "탑·미드 우세가 분산되었거나 한 곳 이상이 동급입니다.");
  direction("BOTTOM_SPLIT", "원딜·서폿 강점 분산", bottomStack, INHOUSE_DIRECTIONAL_PENALTIES.bottomStack,
    bottomStack ? "원딜과 서폿이 모두 같은 팀에서 뚜렷하게 우세합니다." : "원딜·서폿 우세가 분산되었거나 한 곳 이상이 동급입니다.");
  direction("SUPPORT_JUNGLE", "서폿 열세 보완", unsupportedSupport,
    INHOUSE_DIRECTIONAL_PENALTIES.weakSupportWithoutJungle, unsupportedSupport
      ? "서폿이 열세인 팀의 정글도 열세입니다. 다른 강점과 함께 검토해야 합니다."
      : "서폿이 동급이거나, 서폿 열세 팀에 동급 이상의 정글이 있습니다.");
  direction("JUNGLE_CARRY_LANE", "정글이 활용할 라인", jungleWithoutCarry,
    INHOUSE_DIRECTIONAL_PENALTIES.jungleWithoutCarryLane, jungleWithoutCarry
      ? "정글 우세 팀의 탑·미드·원딜이 모두 열세여서 활용 가능한 라인이 부족합니다."
      : "정글이 동급이거나 정글 우세 팀에 동급 이상의 탑·미드·원딜이 있습니다.");
  const missingWinPath = !redHasPath || !blueHasPath;
  direction("BOTH_WIN_PATHS", "양 팀의 승리 경로", missingWinPath,
    INHOUSE_DIRECTIONAL_PENALTIES.missingWinPath, missingWinPath
      ? `${redHasPath ? "BLUE" : "RED"}팀의 탑·미드·원딜이 모두 열세입니다. 강한 정글·서폿만으로 보상을 끝내지 않습니다.`
      : "양 팀 모두 탑·미드·원딜 중 한 곳 이상이 동급 또는 우세합니다.");
  return report(maxLaneGap, totalGap, metrics);
}
