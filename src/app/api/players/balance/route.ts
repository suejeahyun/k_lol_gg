export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfRateLimited } from "@/lib/rate-limit";

type Team = "RED" | "BLUE";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type RoleType = "MAIN" | "SUB" | "AUTO";

type ScoreBreakdown = {
  currentTierScore: number;
  peakTierScore: number;
  tierBaseScore: number;
  adjustedScore: number;
  internalRankBaseScore: number;
  rankGapFromLowest: number;
  rankAddedScore: number;
  rankScore: number;
  tierWeight: number;
  internalRankWeight: number;
  mixedBaseScore: number;
  sTierBonus: number;
  finalBaseScore: number;
  roleMultiplier: number;
  roleLoss: number;
  finalScore: number;
};

type PlayerInput = {
  playerId?: number | null;
  name: string;
  nickname?: string;
  tag?: string;
  mainPosition: Position | null;
  mainPositions: Position[];
  subPositions: Position[];
};

type RequestBody = {
  players: PlayerInput[];
};

type ResolvedPlayer = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string;
  currentTier: string;
  winRate: number;
  adjustedScore: number;
  rankScore: number;
  rankBaseScore: number;
  rankAddedScore: number;
  rankGapFromLowest: number;
  tierWeight: number;
  internalRankWeight: number;
  mixedBaseScore: number;
  bonus: number;
  finalBaseScore: number;
  mainPosition: Position | null;
  mainPositions: Position[];
  subPositions: Position[];
};

type Assignment = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  team: Team;
  position: Position;
  roleType: RoleType;
  score: number;
  peakTier: string;
  currentTier: string;
  tierLabel: string;
  winRate: number;
  adjustedScore: number;
  rankScore: number;
  rankBaseScore: number;
  rankAddedScore: number;
  rankGapFromLowest: number;
  tierWeight: number;
  internalRankWeight: number;
  mixedBaseScore: number;
  bonus: number;
  finalBaseScore: number;
  mainPositions: Position[];
  subPositions: Position[];
  currentTierScore: number;
  peakTierScore: number;
  baseTierScore: number;
  scoreBreakdown: ScoreBreakdown;
  explanation: string[];
};

type TeamBestResult = {
  total: number;
  assignments: Assignment[];
  mainAssignedCount: number;
  subAssignedCount: number;
  autoAssignedCount: number;
};

type CandidateSnapshot = {
  redTotal: number;
  blueTotal: number;
  diff: number;
  totalScore: number;
  lineDiffTotal: number;
  maxLineDiff: number;
  topPlayerDiff: number;
  sTierStackPenalty: number;
  weightedLineDiff: number;
  frontSideDiff: number;
  midJglDiff: number;
  bottomDiff: number;
  autoLinePenalty: number;
  mainImbalancePenalty: number;
  dataReliabilityPenalty: number;
  stompPenalty: number;
  balanceCost: number;
  mainAssignedCount: number;
  subAssignedCount: number;
  autoAssignedCount: number;
  assignments: Assignment[];
};

type TierScoreDetail = {
  label: string;
  score: number;
  source: "tier" | "fallback";
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isValidPosition(value: unknown): value is Position {
  return typeof value === "string" && POSITIONS.includes(value as Position);
}

function isValidSubPositions(value: unknown): value is Position[] {
  return Array.isArray(value) && value.every((item) => isValidPosition(item));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function uniquePositions(
  mainPosition: Position | null,
  mainPositions: Position[],
  subPositions: Position[],
): {
  mainPosition: Position | null;
  mainPositions: Position[];
  subPositions: Position[];
} {
  const uniqueMainPositions = [...new Set(mainPositions)];

  const fallbackMainPositions =
    uniqueMainPositions.length > 0
      ? uniqueMainPositions
      : mainPosition
        ? [mainPosition]
        : [];

  const filteredSubs = [...new Set(subPositions)].filter(
    (position) => !fallbackMainPositions.includes(position),
  );

  return {
    mainPosition: fallbackMainPositions[0] ?? null,
    mainPositions: fallbackMainPositions,
    subPositions: filteredSubs,
  };
}

function extractLp(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const lpMatch = compact.match(/(\d+)\s*(p|P|lp|LP|점)/);
  if (lpMatch) return Number(lpMatch[1]);

  return null;
}

function extractDivision(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const tierMatch = compact.match(
    /(다이아|다이아몬드|에메랄드|플래티넘|플레|골드|실버|브론즈|아이언)([1-4])/,
  );

  if (!tierMatch) return null;
  return Number(tierMatch[2]);
}

function extractFloor(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const floorMatch = compact.match(/([1-9]|10)층/);

  if (!floorMatch) return null;
  return Number(floorMatch[1]);
}

const CURRENT_TIER_WEIGHT = 0.7;
const PEAK_TIER_WEIGHT = 0.3;
const INTERNAL_GAP_BONUS_MAX = 8;

const MAIN_POSITION_MULTIPLIER = 1;
const SUB_POSITION_MULTIPLIER = 0.85;
const AUTO_POSITION_MULTIPLIER = 0.75;

function getDivisionBonus(division: number | null) {
  if (division === 1) return 6;
  if (division === 2) return 4;
  if (division === 3) return 2;
  return 0;
}

function getLpBonus(raw: string, unit = 100, maxBonus = 10) {
  const lp = extractLp(raw);
  if (lp === null) return 0;
  return Math.min(maxBonus, Math.floor(lp / unit));
}

function getTierScoreDetail(raw: string): TierScoreDetail | null {
  const value = raw.trim();
  const compact = value.replace(/\s/g, "").toLowerCase();
  if (!compact) return null;

  const division = extractDivision(value);
  const floor = extractFloor(value);

  if (compact.includes("챌린저") || compact.includes("challenger")) {
    return {
      label: value,
      score: 118 + getLpBonus(value, 200, 7),
      source: "tier",
    };
  }

  if (compact.includes("그랜드마스터") || compact.includes("grandmaster")) {
    return {
      label: value,
      score: 112 + getLpBonus(value, 200, 4),
      source: "tier",
    };
  }

  if (compact.includes("마스터") || compact.includes("master")) {
    const parsedFloor =
      floor ??
      (() => {
        const lp = extractLp(value);
        if (lp === null) return 1;
        return Math.max(1, Math.min(10, Math.floor(lp / 100) + 1));
      })();

    const safeFloor = Math.max(1, Math.min(10, parsedFloor));

    return {
      label: value,
      score: 82 + (safeFloor - 1) * 3,
      source: "tier",
    };
  }

  if (compact.includes("다이아") || compact.includes("diamond")) {
    return {
      label: value,
      score: 70 + getDivisionBonus(division),
      source: "tier",
    };
  }

  if (compact.includes("에메랄드") || compact.includes("emerald")) {
    return {
      label: value,
      score: 60 + getDivisionBonus(division),
      source: "tier",
    };
  }

  if (
    compact.includes("플래티넘") ||
    compact.includes("플레") ||
    compact.includes("platinum")
  ) {
    return {
      label: value,
      score: 50 + getDivisionBonus(division),
      source: "tier",
    };
  }

  if (compact.includes("골드") || compact.includes("gold")) {
    return {
      label: value,
      score: 40 + getDivisionBonus(division),
      source: "tier",
    };
  }

  if (compact.includes("실버") || compact.includes("silver")) {
    return {
      label: value,
      score: 30 + getDivisionBonus(division),
      source: "tier",
    };
  }

  if (compact.includes("브론즈") || compact.includes("bronze")) {
    return {
      label: value,
      score: 20 + getDivisionBonus(division),
      source: "tier",
    };
  }

  if (compact.includes("아이언") || compact.includes("iron")) {
    return {
      label: value,
      score: 10 + getDivisionBonus(division),
      source: "tier",
    };
  }

  return null;
}

function getResolvedTierScoreDetail(currentTier: string, peakTier: string) {
  const current = getTierScoreDetail(currentTier || "");
  const peak = getTierScoreDetail(peakTier || "");

  if (current && peak) {
    return {
      currentTierScore: current.score,
      peakTierScore: peak.score,
      currentTierNote: "현재티어 점수를 그대로 반영",
      peakTierNote: "최고티어 점수를 그대로 반영",
    };
  }

  if (!current && peak) {
    return {
      currentTierScore: Number((peak.score * 0.8).toFixed(2)),
      peakTierScore: peak.score,
      currentTierNote:
        "현재티어 없음: 최고티어 점수의 80%를 현재티어 대체값으로 반영",
      peakTierNote: "최고티어 점수를 그대로 반영",
    };
  }

  if (current && !peak) {
    return {
      currentTierScore: current.score,
      peakTierScore: current.score,
      currentTierNote: "현재티어 점수를 그대로 반영",
      peakTierNote: "최고티어 없음: 현재티어와 동일하게 반영",
    };
  }

  return {
    currentTierScore: 30,
    peakTierScore: 30,
    currentTierNote: "티어 미등록: 임시 기준 30점 적용",
    peakTierNote: "티어 미등록: 임시 기준 30점 적용",
  };
}

function getInternalGapBonus(gap: number) {
  if (gap < 5) return 0;
  if (gap >= 40) return INTERNAL_GAP_BONUS_MAX;
  return Math.min(INTERNAL_GAP_BONUS_MAX, Math.floor(gap / 5));
}

function getTierLabel(currentTier: string, peakTier: string) {
  const current = currentTier?.trim();
  const peak = peakTier?.trim();

  if (current) return current;
  if (peak) return peak;
  return "티어 미등록";
}

function getSTierBonus(peakTier: string) {
  const compact = peakTier.replace(/\s/g, "");

  if (compact.includes("챌린저")) return 10;
  if (compact.includes("그랜드마스터")) return 8;
  if (compact.includes("마스터")) return 5;

  return 0;
}

function getPositionBaseScore(
  player: Pick<ResolvedPlayer, "currentTier" | "peakTier">,
  position?: Position,
) {
  void position;

  const tierDetail = getResolvedTierScoreDetail(
    player.currentTier || "",
    player.peakTier || "",
  );
  const baseTierScore =
    tierDetail.currentTierScore * CURRENT_TIER_WEIGHT +
    tierDetail.peakTierScore * PEAK_TIER_WEIGHT;

  return Number(baseTierScore.toFixed(2));
}

function getPositionTierScoreDetail(
  player: Pick<ResolvedPlayer, "currentTier" | "peakTier">,
  position?: Position,
) {
  void position;

  const tierDetail = getResolvedTierScoreDetail(
    player.currentTier || "",
    player.peakTier || "",
  );
  const baseTierScore = Number(
    (
      tierDetail.currentTierScore * CURRENT_TIER_WEIGHT +
      tierDetail.peakTierScore * PEAK_TIER_WEIGHT
    ).toFixed(2),
  );

  return {
    currentTierScore: tierDetail.currentTierScore,
    peakTierScore: tierDetail.peakTierScore,
    weightedTierScore: baseTierScore,
    floorScore: 0,
    baseTierScore,
    currentTierNote: tierDetail.currentTierNote,
    peakTierNote: tierDetail.peakTierNote,
  };
}

function getRoleMultiplier(roleType: RoleType) {
  if (roleType === "MAIN") return MAIN_POSITION_MULTIPLIER;
  if (roleType === "SUB") return SUB_POSITION_MULTIPLIER;
  return AUTO_POSITION_MULTIPLIER;
}

function getScoreExplanation(params: {
  player: ResolvedPlayer;
  position: Position;
  roleType: RoleType;
  scoreBreakdown: ScoreBreakdown;
}) {
  const { player, position, roleType, scoreBreakdown } = params;
  const roleLabel =
    roleType === "MAIN"
      ? "주 포지션"
      : roleType === "SUB"
        ? "부 포지션"
        : "자동배정";

  const explanations = [
    `티어 기준점수는 현재티어 ${scoreBreakdown.currentTierScore.toFixed(1)}점 × 70% + 최고티어 ${scoreBreakdown.peakTierScore.toFixed(1)}점 × 30% = ${scoreBreakdown.adjustedScore.toFixed(1)}점입니다.`,
    `내부 보정은 참가자 최하위 티어 기준점수와의 차이 ${scoreBreakdown.rankGapFromLowest.toFixed(1)}점을 구간표에 적용해 +${scoreBreakdown.rankAddedScore.toFixed(1)}점으로 계산했습니다.`,
    `최종 기준점수는 티어 기준점수 ${scoreBreakdown.adjustedScore.toFixed(1)}점 + 내부 보정 ${scoreBreakdown.rankAddedScore.toFixed(1)}점 + S급 보정 ${scoreBreakdown.sTierBonus.toFixed(1)}점 = ${scoreBreakdown.finalBaseScore.toFixed(1)}점입니다.`,
    `${position} 배정은 ${roleLabel} 기준이므로 포지션 반영률 ${(scoreBreakdown.roleMultiplier * 100).toFixed(0)}%가 적용되었습니다.`,
    `최종 반영점수는 ${scoreBreakdown.finalBaseScore.toFixed(1)} × ${scoreBreakdown.roleMultiplier.toFixed(2)} = ${scoreBreakdown.finalScore.toFixed(1)}점입니다.`,
  ];

  if (!player.currentTier && player.peakTier) {
    explanations.push(
      "현재티어가 없어 최고티어 점수의 80%를 현재티어 대체값으로 사용했습니다.",
    );
  }

  if (!player.peakTier && player.currentTier) {
    explanations.push(
      "최고티어가 없어 최고티어 점수는 현재티어와 동일하게 계산했습니다.",
    );
  }

  if (roleType === "AUTO") {
    explanations.push(
      "선택한 주/부 포지션이 아니므로 자동배정 반영률이 적용되었습니다.",
    );
  }

  return explanations;
}

function getPlayerAdjustedScore(
  player: Pick<
    ResolvedPlayer,
    "currentTier" | "peakTier" | "mainPositions" | "subPositions"
  >,
) {
  const preferredPositions =
    player.mainPositions.length > 0
      ? player.mainPositions
      : player.subPositions.length > 0
        ? player.subPositions
        : POSITIONS;

  const scores = preferredPositions.map((position) =>
    getPositionBaseScore(player, position),
  );

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Number(average.toFixed(2));
}

function applyInternalRankScores(
  players: Omit<
    ResolvedPlayer,
    | "adjustedScore"
    | "rankScore"
    | "rankBaseScore"
    | "rankAddedScore"
    | "rankGapFromLowest"
    | "tierWeight"
    | "internalRankWeight"
    | "mixedBaseScore"
    | "bonus"
    | "finalBaseScore"
  >[],
): ResolvedPlayer[] {
  const playersWithTierScore = players.map((player) => {
    const adjustedScore = getPlayerAdjustedScore(player);
    const bonus = getSTierBonus(player.peakTier);

    return {
      ...player,
      adjustedScore,
      bonus,
    };
  });

  const lowestAdjustedScore = Math.min(
    ...playersWithTierScore.map((player) => player.adjustedScore),
  );

  return playersWithTierScore
    .map((player) => {
      const rankGapFromLowest = Number(
        (player.adjustedScore - lowestAdjustedScore).toFixed(2),
      );
      const rankAddedScore = getInternalGapBonus(rankGapFromLowest);
      const rankScore = Number(
        (player.adjustedScore + rankAddedScore).toFixed(2),
      );
      const finalBaseScore = Number(
        (player.adjustedScore + rankAddedScore + player.bonus).toFixed(2),
      );

      return {
        ...player,
        rankScore,
        rankBaseScore: Number(lowestAdjustedScore.toFixed(2)),
        rankAddedScore,
        rankGapFromLowest,
        tierWeight: 1,
        internalRankWeight: 0,
        mixedBaseScore: Number(
          (player.adjustedScore + rankAddedScore).toFixed(2),
        ),
        finalBaseScore,
      };
    })
    .sort((a, b) => a.id - b.id);
}

function getRoleType(player: ResolvedPlayer, position: Position): RoleType {
  if (player.mainPositions.includes(position)) return "MAIN";
  if (player.subPositions.includes(position)) return "SUB";
  return "AUTO";
}

function getAssignedScore(player: ResolvedPlayer, position: Position) {
  const roleType = getRoleType(player, position);
  const multiplier = getRoleMultiplier(roleType);
  const tierDetail = getPositionTierScoreDetail(player, position);
  const score = Number((player.finalBaseScore * multiplier).toFixed(2));
  const roleLoss = Number((player.finalBaseScore - score).toFixed(2));

  const scoreBreakdown: ScoreBreakdown = {
    currentTierScore: tierDetail.currentTierScore,
    peakTierScore: tierDetail.peakTierScore,
    tierBaseScore: tierDetail.baseTierScore,
    adjustedScore: player.adjustedScore,
    internalRankBaseScore: player.rankBaseScore,
    rankGapFromLowest: player.rankGapFromLowest,
    rankAddedScore: player.rankAddedScore,
    rankScore: player.rankScore,
    sTierBonus: player.bonus,
    tierWeight: 1,
    internalRankWeight: 0,
    mixedBaseScore: player.mixedBaseScore,
    finalBaseScore: player.finalBaseScore,
    roleMultiplier: multiplier,
    roleLoss,
    finalScore: score,
  };

  return {
    roleType,
    score,
    currentTierScore: tierDetail.currentTierScore,
    peakTierScore: tierDetail.peakTierScore,
    baseTierScore: tierDetail.baseTierScore,
    scoreBreakdown,
    explanation: getScoreExplanation({
      player,
      position,
      roleType,
      scoreBreakdown,
    }),
  };
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  const result: T[][] = [];

  items.forEach((item, index) => {
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
    const permutations = permute(remaining);

    permutations.forEach((permutation) => {
      result.push([item, ...permutation]);
    });
  });

  return result;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === size) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

function evaluateTeam(team: Team, players: ResolvedPlayer[]): TeamBestResult {
  const permutations = permute(players);
  let best: TeamBestResult | null = null;

  permutations.forEach((orderedPlayers) => {
    let total = 0;
    let mainAssignedCount = 0;
    let subAssignedCount = 0;
    let autoAssignedCount = 0;

    const assignments: Assignment[] = orderedPlayers.map((player, index) => {
      const position = POSITIONS[index];
      const {
        roleType,
        score,
        currentTierScore,
        peakTierScore,
        baseTierScore,
        scoreBreakdown,
        explanation,
      } = getAssignedScore(player, position);

      if (roleType === "MAIN") mainAssignedCount += 1;
      else if (roleType === "SUB") subAssignedCount += 1;
      else autoAssignedCount += 1;

      total += score;

      return {
        playerId: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        team,
        position,
        roleType,
        score,
        peakTier: player.peakTier,
        currentTier: player.currentTier,
        tierLabel: getTierLabel(player.currentTier, player.peakTier),
        winRate: player.winRate,
        adjustedScore: player.adjustedScore,
        rankScore: player.rankScore,
        rankBaseScore: player.rankBaseScore,
        rankAddedScore: player.rankAddedScore,
        rankGapFromLowest: player.rankGapFromLowest,
        bonus: player.bonus,
        tierWeight: 1,
        internalRankWeight: 0,
        mixedBaseScore: player.mixedBaseScore,
        finalBaseScore: player.finalBaseScore,
        mainPositions: player.mainPositions,
        subPositions: player.subPositions,
        currentTierScore,
        peakTierScore,
        baseTierScore,
        scoreBreakdown,
        explanation,
      };
    });

    const candidate: TeamBestResult = {
      total: Number(total.toFixed(2)),
      assignments,
      mainAssignedCount,
      subAssignedCount,
      autoAssignedCount,
    };

    if (!best) {
      best = candidate;
      return;
    }

    const candidateKey =
      candidate.mainAssignedCount * 100000 +
      candidate.subAssignedCount * 10000 -
      candidate.autoAssignedCount * 100 -
      candidate.total;

    const bestKey =
      best.mainAssignedCount * 100000 +
      best.subAssignedCount * 10000 -
      best.autoAssignedCount * 100 -
      best.total;

    if (candidateKey > bestKey) {
      best = candidate;
    }
  });

  return (
    best ?? {
      total: 0,
      assignments: [],
      mainAssignedCount: 0,
      subAssignedCount: 0,
      autoAssignedCount: 0,
    }
  );
}

function getLineDiffTotal(assignments: Assignment[]) {
  let total = 0;

  POSITIONS.forEach((position) => {
    const red = assignments.find(
      (item) => item.team === "RED" && item.position === position,
    );

    const blue = assignments.find(
      (item) => item.team === "BLUE" && item.position === position,
    );

    if (!red || !blue) return;

    total += Math.abs(red.score - blue.score);
  });

  return Number(total.toFixed(2));
}

function getMaxLineDiff(assignments: Assignment[]) {
  const diffs = POSITIONS.map((position) => {
    const red = assignments.find((item) => item.team === "RED" && item.position === position);
    const blue = assignments.find((item) => item.team === "BLUE" && item.position === position);

    if (!red || !blue) return 0;

    return Math.abs(red.score - blue.score);
  });

  return Number(Math.max(...diffs).toFixed(2));
}

function getTopPlayerDiff(assignments: Assignment[]) {
  const redScores = assignments
    .filter((item) => item.team === "RED")
    .map((item) => item.score);

  const blueScores = assignments
    .filter((item) => item.team === "BLUE")
    .map((item) => item.score);

  const redTop = Math.max(...redScores);
  const blueTop = Math.max(...blueScores);

  return Number(Math.abs(redTop - blueTop).toFixed(2));
}

function getSTierStackPenalty(assignments: Assignment[]) {
  const redCount = assignments.filter(
    (item) => item.team === "RED" && item.bonus >= 5,
  ).length;

  const blueCount = assignments.filter(
    (item) => item.team === "BLUE" && item.bonus >= 5,
  ).length;

  return Math.abs(redCount - blueCount) * 12;
}



function getAssignment(
  assignments: Assignment[],
  team: Team,
  position: Position,
) {
  return assignments.find(
    (assignment) => assignment.team === team && assignment.position === position,
  );
}

function getLineDiff(assignments: Assignment[], position: Position) {
  const red = getAssignment(assignments, "RED", position);
  const blue = getAssignment(assignments, "BLUE", position);

  if (!red || !blue) return 0;
  return Math.abs(red.score - blue.score);
}

function getWeightedLineDiff(assignments: Assignment[]) {
  const weights: Record<Position, number> = {
    TOP: 1,
    JGL: 1.25,
    MID: 1.2,
    ADC: 1.1,
    SUP: 1,
  };

  const total = POSITIONS.reduce(
    (sum, position) => sum + getLineDiff(assignments, position) * weights[position],
    0,
  );

  return Number(total.toFixed(2));
}

function getGroupDiff(assignments: Assignment[], positions: Position[]) {
  const redTotal = positions.reduce((sum, position) => {
    const assignment = getAssignment(assignments, "RED", position);
    return sum + (assignment?.score ?? 0);
  }, 0);

  const blueTotal = positions.reduce((sum, position) => {
    const assignment = getAssignment(assignments, "BLUE", position);
    return sum + (assignment?.score ?? 0);
  }, 0);

  return Number(Math.abs(redTotal - blueTotal).toFixed(2));
}

function getGapPenalty(diff: number) {
  if (diff >= 20) return 12;
  if (diff >= 15) return 8;
  if (diff >= 10) return 5;
  if (diff >= 5) return 2;
  return 0;
}

function getAutoLinePenalty(assignments: Assignment[]) {
  const penalties: Record<Position, number> = {
    TOP: 2,
    JGL: 5,
    MID: 4,
    ADC: 3,
    SUP: 3,
  };

  return assignments.reduce((sum, assignment) => {
    if (assignment.roleType !== "AUTO") return sum;
    return sum + penalties[assignment.position];
  }, 0);
}

function getMainImbalancePenalty(assignments: Assignment[]) {
  const redMain = assignments.filter(
    (assignment) => assignment.team === "RED" && assignment.roleType === "MAIN",
  ).length;
  const blueMain = assignments.filter(
    (assignment) => assignment.team === "BLUE" && assignment.roleType === "MAIN",
  ).length;

  return Math.abs(redMain - blueMain) * 2;
}

function getReliabilityRate(count: number, bands: Array<[number, number]>) {
  for (const [minCount, rate] of bands) {
    if (count >= minCount) return rate;
  }

  return 0;
}

function getDataReliabilityPenalty(
  assignments: Assignment[],
  recentCountByPlayerId: Map<number, number>,
  internalCountByPlayerId: Map<number, number>,
  internalPositionCountByKey: Map<string, number>,
) {
  const totalPenalty = assignments.reduce((sum, assignment) => {
    const recentCount = recentCountByPlayerId.get(assignment.playerId) ?? 0;
    const internalCount = internalCountByPlayerId.get(assignment.playerId) ?? 0;
    const positionCount =
      internalPositionCountByKey.get(`${assignment.playerId}:${assignment.position}`) ?? 0;

    const recentRate = getReliabilityRate(recentCount, [
      [15, 1],
      [10, 0.6],
      [5, 0.3],
    ]);
    const internalRate = getReliabilityRate(internalCount, [
      [20, 1],
      [10, 0.6],
      [5, 0.3],
    ]);
    const positionRate = getReliabilityRate(positionCount, [
      [10, 1],
      [6, 0.6],
      [3, 0.3],
    ]);

    // 데이터가 부족할수록 조합 평가 신뢰도가 낮으므로 작은 패널티를 줍니다.
    return sum + (1 - recentRate) * 0.5 + (1 - internalRate) * 0.7 + (1 - positionRate) * 0.5;
  }, 0);

  return Number(totalPenalty.toFixed(2));
}

function getStompPenalty(assignments: Assignment[]) {
  const lineGapPenalty = POSITIONS.reduce(
    (sum, position) => sum + getGapPenalty(getLineDiff(assignments, position)),
    0,
  );

  const topSidePenalty = getGapPenalty(
    getGroupDiff(assignments, ["TOP", "JGL", "MID"]),
  );
  const midJglPenalty = getGapPenalty(
    getGroupDiff(assignments, ["JGL", "MID"]),
  );
  const bottomPenalty = getGapPenalty(
    getGroupDiff(assignments, ["ADC", "SUP"]),
  );

  return Number(
    (lineGapPenalty + topSidePenalty * 0.5 + midJglPenalty * 0.7 + bottomPenalty * 0.7).toFixed(2),
  );
}

function getBalanceCost(params: {
  diff: number;
  lineDiffTotal: number;
  maxLineDiff: number;
  autoAssignedCount: number;
  subAssignedCount: number;
  sTierStackPenalty: number;
  topPlayerDiff: number;
  weightedLineDiff: number;
  frontSideDiff: number;
  midJglDiff: number;
  bottomDiff: number;
  autoLinePenalty: number;
  mainImbalancePenalty: number;
  dataReliabilityPenalty: number;
  stompPenalty: number;
}) {
  return Number(
    (
      params.diff * 1.2 +
      params.weightedLineDiff * 0.7 +
      params.maxLineDiff * 1.0 +
      params.midJglDiff * 0.45 +
      params.bottomDiff * 0.45 +
      params.autoLinePenalty * 1.0 +
      params.mainImbalancePenalty * 0.6 +
      params.sTierStackPenalty * 0.25
    ).toFixed(2),
  );
}

function getCandidateKey(candidate: CandidateSnapshot) {
  return candidate.assignments
    .filter((assignment) => assignment.team === "RED")
    .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position))
    .map((assignment) => `${assignment.position}:${assignment.playerId}`)
    .join("|");
}

function getTeamTotalPlanCost(candidate: CandidateSnapshot) {
  return Number(
    (
      candidate.diff * 1.5 +
      candidate.weightedLineDiff * 0.25 +
      candidate.maxLineDiff * 0.5 +
      candidate.midJglDiff * 0.2 +
      candidate.bottomDiff * 0.2 +
      candidate.autoLinePenalty * 0.8 +
      candidate.mainImbalancePenalty * 0.4 +
      candidate.sTierStackPenalty * 0.2
    ).toFixed(2),
  );
}

function getLineBalancePlanCost(candidate: CandidateSnapshot) {
  return Number(
    (
      candidate.weightedLineDiff * 1.0 +
      candidate.maxLineDiff * 1.5 +
      candidate.midJglDiff * 0.7 +
      candidate.bottomDiff * 0.7 +
      candidate.diff * 0.35 +
      candidate.autoLinePenalty * 0.9 +
      candidate.mainImbalancePenalty * 0.3 +
      candidate.sTierStackPenalty * 0.2
    ).toFixed(2),
  );
}

function getPositionSatisfactionPlanCost(candidate: CandidateSnapshot) {
  return Number(
    (
      candidate.autoAssignedCount * 5 +
      candidate.autoLinePenalty * 1.5 +
      candidate.subAssignedCount * 1.5 -
      candidate.mainAssignedCount * 2 +
      candidate.mainImbalancePenalty * 0.8 +
      candidate.diff * 0.5 +
      candidate.maxLineDiff * 0.4 +
      candidate.bottomDiff * 0.2 +
      candidate.midJglDiff * 0.2 +
      candidate.sTierStackPenalty * 0.2
    ).toFixed(2),
  );
}

type PlanKind = "TEAM_TOTAL" | "LINE_BALANCE" | "POSITION_SATISFACTION";

function getPlanCost(candidate: CandidateSnapshot, kind: PlanKind) {
  if (kind === "TEAM_TOTAL") return getTeamTotalPlanCost(candidate);
  if (kind === "LINE_BALANCE") return getLineBalancePlanCost(candidate);
  return getPositionSatisfactionPlanCost(candidate);
}

function compareByPlan(kind: PlanKind) {
  return (a: CandidateSnapshot, b: CandidateSnapshot) => {
    const costA = getPlanCost(a, kind);
    const costB = getPlanCost(b, kind);

    if (costA !== costB) return costA - costB;

    if (kind === "TEAM_TOTAL") {
      if (a.diff !== b.diff) return a.diff - b.diff;
      if (a.lineDiffTotal !== b.lineDiffTotal) return a.lineDiffTotal - b.lineDiffTotal;
    }

    if (kind === "LINE_BALANCE") {
      if (a.maxLineDiff !== b.maxLineDiff) return a.maxLineDiff - b.maxLineDiff;
      if (a.lineDiffTotal !== b.lineDiffTotal) return a.lineDiffTotal - b.lineDiffTotal;
      if (a.diff !== b.diff) return a.diff - b.diff;
    }

    if (kind === "POSITION_SATISFACTION") {
      if (a.mainAssignedCount !== b.mainAssignedCount) {
        return b.mainAssignedCount - a.mainAssignedCount;
      }
      if (a.autoAssignedCount !== b.autoAssignedCount) {
        return a.autoAssignedCount - b.autoAssignedCount;
      }
      if (a.diff !== b.diff) return a.diff - b.diff;
    }

    if (a.autoAssignedCount !== b.autoAssignedCount) {
      return a.autoAssignedCount - b.autoAssignedCount;
    }

    return a.balanceCost - b.balanceCost;
  };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitRejected = await rejectIfRateLimited(request, {
      action: "TEAM_BALANCE_CALCULATE",
      limit: 20,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 64 * 1024) {
      return NextResponse.json(
        { message: "요청 데이터가 너무 큽니다." },
        { status: 413 },
      );
    }

    const body = (await request.json()) as RequestBody;

    if (!body || !Array.isArray(body.players) || body.players.length !== 10) {
      return NextResponse.json(
        { message: "플레이어는 정확히 10명이어야 합니다." },
        { status: 400 },
      );
    }

    const normalizedInputs: PlayerInput[] = [];
    const invalidInputNames: string[] = [];

    for (const player of body.players) {
      const rawName =
        typeof player?.name === "string" ? player.name.trim() : "";

      const mainPosition = player?.mainPosition ?? null;

      const mainPositions = Array.isArray(player?.mainPositions)
        ? player.mainPositions
        : mainPosition
          ? [mainPosition]
          : [];

      const subPositions = player?.subPositions ?? [];

      if (!rawName) {
        invalidInputNames.push(rawName);
        continue;
      }

      if (mainPosition !== null && !isValidPosition(mainPosition)) {
        return NextResponse.json(
          { message: "주 포지션 값이 올바르지 않습니다." },
          { status: 400 },
        );
      }

      if (!isValidSubPositions(mainPositions)) {
        return NextResponse.json(
          { message: "주 포지션 목록 값이 올바르지 않습니다." },
          { status: 400 },
        );
      }

      if (!isValidSubPositions(subPositions)) {
        return NextResponse.json(
          { message: "부 포지션 값이 올바르지 않습니다." },
          { status: 400 },
        );
      }

      const normalized = uniquePositions(
        mainPosition,
        mainPositions,
        subPositions,
      );

      if (normalized.mainPositions.length === 0) {
        return NextResponse.json(
          { message: "모든 플레이어는 최소 1개의 포지션을 선택해야 합니다." },
          { status: 400 },
        );
      }

      normalizedInputs.push({
        playerId:
          typeof player?.playerId === "number" &&
          Number.isInteger(player.playerId)
            ? player.playerId
            : null,
        name: rawName,
        nickname:
          typeof player?.nickname === "string" ? player.nickname.trim() : "",
        tag: typeof player?.tag === "string" ? player.tag.trim() : "",
        mainPosition: normalized.mainPosition,
        mainPositions: normalized.mainPositions,
        subPositions: normalized.subPositions,
      });
    }

    if (invalidInputNames.length > 0) {
      return NextResponse.json(
        {
          message: "이름이 비어있는 플레이어가 있습니다.",
          invalidNames: invalidInputNames,
        },
        { status: 400 },
      );
    }

    const selectedIds = normalizedInputs
      .map((player) => player.playerId)
      .filter((playerId): playerId is number => typeof playerId === "number");

    const selectedIdCounts = new Map<number, number>();

    selectedIds.forEach((playerId) => {
      selectedIdCounts.set(playerId, (selectedIdCounts.get(playerId) ?? 0) + 1);
    });

    const duplicatedSelectedIds = [...selectedIdCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([playerId]) => playerId);

    if (duplicatedSelectedIds.length > 0) {
      return NextResponse.json(
        { message: "중복 선택된 플레이어가 있습니다." },
        { status: 400 },
      );
    }

    const nameKeys = normalizedInputs
      .filter((player) => typeof player.playerId !== "number")
      .map((player) => normalizeText(player.name));

    const nameCounts = new Map<string, number>();

    nameKeys.forEach((key) => {
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    });

    const duplicatedNames = [...nameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);

    if (duplicatedNames.length > 0) {
      return NextResponse.json(
        {
          message:
            "중복된 이름이 있습니다. 이름이 같은 경우 검색 목록에서 정확한 플레이어를 선택해주세요.",
          invalidNames: duplicatedNames,
        },
        { status: 400 },
      );
    }

    const dbPlayers = await prisma.player.findMany({
      where: {
        isActive: true,
        OR: [
          ...(selectedIds.length > 0
            ? [
                {
                  id: {
                    in: selectedIds,
                  },
                },
              ]
            : []),
          ...normalizedInputs
            .filter((player) => typeof player.playerId !== "number")
            .map((player) => ({
              name: {
                equals: player.name,
                mode: "insensitive" as const,
              },
            })),
        ],
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        peakTier: true,
        currentTier: true,
      },
    });

    const dbPlayerByIdMap = new Map(
      dbPlayers.map((player) => [player.id, player]),
    );

    const dbPlayerByNameMap = new Map(
      dbPlayers.map((player) => [normalizeText(player.name), player]),
    );

    const invalidNames = normalizedInputs
      .filter((input) => {
        if (typeof input.playerId === "number") {
          return !dbPlayerByIdMap.has(input.playerId);
        }

        return !dbPlayerByNameMap.has(normalizeText(input.name));
      })
      .map((player) => player.name);

    if (invalidNames.length > 0) {
      return NextResponse.json(
        {
          message: "등록되어있지 않은 플레이어가 있습니다.",
          invalidNames,
        },
        { status: 400 },
      );
    }

    const baseResolvedPlayers = normalizedInputs.map((input) => {
      const player =
        typeof input.playerId === "number"
          ? dbPlayerByIdMap.get(input.playerId)!
          : dbPlayerByNameMap.get(normalizeText(input.name))!;

      return {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        peakTier: player.peakTier ?? "",
        currentTier: player.currentTier ?? "",
        winRate: 0,
        mainPosition: input.mainPosition,
        mainPositions: input.mainPositions,
        subPositions: input.subPositions,
      };
    });

    const playerIds = baseResolvedPlayers.map((player) => player.id);

    const [recentSoloMatches, internalParticipants] = await Promise.all([
      prisma.playerSoloMatch.findMany({
        where: {
          playerId: {
            in: playerIds,
          },
        },
        orderBy: {
          gameCreation: "desc",
        },
        select: {
          playerId: true,
        },
      }),
      prisma.matchParticipant.findMany({
        where: {
          playerId: {
            in: playerIds,
          },
        },
        select: {
          playerId: true,
          position: true,
        },
      }),
    ]);

    const recentCountByPlayerId = new Map<number, number>();
    recentSoloMatches.forEach((match) => {
      const current = recentCountByPlayerId.get(match.playerId) ?? 0;
      if (current < 20) {
        recentCountByPlayerId.set(match.playerId, current + 1);
      }
    });

    const internalCountByPlayerId = new Map<number, number>();
    const internalPositionCountByKey = new Map<string, number>();

    internalParticipants.forEach((participant) => {
      internalCountByPlayerId.set(
        participant.playerId,
        (internalCountByPlayerId.get(participant.playerId) ?? 0) + 1,
      );

      const key = `${participant.playerId}:${participant.position}`;
      internalPositionCountByKey.set(
        key,
        (internalPositionCountByKey.get(key) ?? 0) + 1,
      );
    });

    const resolvedPlayers = applyInternalRankScores(baseResolvedPlayers);

    const teamCombinations = combinations(resolvedPlayers, 5);
    const anchorPlayerId = resolvedPlayers[0]?.id;
    const candidates: CandidateSnapshot[] = [];

    for (const redPlayers of teamCombinations) {
      const redIds = new Set(redPlayers.map((player) => player.id));

      // RED/BLUE가 완전히 뒤집힌 중복 조합은 제외합니다.
      // 같은 조합을 1안/2안/3안에 중복 노출하지 않기 위한 기준입니다.
      if (anchorPlayerId && !redIds.has(anchorPlayerId)) {
        continue;
      }

      const bluePlayers = resolvedPlayers.filter(
        (player) => !redIds.has(player.id),
      );

      const redResult = evaluateTeam("RED", redPlayers);
      const blueResult = evaluateTeam("BLUE", bluePlayers);

      const assignments = [...redResult.assignments, ...blueResult.assignments];

      const diff = Number(
        Math.abs(redResult.total - blueResult.total).toFixed(2),
      );

      const lineDiffTotal = getLineDiffTotal(assignments);
      const maxLineDiff = getMaxLineDiff(assignments);
      const topPlayerDiff = getTopPlayerDiff(assignments);
      const sTierStackPenalty = getSTierStackPenalty(assignments);
      const weightedLineDiff = getWeightedLineDiff(assignments);
      const frontSideDiff = getGroupDiff(assignments, ["TOP", "JGL", "MID"]);
      const midJglDiff = getGroupDiff(assignments, ["JGL", "MID"]);
      const bottomDiff = getGroupDiff(assignments, ["ADC", "SUP"]);
      const autoLinePenalty = getAutoLinePenalty(assignments);
      const mainImbalancePenalty = getMainImbalancePenalty(assignments);
      const dataReliabilityPenalty = getDataReliabilityPenalty(
        assignments,
        recentCountByPlayerId,
        internalCountByPlayerId,
        internalPositionCountByKey,
      );
      const stompPenalty = getStompPenalty(assignments);

      const mainAssignedCount =
        redResult.mainAssignedCount + blueResult.mainAssignedCount;

      const subAssignedCount =
        redResult.subAssignedCount + blueResult.subAssignedCount;

      const autoAssignedCount =
        redResult.autoAssignedCount + blueResult.autoAssignedCount;

      const balanceCost = getBalanceCost({
        diff,
        lineDiffTotal,
        maxLineDiff,
        autoAssignedCount,
        subAssignedCount,
        sTierStackPenalty,
        topPlayerDiff,
        weightedLineDiff,
        frontSideDiff,
        midJglDiff,
        bottomDiff,
        autoLinePenalty,
        mainImbalancePenalty,
        dataReliabilityPenalty,
        stompPenalty,
      });

      const candidate: CandidateSnapshot = {
        redTotal: redResult.total,
        blueTotal: blueResult.total,
        diff,
        totalScore: Number((redResult.total + blueResult.total).toFixed(2)),
        lineDiffTotal,
        maxLineDiff,
        topPlayerDiff,
        sTierStackPenalty,
        weightedLineDiff,
        frontSideDiff,
        midJglDiff,
        bottomDiff,
        autoLinePenalty,
        mainImbalancePenalty,
        dataReliabilityPenalty,
        stompPenalty,
        balanceCost,
        mainAssignedCount,
        subAssignedCount,
        autoAssignedCount,
        assignments,
      };

      candidates.push(candidate);
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { message: "팀 밸런스 계산 결과를 만들 수 없습니다." },
        { status: 500 },
      );
    }

    const usedKeys = new Set<string>();
    const planDefinitions: Array<{
      kind: PlanKind;
      optionNo: number;
      optionTitle: string;
      optionDescription: string;
    }> = [
      {
        kind: "TEAM_TOTAL",
        optionNo: 1,
        optionTitle: "팀 총점 균형형",
        optionDescription: "RED / BLUE 전체 점수 차이를 가장 우선한 조합입니다.",
      },
      {
        kind: "LINE_BALANCE",
        optionNo: 2,
        optionTitle: "라인별 균형형",
        optionDescription: "TOP/JGL/MID/ADC/SUP 각 라인의 점수 차이를 가장 줄인 조합입니다.",
      },
      {
        kind: "POSITION_SATISFACTION",
        optionNo: 3,
        optionTitle: "포지션 만족형",
        optionDescription: "주포지션 배정을 최대화하면서 팀 점수 차이도 함께 고려한 조합입니다.",
      },
    ];

    const selectedPlans = planDefinitions.map((plan) => {
      const sorted = [...candidates].sort(compareByPlan(plan.kind));
      const uniqueCandidate = sorted.find((candidate) => {
        const key = getCandidateKey(candidate);
        return !usedKeys.has(key);
      });

      const candidate = uniqueCandidate ?? sorted[0];

      if (candidate) {
        usedKeys.add(getCandidateKey(candidate));
      }

      return { ...plan, candidate };
    });

    const bestCandidate = selectedPlans[0]?.candidate ?? candidates.sort(compareByPlan("TEAM_TOTAL"))[0];

    const toResponsePayload = (candidate: CandidateSnapshot) => {
      const red = candidate.assignments
        .filter((assignment) => assignment.team === "RED")
        .sort(
          (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position),
        );

      const blue = candidate.assignments
        .filter((assignment) => assignment.team === "BLUE")
        .sort(
          (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position),
        );

      return {
        redTotal: candidate.redTotal,
        blueTotal: candidate.blueTotal,
        diff: candidate.diff,
        balanceCost: candidate.balanceCost,
        lineDiffTotal: candidate.lineDiffTotal,
        maxLineDiff: candidate.maxLineDiff,
        topPlayerDiff: candidate.topPlayerDiff,
        sTierStackPenalty: candidate.sTierStackPenalty,
        weightedLineDiff: candidate.weightedLineDiff,
        frontSideDiff: candidate.frontSideDiff,
        midJglDiff: candidate.midJglDiff,
        bottomDiff: candidate.bottomDiff,
        autoLinePenalty: candidate.autoLinePenalty,
        mainImbalancePenalty: candidate.mainImbalancePenalty,
        dataReliabilityPenalty: candidate.dataReliabilityPenalty,
        stompPenalty: candidate.stompPenalty,
        mainAssignedCount: candidate.mainAssignedCount,
        subAssignedCount: candidate.subAssignedCount,
        autoAssignedCount: candidate.autoAssignedCount,
        red,
        blue,
      };
    };

    const alternatives = selectedPlans
      .filter((plan) => Boolean(plan.candidate))
      .map((plan) => {
        const candidate = plan.candidate as CandidateSnapshot;

        return {
          optionNo: plan.optionNo,
          optionTitle: plan.optionTitle,
          optionDescription: plan.optionDescription,
          planType: plan.kind,
          planCost: getPlanCost(candidate, plan.kind),
          ...toResponsePayload(candidate),
        };
      });

    return NextResponse.json({
      ...toResponsePayload(bestCandidate),
      alternatives,
    });
  } catch (error) {
    console.error("[PLAYERS_BALANCE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 계산 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
