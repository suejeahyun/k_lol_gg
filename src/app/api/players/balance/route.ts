export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";
import { getMmrBonus, getPositionMmrValue } from "@/lib/balance/internal-mmr";

type Team = "RED" | "BLUE";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type RoleType = "MAIN" | "SUB" | "AUTO";

type ScoreBreakdown = {
  currentTierScore: number;
  peakTierScore: number;
  inhouseScore: number;
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
  rolePenalty: number;
  soloRecentFormBonus: number;
  soloApplyPositionMatchBonus: number;
  internalPositionBonus: number;
  soloPositionBonus: number;
  positionSkillBonus: number;
  mmrBonus: number;
  balanceOverrideScore: number;
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
  syncSoloRank?: boolean;
};

type ResolvedPlayer = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string;
  currentTier: string;
  winRate: number;
  inhouseScore: number;
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
  balanceOverrideScore: number;
  balanceOverrideReason: string | null;
  balanceMmr: number;
  positionMmrs: Record<Position, number>;
  mmrConfidence: number;
  soloRecentGames: number;
  soloRecentWins: number;
  soloRecentWinRate: number | null;
  soloRecentKda: number | null;
  soloRecentMainPosition: Position | null;
  soloRecentSubPosition: Position | null;
  soloRecentPositionConfidence: number;
  soloRecentAvgDamage: number | null;
  soloRecentAvgVisionScore: number | null;
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
  inhouseScore: number;
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
  balanceOverrideScore: number;
  balanceOverrideReason: string | null;
  balanceMmr: number;
  assignedPositionMmr: number;
  mmrConfidence: number;
  soloRecentGames: number;
  soloRecentWins: number;
  soloRecentWinRate: number | null;
  soloRecentKda: number | null;
  soloRecentMainPosition: Position | null;
  soloRecentSubPosition: Position | null;
  soloRecentPositionConfidence: number;
  soloRecentAvgDamage: number | null;
  soloRecentAvgVisionScore: number | null;
  internalPositionBonus: number;
  soloPositionBonus: number;
  soloApplyPositionMatchBonus: number;
  positionSkillBonus: number;
  mmrBonus: number;
  rolePenalty: number;
  soloRecentFormBonus: number;
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
  topRankStackPenalty: number;
  sTierStackPenalty: number;
  weightedLineDiff: number;
  frontSideDiff: number;
  midJglDiff: number;
  bottomDiff: number;
  autoLinePenalty: number;
  mainImbalancePenalty: number;
  dataReliabilityPenalty: number;
  stompPenalty: number;
  highTierPriorityPenalty: number;
  remainingMainPriorityPenalty: number;
  balanceCost: number;
  qualityScore: number;
  recommendationScore: number;
  warningMessages: string[];
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

type PlayerSeasonBalanceStat = {
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  mvpCount: number;
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

const PEAK_TIER_WEIGHT = 0.6;
const CURRENT_TIER_WEIGHT = 0.3;
const INHOUSE_SCORE_WEIGHT = 0.1;
const DEFAULT_INHOUSE_SCORE = 50;
const INTERNAL_GAP_BONUS_MAX = 0;

const MAIN_POSITION_MULTIPLIER = 1;
const SUB_POSITION_MULTIPLIER = 1;
const AUTO_POSITION_MULTIPLIER = 1;
const DIAMOND_TWO_PLUS_SCORE = 74;
const MASTER_TIER_SCORE = 82;
const SOLO_RECENT_BONUS_LIMIT = 5;
const POSITION_SKILL_BONUS_LIMIT = 3;
const SOLO_APPLY_POSITION_BONUS_LIMIT = 4;

const LINE_IMPACT_MULTIPLIER: Record<Position, number> = {
  TOP: 1.05,
  JGL: 1.25,
  MID: 1.2,
  ADC: 1.15,
  SUP: 1,
};

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

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getInhouseScore(stat?: PlayerSeasonBalanceStat) {
  if (!stat || stat.totalGames <= 0) return DEFAULT_INHOUSE_SCORE;

  const totalGames = Math.max(0, stat.totalGames);
  const wins = Math.max(0, stat.wins);
  const mvpCount = Math.max(0, stat.mvpCount);

  const winRateScore = clampScore((wins / Math.max(1, totalGames)) * 100);
  const participationScore = clampScore(totalGames * 5);
  const mvpScore = clampScore((mvpCount / Math.max(1, totalGames)) * 500);

  return Number(
    (winRateScore * 0.5 + participationScore * 0.3 + mvpScore * 0.2).toFixed(2),
  );
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
      tierDetail.peakTierScore * PEAK_TIER_WEIGHT +
      tierDetail.currentTierScore * CURRENT_TIER_WEIGHT +
      DEFAULT_INHOUSE_SCORE * INHOUSE_SCORE_WEIGHT
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
    `기준점수는 최고티어 ${scoreBreakdown.peakTierScore.toFixed(1)}점 × 60% + 현재티어 ${scoreBreakdown.currentTierScore.toFixed(1)}점 × 30% + 내전지표 ${scoreBreakdown.inhouseScore.toFixed(1)}점 × 10% = ${scoreBreakdown.adjustedScore.toFixed(1)}점입니다.`,
    `내전지표는 현재 시즌 기준 승률, 참여수, MVP 비중을 0~100점으로 환산해 반영합니다. 데이터가 없으면 중립값 50점을 적용합니다.`,
    `최종 기준점수는 기준점수 ${scoreBreakdown.adjustedScore.toFixed(1)}점입니다. 최고티어 비중이 이미 높기 때문에 별도 S급 가산점은 팀 분산 평가에만 사용합니다.`,
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
    | "inhouseScore"
    | "soloRecentGames"
    | "soloRecentWins"
    | "soloRecentWinRate"
    | "soloRecentKda"
    | "soloRecentMainPosition"
    | "soloRecentSubPosition"
    | "soloRecentPositionConfidence"
    | "soloRecentAvgDamage"
    | "soloRecentAvgVisionScore"
  >[],
  seasonStatByPlayerId = new Map<number, PlayerSeasonBalanceStat>(),
): ResolvedPlayer[] {
  const playersWithTierScore = players.map((player) => {
    const tierDetail = getResolvedTierScoreDetail(
      player.currentTier || "",
      player.peakTier || "",
    );
    const inhouseScore = getInhouseScore(seasonStatByPlayerId.get(player.id));
    const adjustedScore = Number(
      (
        tierDetail.peakTierScore * PEAK_TIER_WEIGHT +
        tierDetail.currentTierScore * CURRENT_TIER_WEIGHT +
        inhouseScore * INHOUSE_SCORE_WEIGHT
      ).toFixed(2),
    );
    const bonus = getSTierBonus(player.peakTier);

    return {
      ...player,
      inhouseScore,
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
      const finalBaseScore = Number(player.adjustedScore.toFixed(2));

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
        soloRecentGames: 0,
        soloRecentWins: 0,
        soloRecentWinRate: null,
        soloRecentKda: null,
        soloRecentMainPosition: null,
        soloRecentSubPosition: null,
        soloRecentPositionConfidence: 0,
        soloRecentAvgDamage: null,
        soloRecentAvgVisionScore: null,
      };
    })
    .sort((a, b) => a.id - b.id);
}

function getRoleType(player: ResolvedPlayer, position: Position): RoleType {
  if (player.mainPositions.includes(position)) return "MAIN";
  if (player.subPositions.includes(position)) return "SUB";
  return "AUTO";
}


function limitRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isMasterPlusPlayer(player: Pick<ResolvedPlayer, "currentTier" | "peakTier">) {
  const current = getTierScoreDetail(player.currentTier || "")?.score ?? 0;
  const peak = getTierScoreDetail(player.peakTier || "")?.score ?? 0;
  return Math.max(current, peak) >= MASTER_TIER_SCORE;
}

function isDiamondTwoPlusPlayer(player: Pick<ResolvedPlayer, "currentTier" | "peakTier">) {
  const current = getTierScoreDetail(player.currentTier || "")?.score ?? 0;
  const peak = getTierScoreDetail(player.peakTier || "")?.score ?? 0;
  return Math.max(current, peak) >= DIAMOND_TWO_PLUS_SCORE;
}

function getRolePenalty(player: ResolvedPlayer, roleType: RoleType) {
  if (roleType === "MAIN") return 0;

  if (isMasterPlusPlayer(player)) {
    return roleType === "SUB" ? 18 : 35;
  }

  if (isDiamondTwoPlusPlayer(player)) {
    return roleType === "SUB" ? 12 : 25;
  }

  return roleType === "SUB" ? 5 : 10;
}

function getSoloRecentFormBonus(player: ResolvedPlayer) {
  if (player.soloRecentGames <= 0) return 0;

  const reliability = Math.min(1, player.soloRecentGames / 20);
  const winRateBonus =
    typeof player.soloRecentWinRate === "number"
      ? limitRange((player.soloRecentWinRate - 50) / 12.5, -2, 2)
      : 0;
  const kdaBonus =
    typeof player.soloRecentKda === "number"
      ? limitRange((player.soloRecentKda - 2.5) / 1.25, -1.5, 1.5)
      : 0;
  const damageBonus =
    typeof player.soloRecentAvgDamage === "number"
      ? limitRange((player.soloRecentAvgDamage - 18000) / 7000, -1, 1)
      : 0;
  const visionBonus =
    typeof player.soloRecentAvgVisionScore === "number"
      ? limitRange((player.soloRecentAvgVisionScore - 20) / 20, -0.5, 0.5)
      : 0;

  return Number(
    limitRange(
      (winRateBonus + kdaBonus + damageBonus + visionBonus) * reliability,
      -SOLO_RECENT_BONUS_LIMIT,
      SOLO_RECENT_BONUS_LIMIT,
    ).toFixed(2),
  );
}

function getInternalPositionBonus(
  player: ResolvedPlayer,
  position: Position,
  internalPositionCountByKey: Map<string, number>,
) {
  const count = internalPositionCountByKey.get(`${player.id}:${position}`) ?? 0;
  if (count >= 10) return 2;
  if (count >= 6) return 1.4;
  if (count >= 3) return 0.8;
  return 0;
}

function getSoloPositionBonus(player: ResolvedPlayer, position: Position) {
  if (!player.soloRecentMainPosition) return 0;
  if (player.soloRecentMainPosition === position) return 2;
  if (player.soloRecentGames >= 10 && player.mainPositions.includes(position)) return 0.5;
  if (player.soloRecentGames >= 10 && !player.subPositions.includes(position)) return -1.5;
  return 0;
}

function getSoloApplyPositionMatchBonus(player: ResolvedPlayer, position: Position) {
  const soloMain = player.soloRecentMainPosition;
  const soloSub = player.soloRecentSubPosition;
  if (!soloMain && !soloSub) return 0;

  let base = 0;
  if (soloMain && player.mainPositions.includes(soloMain)) base = Math.max(base, 3);
  if (soloMain && player.subPositions.includes(soloMain)) base = Math.max(base, 1.5);
  if (soloSub && player.mainPositions.includes(soloSub)) base = Math.max(base, 2);
  if (soloSub && player.subPositions.includes(soloSub)) base = Math.max(base, 1);

  if (base === 0 && player.soloRecentGames >= 10) base = -1.5;

  const assignedLineBoost =
    soloMain === position ? 1 : soloSub === position ? 0.65 : player.mainPositions.includes(position) ? 0.35 : 0.2;
  const reliability = Math.min(1, player.soloRecentGames / 20) * Math.max(0.35, player.soloRecentPositionConfidence || 0.35);
  const weighted = base * LINE_IMPACT_MULTIPLIER[position] * assignedLineBoost * reliability;

  return Number(limitRange(weighted, -2, SOLO_APPLY_POSITION_BONUS_LIMIT).toFixed(2));
}

function getPositionSkillBonus(
  player: ResolvedPlayer,
  position: Position,
  internalPositionCountByKey: Map<string, number>,
) {
  const internalPositionBonus = getInternalPositionBonus(
    player,
    position,
    internalPositionCountByKey,
  );
  const soloPositionBonus = getSoloPositionBonus(player, position);
  const soloApplyPositionMatchBonus = getSoloApplyPositionMatchBonus(player, position);
  const positionSkillBonus = Number(
    limitRange(
      internalPositionBonus + soloPositionBonus + soloApplyPositionMatchBonus,
      -POSITION_SKILL_BONUS_LIMIT,
      POSITION_SKILL_BONUS_LIMIT,
    ).toFixed(2),
  );

  return {
    internalPositionBonus,
    soloPositionBonus,
    soloApplyPositionMatchBonus,
    positionSkillBonus,
  };
}

function getAssignedScore(
  player: ResolvedPlayer,
  position: Position,
  internalPositionCountByKey = new Map<string, number>(),
) {
  const roleType = getRoleType(player, position);
  const multiplier = getRoleMultiplier(roleType);
  const tierDetail = getPositionTierScoreDetail(player, position);
  const rolePenalty = getRolePenalty(player, roleType);
  const soloRecentFormBonus = getSoloRecentFormBonus(player);
  const {
    internalPositionBonus,
    soloPositionBonus,
    soloApplyPositionMatchBonus,
    positionSkillBonus,
  } = getPositionSkillBonus(player, position, internalPositionCountByKey);
  const assignedPositionMmr = getPositionMmrValue(player.positionMmrs, position);
  const mmrBonus = getMmrBonus({
    overallMmr: player.balanceMmr,
    positionMmr: assignedPositionMmr,
    confidence: player.mmrConfidence,
  });
  const rawScore =
    player.finalBaseScore +
    soloRecentFormBonus +
    positionSkillBonus +
    mmrBonus +
    player.balanceOverrideScore -
    rolePenalty;
  const score = Number(Math.max(0, rawScore * multiplier).toFixed(2));
  const roleLoss = Number(rolePenalty.toFixed(2));

  const scoreBreakdown: ScoreBreakdown = {
    currentTierScore: tierDetail.currentTierScore,
    peakTierScore: tierDetail.peakTierScore,
    inhouseScore: player.inhouseScore,
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
    rolePenalty,
    soloRecentFormBonus,
    soloApplyPositionMatchBonus,
    internalPositionBonus,
    soloPositionBonus,
    positionSkillBonus,
    mmrBonus,
    balanceOverrideScore: player.balanceOverrideScore,
    finalScore: score,
  };

  return {
    roleType,
    score,
    currentTierScore: tierDetail.currentTierScore,
    peakTierScore: tierDetail.peakTierScore,
    baseTierScore: tierDetail.baseTierScore,
    internalPositionBonus,
    soloPositionBonus,
    soloApplyPositionMatchBonus,
    positionSkillBonus,
    mmrBonus,
    assignedPositionMmr,
    rolePenalty,
    soloRecentFormBonus,
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

function evaluateTeam(
  team: Team,
  players: ResolvedPlayer[],
  priorityMainPlayerIds = new Set<number>(),
  internalPositionCountByKey = new Map<string, number>(),
): TeamBestResult {
  const permutations = permute(players);
  let best: TeamBestResult | null = null;

  permutations.forEach((orderedPlayers) => {
    let total = 0;
    let mainAssignedCount = 0;
    let subAssignedCount = 0;
    let autoAssignedCount = 0;
    let priorityMainAssignedCount = 0;
    let prioritySubAssignedCount = 0;
    let priorityAutoAssignedCount = 0;

    const assignments: Assignment[] = orderedPlayers.map((player, index) => {
      const position = POSITIONS[index];
      const {
        roleType,
        score,
        currentTierScore,
        peakTierScore,
        baseTierScore,
        internalPositionBonus,
        soloPositionBonus,
        soloApplyPositionMatchBonus,
        positionSkillBonus,
        mmrBonus,
        assignedPositionMmr,
        rolePenalty,
        soloRecentFormBonus,
        scoreBreakdown,
        explanation,
      } = getAssignedScore(player, position, internalPositionCountByKey);

      if (roleType === "MAIN") mainAssignedCount += 1;
      else if (roleType === "SUB") subAssignedCount += 1;
      else autoAssignedCount += 1;

      if (priorityMainPlayerIds.has(player.id)) {
        if (roleType === "MAIN") priorityMainAssignedCount += 1;
        else if (roleType === "SUB") prioritySubAssignedCount += 1;
        else priorityAutoAssignedCount += 1;
      }

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
        inhouseScore: player.inhouseScore,
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
        balanceOverrideScore: player.balanceOverrideScore,
        balanceOverrideReason: player.balanceOverrideReason,
        balanceMmr: player.balanceMmr,
        assignedPositionMmr,
        mmrConfidence: player.mmrConfidence,
        soloRecentGames: player.soloRecentGames,
        soloRecentWins: player.soloRecentWins,
        soloRecentWinRate: player.soloRecentWinRate,
        soloRecentKda: player.soloRecentKda,
        soloRecentMainPosition: player.soloRecentMainPosition,
        soloRecentSubPosition: player.soloRecentSubPosition,
        soloRecentPositionConfidence: player.soloRecentPositionConfidence,
        soloRecentAvgDamage: player.soloRecentAvgDamage,
        soloRecentAvgVisionScore: player.soloRecentAvgVisionScore,
        internalPositionBonus,
        soloPositionBonus,
        soloApplyPositionMatchBonus,
        positionSkillBonus,
        mmrBonus,
        rolePenalty,
        soloRecentFormBonus,
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
      priorityMainAssignedCount * 100000000 +
      prioritySubAssignedCount * 1000000 -
      priorityAutoAssignedCount * 1000000 +
      candidate.mainAssignedCount * 100000 +
      candidate.subAssignedCount * 10000 -
      candidate.autoAssignedCount * 100 -
      candidate.total;

    const bestPriorityMainAssignedCount = best.assignments.filter(
      (assignment) =>
        priorityMainPlayerIds.has(assignment.playerId) &&
        assignment.roleType === "MAIN",
    ).length;
    const bestPrioritySubAssignedCount = best.assignments.filter(
      (assignment) =>
        priorityMainPlayerIds.has(assignment.playerId) &&
        assignment.roleType === "SUB",
    ).length;
    const bestPriorityAutoAssignedCount = best.assignments.filter(
      (assignment) =>
        priorityMainPlayerIds.has(assignment.playerId) &&
        assignment.roleType === "AUTO",
    ).length;

    const bestKey =
      bestPriorityMainAssignedCount * 100000000 +
      bestPrioritySubAssignedCount * 1000000 -
      bestPriorityAutoAssignedCount * 1000000 +
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

function getTopRankStackPenalty(assignments: Assignment[]) {
  const sorted = [...assignments].sort((a, b) => {
    if (b.finalBaseScore !== a.finalBaseScore) return b.finalBaseScore - a.finalBaseScore;
    return a.playerId - b.playerId;
  });

  const topTwo = sorted.slice(0, 2);
  const topThree = sorted.slice(0, 3);
  const topFive = sorted.slice(0, 5);

  const topTwoSameTeam =
    topTwo.length === 2 && topTwo[0].team === topTwo[1].team ? 25 : 0;

  const redTopThree = topThree.filter((assignment) => assignment.team === "RED").length;
  const blueTopThree = topThree.length - redTopThree;

  const redTopFive = topFive.filter((assignment) => assignment.team === "RED").length;
  const blueTopFive = topFive.length - redTopFive;

  return Number(
    (
      topTwoSameTeam +
      Math.abs(redTopThree - blueTopThree) * 8 +
      Math.abs(redTopFive - blueTopFive) * 3
    ).toFixed(2),
  );
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

function isDiamondTwoPlusTier(raw: string) {
  const tierDetail = getTierScoreDetail(raw || "");
  return Boolean(tierDetail && tierDetail.score >= DIAMOND_TWO_PLUS_SCORE);
}

function getHighTierPlayerIds(players: ResolvedPlayer[]) {
  const highTierPlayers = players
    .filter(
      (player) =>
        isDiamondTwoPlusTier(player.currentTier) ||
        isDiamondTwoPlusTier(player.peakTier),
    )
    .sort((a, b) => {
      if (b.finalBaseScore !== a.finalBaseScore) {
        return b.finalBaseScore - a.finalBaseScore;
      }

      return a.id - b.id;
    });

  return new Set(highTierPlayers.map((player) => player.id));
}

function getHighTierPriorityPenalty(
  assignments: Assignment[],
  highTierPlayerIds: Set<number>,
) {
  const highTierAssignments = assignments.filter((assignment) =>
    highTierPlayerIds.has(assignment.playerId),
  );

  const rolePenalty = highTierAssignments.reduce((sum, assignment) => {
    if (assignment.roleType === "MAIN") return sum;
    if (assignment.roleType === "SUB") return sum + 500;
    return sum + 2000;
  }, 0);

  const redHighTierCount = highTierAssignments.filter(
    (assignment) => assignment.team === "RED",
  ).length;
  const blueHighTierCount = highTierAssignments.filter(
    (assignment) => assignment.team === "BLUE",
  ).length;

  const teamSplitPenalty = Math.abs(redHighTierCount - blueHighTierCount) * 18;

  const lineMismatchPenalty = POSITIONS.reduce((sum, position) => {
    const red = getAssignment(assignments, "RED", position);
    const blue = getAssignment(assignments, "BLUE", position);

    if (!red || !blue) return sum;

    const redIsHighTier = highTierPlayerIds.has(red.playerId);
    const blueIsHighTier = highTierPlayerIds.has(blue.playerId);

    if (redIsHighTier === blueIsHighTier) return sum;

    return sum + Math.min(10, getLineDiff(assignments, position) * 0.45);
  }, 0);

  return Number((rolePenalty + teamSplitPenalty + lineMismatchPenalty).toFixed(2));
}

function getRemainingMainPriorityPenalty(
  assignments: Assignment[],
  highTierPlayerIds: Set<number>,
) {
  const penalty = assignments.reduce((sum, assignment) => {
    if (highTierPlayerIds.has(assignment.playerId)) return sum;
    if (assignment.roleType === "MAIN") return sum;
    if (assignment.roleType === "SUB") return sum + 2;
    return sum + 8;
  }, 0);

  return Number(penalty.toFixed(2));
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

  const pairPenalty =
    getLanePairPenalty(assignments, ["JGL", "MID"]) +
    getLanePairPenalty(assignments, ["ADC", "SUP"]);

  return Number(
    (lineGapPenalty + topSidePenalty * 0.5 + midJglPenalty * 0.7 + bottomPenalty * 0.7 + pairPenalty).toFixed(2),
  );
}

function getLanePairPenalty(assignments: Assignment[], positions: Position[]) {
  const redAuto = positions.filter((position) => getAssignment(assignments, "RED", position)?.roleType === "AUTO").length;
  const blueAuto = positions.filter((position) => getAssignment(assignments, "BLUE", position)?.roleType === "AUTO").length;
  const redMain = positions.filter((position) => getAssignment(assignments, "RED", position)?.roleType === "MAIN").length;
  const blueMain = positions.filter((position) => getAssignment(assignments, "BLUE", position)?.roleType === "MAIN").length;

  return Math.abs(redAuto - blueAuto) * 3 + Math.abs(redMain - blueMain) * 1.5;
}

function getQualityScore(candidate: Omit<CandidateSnapshot, "qualityScore" | "recommendationScore" | "warningMessages">) {
  const penalty =
    candidate.diff * 1.2 +
    candidate.maxLineDiff * 1.4 +
    candidate.midJglDiff * 1.1 +
    candidate.bottomDiff * 0.8 +
    candidate.autoAssignedCount * 5 +
    candidate.highTierPriorityPenalty * 0.08 +
    candidate.remainingMainPriorityPenalty * 1.1 +
    candidate.stompPenalty * 1.3;

  return Number(limitRange(100 - penalty, 0, 100).toFixed(1));
}

function getWarningMessages(candidate: Omit<CandidateSnapshot, "qualityScore" | "recommendationScore" | "warningMessages">) {
  const warnings: string[] = [];
  if (candidate.highTierPriorityPenalty > 0) warnings.push("고티어 주포지션 이탈이 있습니다.");
  if (candidate.autoAssignedCount > 0) warnings.push(`AUTO 배정 ${candidate.autoAssignedCount}명`);
  if (candidate.maxLineDiff >= 12) warnings.push(`최대 라인 차이 ${candidate.maxLineDiff.toFixed(1)}점`);
  if (candidate.midJglDiff >= 10) warnings.push(`미드-정글 합산 차이 ${candidate.midJglDiff.toFixed(1)}점`);
  if (candidate.bottomDiff >= 10) warnings.push(`바텀 합산 차이 ${candidate.bottomDiff.toFixed(1)}점`);
  if (candidate.dataReliabilityPenalty >= 5) warnings.push("일부 플레이어의 데이터 신뢰도가 낮습니다.");
  return warnings;
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
  highTierPriorityPenalty: number;
  remainingMainPriorityPenalty: number;
  topRankStackPenalty: number;
}) {
  return Number(
    (
      params.highTierPriorityPenalty * 10 +
      params.remainingMainPriorityPenalty * 2.0 +
      params.diff * 1.2 +
      params.weightedLineDiff * 0.7 +
      params.maxLineDiff * 1.0 +
      params.midJglDiff * 0.45 +
      params.bottomDiff * 0.45 +
      params.autoLinePenalty * 1.0 +
      params.mainImbalancePenalty * 0.6 +
      params.topRankStackPenalty * 0.35 +
      params.sTierStackPenalty * 0.35 +
      params.dataReliabilityPenalty * 0.4 +
      params.stompPenalty * 0.45
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
      candidate.highTierPriorityPenalty * 12 +
      candidate.remainingMainPriorityPenalty * 2.4 +
      candidate.diff * 1.5 +
      candidate.weightedLineDiff * 0.25 +
      candidate.maxLineDiff * 0.5 +
      candidate.midJglDiff * 0.2 +
      candidate.bottomDiff * 0.2 +
      candidate.autoLinePenalty * 0.8 +
      candidate.mainImbalancePenalty * 0.4 +
      candidate.topRankStackPenalty * 0.4 +
      candidate.sTierStackPenalty * 0.35 +
      candidate.dataReliabilityPenalty * 0.3 +
      candidate.stompPenalty * 0.3
    ).toFixed(2),
  );
}

function getLineBalancePlanCost(candidate: CandidateSnapshot) {
  return Number(
    (
      candidate.highTierPriorityPenalty * 12 +
      candidate.remainingMainPriorityPenalty * 2.4 +
      candidate.weightedLineDiff * 1.35 +
      candidate.maxLineDiff * 1.25 +
      candidate.midJglDiff * 1.25 +
      candidate.frontSideDiff * 0.75 +
      candidate.bottomDiff * 0.7 +
      candidate.lineDiffTotal * 0.45 +
      candidate.diff * 0.75 +
      candidate.autoLinePenalty * 0.8 +
      candidate.mainImbalancePenalty * 0.5 +
      candidate.topRankStackPenalty * 0.55 +
      candidate.sTierStackPenalty * 0.45 +
      candidate.dataReliabilityPenalty * 0.25 +
      candidate.stompPenalty * 0.45
    ).toFixed(2),
  );
}

function getPositionSatisfactionPlanCost(candidate: CandidateSnapshot) {
  return Number(
    (
      candidate.highTierPriorityPenalty * 14 +
      candidate.remainingMainPriorityPenalty * 3.0 +
      candidate.autoAssignedCount * 5 +
      candidate.autoLinePenalty * 1.5 +
      candidate.subAssignedCount * 1.5 -
      candidate.mainAssignedCount * 2 +
      candidate.mainImbalancePenalty * 0.8 +
      candidate.diff * 0.5 +
      candidate.maxLineDiff * 0.4 +
      candidate.bottomDiff * 0.2 +
      candidate.midJglDiff * 0.2 +
      candidate.topRankStackPenalty * 0.35 +
      candidate.sTierStackPenalty * 0.35 +
      candidate.dataReliabilityPenalty * 0.3 +
      candidate.stompPenalty * 0.3
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
      if (a.highTierPriorityPenalty !== b.highTierPriorityPenalty) {
        return a.highTierPriorityPenalty - b.highTierPriorityPenalty;
      }
      if (a.weightedLineDiff !== b.weightedLineDiff) {
        return a.weightedLineDiff - b.weightedLineDiff;
      }
      if (a.midJglDiff !== b.midJglDiff) return a.midJglDiff - b.midJglDiff;
      if (a.maxLineDiff !== b.maxLineDiff) return a.maxLineDiff - b.maxLineDiff;
      if (a.frontSideDiff !== b.frontSideDiff) return a.frontSideDiff - b.frontSideDiff;
      if (a.bottomDiff !== b.bottomDiff) return a.bottomDiff - b.bottomDiff;
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
        balanceOverrideScore: true,
        balanceOverrideReason: true,
        balanceProfile: true,
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
        balanceOverrideScore: player.balanceOverrideScore ?? 0,
        balanceOverrideReason: player.balanceOverrideReason ?? null,
        balanceMmr: player.balanceProfile?.overallMmr ?? 50,
        positionMmrs: {
          TOP: player.balanceProfile?.topMmr ?? 50,
          JGL: player.balanceProfile?.jungleMmr ?? 50,
          MID: player.balanceProfile?.midMmr ?? 50,
          ADC: player.balanceProfile?.adcMmr ?? 50,
          SUP: player.balanceProfile?.supportMmr ?? 50,
        },
        mmrConfidence: player.balanceProfile?.confidence ?? 0,
        mainPosition: input.mainPosition,
        mainPositions: input.mainPositions,
        subPositions: input.subPositions,
      };
    });

    const playerIds = baseResolvedPlayers.map((player) => player.id);

    const soloSyncResults = body.syncSoloRank
      ? await Promise.all(
          playerIds.map((playerId) =>
            syncPlayerSoloRankBestEffort(playerId, { cooldownMinutes: 10 }),
          ),
        )
      : [];

    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    const [recentSoloMatches, internalParticipants, playerSeasonStats] =
      await Promise.all([
        prisma.playerSoloMatch.findMany({
          where: {
            playerId: {
              in: playerIds,
            },
          },
          orderBy: {
            gameCreation: "desc",
          },
          take: playerIds.length * 20,
          select: {
            playerId: true,
            position: true,
            kills: true,
            deaths: true,
            assists: true,
            win: true,
            totalDamageDealtToChampions: true,
            visionScore: true,
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
        activeSeason
          ? prisma.playerSeasonStat.findMany({
              where: {
                seasonId: activeSeason.id,
                playerId: {
                  in: playerIds,
                },
              },
              select: {
                playerId: true,
                totalGames: true,
                participationCount: true,
                wins: true,
                losses: true,
                mvpCount: true,
              },
            })
          : Promise.resolve([]),
      ]);

    const recentCountByPlayerId = new Map<number, number>();
    const recentStatsByPlayerId = new Map<
      number,
      {
        games: number;
        wins: number;
        kills: number;
        deaths: number;
        assists: number;
        damage: number;
        vision: number;
        positionCounts: Map<Position, number>;
      }
    >();

    recentSoloMatches.forEach((match) => {
      const current = recentCountByPlayerId.get(match.playerId) ?? 0;
      if (current >= 20) return;

      recentCountByPlayerId.set(match.playerId, current + 1);
      const stat =
        recentStatsByPlayerId.get(match.playerId) ??
        {
          games: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          vision: 0,
          positionCounts: new Map<Position, number>(),
        };

      stat.games += 1;
      stat.wins += match.win ? 1 : 0;
      stat.kills += match.kills;
      stat.deaths += match.deaths;
      stat.assists += match.assists;
      stat.damage += match.totalDamageDealtToChampions;
      stat.vision += match.visionScore;

      if (isValidPosition(match.position)) {
        stat.positionCounts.set(
          match.position,
          (stat.positionCounts.get(match.position) ?? 0) + 1,
        );
      }

      recentStatsByPlayerId.set(match.playerId, stat);
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

    const seasonStatByPlayerId = new Map<number, PlayerSeasonBalanceStat>(
      playerSeasonStats.map((stat) => [
        stat.playerId,
        {
          totalGames: stat.totalGames,
          participationCount: stat.participationCount,
          wins: stat.wins,
          losses: stat.losses,
          mvpCount: stat.mvpCount,
        },
      ]),
    );

    const resolvedPlayers = applyInternalRankScores(
      baseResolvedPlayers,
      seasonStatByPlayerId,
    ).map((player) => {
      const recent = recentStatsByPlayerId.get(player.id);
      const soloRecentGames = recent?.games ?? 0;
      const soloRecentWins = recent?.wins ?? 0;
      const sortedSoloPositions = recent
        ? [...recent.positionCounts.entries()].sort((a, b) => b[1] - a[1])
        : [];
      const soloRecentMainPosition =
        sortedSoloPositions[0] && sortedSoloPositions[0][1] >= 5
          ? sortedSoloPositions[0][0]
          : null;
      const soloRecentSubPosition =
        sortedSoloPositions[1] && sortedSoloPositions[1][1] >= 3
          ? sortedSoloPositions[1][0]
          : null;
      const soloRecentPositionConfidence =
        soloRecentGames > 0 && sortedSoloPositions[0]
          ? Number((sortedSoloPositions[0][1] / soloRecentGames).toFixed(2))
          : 0;
      const soloRecentKda = recent
        ? Number(((recent.kills + recent.assists) / Math.max(1, recent.deaths)).toFixed(2))
        : null;

      return {
        ...player,
        soloRecentGames,
        soloRecentWins,
        soloRecentWinRate: soloRecentGames > 0 ? Number(((soloRecentWins / soloRecentGames) * 100).toFixed(1)) : null,
        soloRecentKda,
        soloRecentMainPosition,
        soloRecentSubPosition,
        soloRecentPositionConfidence,
        soloRecentAvgDamage: recent && soloRecentGames > 0 ? Number((recent.damage / soloRecentGames).toFixed(0)) : null,
        soloRecentAvgVisionScore: recent && soloRecentGames > 0 ? Number((recent.vision / soloRecentGames).toFixed(1)) : null,
      };
    });
    const highTierPlayerIds = getHighTierPlayerIds(resolvedPlayers);

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

      const redResult = evaluateTeam(
        "RED",
        redPlayers,
        highTierPlayerIds,
        internalPositionCountByKey,
      );
      const blueResult = evaluateTeam(
        "BLUE",
        bluePlayers,
        highTierPlayerIds,
        internalPositionCountByKey,
      );

      const assignments = [...redResult.assignments, ...blueResult.assignments];

      const diff = Number(
        Math.abs(redResult.total - blueResult.total).toFixed(2),
      );

      const lineDiffTotal = getLineDiffTotal(assignments);
      const maxLineDiff = getMaxLineDiff(assignments);
      const topPlayerDiff = getTopPlayerDiff(assignments);
      const topRankStackPenalty = getTopRankStackPenalty(assignments);
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
      const highTierPriorityPenalty = getHighTierPriorityPenalty(
        assignments,
        highTierPlayerIds,
      );
      const remainingMainPriorityPenalty = getRemainingMainPriorityPenalty(
        assignments,
        highTierPlayerIds,
      );

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
        highTierPriorityPenalty,
        remainingMainPriorityPenalty,
        topRankStackPenalty,
      });

      const candidateBase = {
        redTotal: redResult.total,
        blueTotal: blueResult.total,
        diff,
        totalScore: Number((redResult.total + blueResult.total).toFixed(2)),
        lineDiffTotal,
        maxLineDiff,
        topPlayerDiff,
        topRankStackPenalty,
        sTierStackPenalty,
        weightedLineDiff,
        frontSideDiff,
        midJglDiff,
        bottomDiff,
        autoLinePenalty,
        mainImbalancePenalty,
        dataReliabilityPenalty,
        stompPenalty,
        highTierPriorityPenalty,
        remainingMainPriorityPenalty,
        balanceCost,
        mainAssignedCount,
        subAssignedCount,
        autoAssignedCount,
        assignments,
      };

      const qualityScore = getQualityScore(candidateBase);
      const warningMessages = getWarningMessages(candidateBase);
      const candidate: CandidateSnapshot = {
        ...candidateBase,
        qualityScore,
        recommendationScore: Number((qualityScore - balanceCost * 0.08).toFixed(2)),
        warningMessages,
      };

      candidates.push(candidate);
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { message: "팀 밸런스 계산 결과를 만들 수 없습니다." },
        { status: 500 },
      );
    }

    const minimumHighTierPriorityPenalty = Math.min(
      ...candidates.map((candidate) => candidate.highTierPriorityPenalty),
    );
    const planCandidatePool = candidates.filter(
      (candidate) =>
        candidate.highTierPriorityPenalty === minimumHighTierPriorityPenalty,
    );

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
        optionTitle: "총합 균형형",
        optionDescription: "고티어 주포지션을 우선 고정한 뒤 RED / BLUE 전체 점수 차이를 가장 우선한 조합입니다.",
      },
      {
        kind: "LINE_BALANCE",
        optionNo: 2,
        optionTitle: "라인 균형형",
        optionDescription:
          "고티어 주포지션을 우선 고정한 뒤 JGL/MID/ADC, 상체, 바텀의 라인 차이를 줄인 조합입니다.",
      },
      {
        kind: "POSITION_SATISFACTION",
        optionNo: 3,
        optionTitle: "포지션 만족형",
        optionDescription: "주포지션 배정을 최대화하면서 팀 점수 차이도 함께 고려한 조합입니다.",
      },
    ];

    const selectedPlans = planDefinitions.map((plan) => {
      const sorted = [...planCandidatePool].sort(compareByPlan(plan.kind));
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

    const bestCandidate = selectedPlans[0]?.candidate ?? planCandidatePool.sort(compareByPlan("TEAM_TOTAL"))[0];

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
        qualityScore: candidate.qualityScore,
        recommendationScore: candidate.recommendationScore,
        warningMessages: candidate.warningMessages,
        lineDiffTotal: candidate.lineDiffTotal,
        maxLineDiff: candidate.maxLineDiff,
        topPlayerDiff: candidate.topPlayerDiff,
        topRankStackPenalty: candidate.topRankStackPenalty,
        sTierStackPenalty: candidate.sTierStackPenalty,
        weightedLineDiff: candidate.weightedLineDiff,
        frontSideDiff: candidate.frontSideDiff,
        midJglDiff: candidate.midJglDiff,
        bottomDiff: candidate.bottomDiff,
        autoLinePenalty: candidate.autoLinePenalty,
        mainImbalancePenalty: candidate.mainImbalancePenalty,
        dataReliabilityPenalty: candidate.dataReliabilityPenalty,
        stompPenalty: candidate.stompPenalty,
        highTierPriorityPenalty: candidate.highTierPriorityPenalty,
        remainingMainPriorityPenalty: candidate.remainingMainPriorityPenalty,
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

    const recommendedAlternative = alternatives
      .map((option) => ({
        optionNo: option.optionNo,
        optionTitle: option.optionTitle,
        qualityScore: option.qualityScore ?? 0,
        recommendationScore: option.recommendationScore ?? 0,
        reason: option.warningMessages?.length
          ? `주의: ${option.warningMessages.join(", ")}`
          : "고티어 주포지션, 총점, 라인 차이, AUTO 수 기준에서 가장 안정적입니다.",
      }))
      .sort((a, b) => b.recommendationScore - a.recommendationScore)[0] ?? null;

    return NextResponse.json({
      ...toResponsePayload(bestCandidate),
      soloSync: body.syncSoloRank
        ? {
            requested: soloSyncResults.length,
            synced: soloSyncResults.filter((item) => item.status === "synced").length,
            skipped: soloSyncResults.filter((item) => item.status === "skipped").length,
            failed: soloSyncResults.filter((item) => item.status === "failed").length,
            results: soloSyncResults,
          }
        : null,
      recommendedAlternative,
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
