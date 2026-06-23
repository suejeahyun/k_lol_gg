export type BalanceTeam = "RED" | "BLUE";
export type BalancePosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
export type BalanceRoleType = "MAIN" | "SUB" | "AUTO";

export type BalanceEvaluatePlayer = {
  playerId: number;
  name?: string;
  team: BalanceTeam;
  position: BalancePosition;
  roleType?: BalanceRoleType | string | null;
  score?: number | null;
};

export type BalanceAiJudgement = {
  selectedOptionNo: number | null;
  selectedOptionTitle: string | null;
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  verdict: string;
  inferredWinner: BalanceTeam | "EVEN";
  predictedRedWinRate: number;
  predictedBlueWinRate: number;
  reasoning: string[];
  riskFactors: string[];
  operatingAdvice: string;
};

export type BalanceEvaluationResult = {
  redTotal: number;
  blueTotal: number;
  diff: number;
  lineDiffTotal: number;
  maxLineDiff: number;
  weightedLineDiff: number;
  frontSideDiff: number;
  midJglDiff: number;
  bottomDiff: number;
  autoAssignedCount: number;
  subAssignedCount: number;
  mainAssignedCount: number;
  autoLinePenalty: number;
  qualityScore: number;
  recommendationScore: number;
  warningMessages: string[];
  aiJudgement: BalanceAiJudgement;
};

const POSITIONS: BalancePosition[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const LINE_WEIGHTS: Record<BalancePosition, number> = {
  TOP: 0.65,
  JGL: 0.9,
  MID: 0.9,
  ADC: 0.75,
  SUP: 0.6,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function scoreOf(player: BalanceEvaluatePlayer | undefined) {
  const value = Number(player?.score ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getAssignment(players: BalanceEvaluatePlayer[], team: BalanceTeam, position: BalancePosition) {
  return players.find((player) => player.team === team && player.position === position);
}

export function getPredictedWinRates(redTotal: number, blueTotal: number) {
  const redRate = 1 / (1 + 10 ** ((blueTotal - redTotal) / 40));
  const red = round(redRate * 100, 1);
  return {
    red,
    blue: round(100 - red, 1),
  };
}

function getEvaluationOptionLabel(optionNo?: number | null, optionTitle?: string | null) {
  if (optionNo === 0) return optionTitle || "AI 전체탐색 최고안";
  if (typeof optionNo === "number") {
    return `${optionNo}안${optionTitle ? ` ${optionTitle}` : ""}`;
  }
  return optionTitle || "수동 조정안";
}

export function evaluateBalanceLayout(params: {
  assignments: BalanceEvaluatePlayer[];
  optionNo?: number | null;
  optionTitle?: string | null;
}): BalanceEvaluationResult {
  const assignments = params.assignments;
  const optionLabel = getEvaluationOptionLabel(params.optionNo, params.optionTitle);
  const redPlayers = assignments.filter((player) => player.team === "RED");
  const bluePlayers = assignments.filter((player) => player.team === "BLUE");
  const redTotal = round(redPlayers.reduce((sum, player) => sum + scoreOf(player), 0));
  const blueTotal = round(bluePlayers.reduce((sum, player) => sum + scoreOf(player), 0));
  const diff = round(Math.abs(redTotal - blueTotal));

  const lineDiffs = POSITIONS.map((position) => {
    const red = scoreOf(getAssignment(assignments, "RED", position));
    const blue = scoreOf(getAssignment(assignments, "BLUE", position));
    return {
      position,
      diff: Math.abs(red - blue),
      red,
      blue,
    };
  });

  const lineDiffTotal = round(lineDiffs.reduce((sum, item) => sum + item.diff, 0));
  const maxLineDiff = round(Math.max(0, ...lineDiffs.map((item) => item.diff)));
  const weightedLineDiff = round(
    lineDiffs.reduce((sum, item) => sum + item.diff * LINE_WEIGHTS[item.position], 0),
  );
  const redFront = ["TOP", "JGL", "MID"].reduce(
    (sum, position) => sum + scoreOf(getAssignment(assignments, "RED", position as BalancePosition)),
    0,
  );
  const blueFront = ["TOP", "JGL", "MID"].reduce(
    (sum, position) => sum + scoreOf(getAssignment(assignments, "BLUE", position as BalancePosition)),
    0,
  );
  const redMidJgl = ["JGL", "MID"].reduce(
    (sum, position) => sum + scoreOf(getAssignment(assignments, "RED", position as BalancePosition)),
    0,
  );
  const blueMidJgl = ["JGL", "MID"].reduce(
    (sum, position) => sum + scoreOf(getAssignment(assignments, "BLUE", position as BalancePosition)),
    0,
  );
  const redBottom = ["ADC", "SUP"].reduce(
    (sum, position) => sum + scoreOf(getAssignment(assignments, "RED", position as BalancePosition)),
    0,
  );
  const blueBottom = ["ADC", "SUP"].reduce(
    (sum, position) => sum + scoreOf(getAssignment(assignments, "BLUE", position as BalancePosition)),
    0,
  );

  const autoAssignedCount = assignments.filter((player) => player.roleType === "AUTO").length;
  const subAssignedCount = assignments.filter((player) => player.roleType === "SUB").length;
  const mainAssignedCount = assignments.filter((player) => player.roleType === "MAIN").length;
  const autoLinePenalty = POSITIONS.reduce((sum, position) => {
    const redAuto = getAssignment(assignments, "RED", position)?.roleType === "AUTO";
    const blueAuto = getAssignment(assignments, "BLUE", position)?.roleType === "AUTO";
    const lineWeight = position === "JGL" || position === "MID" ? 4 : position === "ADC" ? 3 : 2;
    return sum + (redAuto ? lineWeight : 0) + (blueAuto ? lineWeight : 0);
  }, 0);

  const frontSideDiff = round(Math.abs(redFront - blueFront));
  const midJglDiff = round(Math.abs(redMidJgl - blueMidJgl));
  const bottomDiff = round(Math.abs(redBottom - blueBottom));

  const penalty =
    diff * 1.2 +
    maxLineDiff * 1.4 +
    midJglDiff * 1.1 +
    bottomDiff * 0.8 +
    autoAssignedCount * 5 +
    autoLinePenalty * 0.9;
  const qualityScore = round(clamp(100 - penalty, 0, 100), 1);
  const recommendationScore = round(
    qualityScore - diff * 0.8 - maxLineDiff * 0.6 - midJglDiff * 0.7 - autoAssignedCount * 3,
    1,
  );

  const warningMessages = [
    maxLineDiff >= 12 ? `최대 라인 차이 ${maxLineDiff.toFixed(1)}점` : null,
    midJglDiff >= 10 ? `미드-정글 합산 차이 ${midJglDiff.toFixed(1)}점` : null,
    bottomDiff >= 10 ? `바텀 합산 차이 ${bottomDiff.toFixed(1)}점` : null,
    autoAssignedCount > 0 ? `AUTO 배정 ${autoAssignedCount}명` : null,
    diff >= 12 ? `총점 차이 ${diff.toFixed(1)}점` : null,
  ].filter(Boolean) as string[];

  const winRates = getPredictedWinRates(redTotal, blueTotal);
  const inferredWinner =
    Math.abs(winRates.red - winRates.blue) < 3 ? "EVEN" : winRates.red > winRates.blue ? "RED" : "BLUE";
  const riskValue = diff * 0.8 + maxLineDiff * 1.1 + midJglDiff * 1.15 + bottomDiff * 0.85 + autoAssignedCount * 4;
  const riskLevel: BalanceAiJudgement["riskLevel"] =
    riskValue >= 38 ? "HIGH" : riskValue >= 22 ? "MEDIUM" : "LOW";
  const confidence = round(clamp(qualityScore - warningMessages.length * 2, 0, 100), 1);

  const verdict =
    riskLevel === "LOW"
      ? "실사용 추천: 현재 배치 기준으로 터질 가능성이 낮은 조합입니다."
      : riskLevel === "MEDIUM"
        ? "조건부 추천: 사용할 수 있지만 핵심 라인과 AUTO 리스크를 확인해야 합니다."
        : "주의 필요: 현재 배치는 운영자가 라인/포지션 리스크를 조정하는 편이 좋습니다.";
  const operatingAdvice =
    riskLevel === "LOW"
      ? "그대로 사용해도 무리가 적습니다. 내전 결과 등록 후 AI MMR 변화를 확인하세요."
      : riskLevel === "MEDIUM"
        ? "수동 드래그로 미드-정글, 바텀, 최대 라인 차이를 먼저 줄이는 것이 좋습니다."
        : "대체안을 비교하거나 수동 드래그로 핵심 라인 차이를 줄인 뒤 저장하는 것을 권장합니다.";

  return {
    redTotal,
    blueTotal,
    diff,
    lineDiffTotal,
    maxLineDiff,
    weightedLineDiff,
    frontSideDiff,
    midJglDiff,
    bottomDiff,
    autoAssignedCount,
    subAssignedCount,
    mainAssignedCount,
    autoLinePenalty: round(autoLinePenalty),
    qualityScore,
    recommendationScore,
    warningMessages,
    aiJudgement: {
      selectedOptionNo: params.optionNo ?? null,
      selectedOptionTitle: params.optionTitle ?? null,
      confidence,
      riskLevel,
      verdict,
      inferredWinner,
      predictedRedWinRate: winRates.red,
      predictedBlueWinRate: winRates.blue,
      reasoning: [
        `${optionLabel}을 현재 배치 기준으로 다시 평가했습니다.`,
        `예상 승률은 RED ${winRates.red.toFixed(1)}% / BLUE ${winRates.blue.toFixed(1)}%입니다.`,
        `총점 차이 ${diff.toFixed(1)}점, 최대 라인 차이 ${maxLineDiff.toFixed(1)}점, 미드-정글 차이 ${midJglDiff.toFixed(1)}점을 함께 판단했습니다.`,
      ],
      riskFactors: warningMessages,
      operatingAdvice,
    },
  };
}
