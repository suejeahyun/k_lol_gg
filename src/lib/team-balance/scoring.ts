import type { Position } from "@prisma/client";

export type TeamBalanceRoleType = "MAIN" | "SUB" | "AUTO";

export type TeamBalanceTierScoreDetail = {
  label: string;
  score: number;
  source: "tier" | "fallback";
};

export type TeamBalanceSeasonStatLike = {
  totalGames: number;
  participationCount?: number | null;
  wins: number;
  losses?: number | null;
  mvpCount: number;
};

export const TEAM_BALANCE_POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

export const TEAM_BALANCE_TIER_WEIGHTS = {
  peak: 0.6,
  current: 0.3,
  inhouse: 0.1,
} as const;

const DEFAULT_INHOUSE_SCORE = 50;
const MASTER_TIER_SCORE = 82;
const DIAMOND_TWO_PLUS_SCORE = 74;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function normalizeTierText(raw: string) {
  return raw.trim().replace(/\s+/g, "").toLowerCase();
}

function extractLp(raw: string): number | null {
  const compact = normalizeTierText(raw);
  const lpMatch = compact.match(/(\d+)\s*(p|lp|점)/i);
  return lpMatch ? Number(lpMatch[1]) : null;
}

function extractFloor(raw: string): number | null {
  const compact = normalizeTierText(raw);
  const floorMatch = compact.match(/([1-9]|10)층/);
  return floorMatch ? Number(floorMatch[1]) : null;
}

export function extractTeamBalanceTierDivision(raw: string): number | null {
  const compact = normalizeTierText(raw);

  const patterns = [
    /(?:다이아몬드|다이아|다)([1-4])$/,
    /(?:에메랄드|에메|에)([1-4])$/,
    /(?:플래티넘|플레티넘|플레|플|p)([1-4])$/,
    /(?:골드|골|g)([1-4])$/,
    /(?:실버|실|s)([1-4])$/,
    /(?:브론즈|브|b)([1-4])$/,
    /(?:아이언|아|i)([1-4])$/,
    /(?:diamond|emerald|platinum|gold|silver|bronze|iron)([1-4])$/,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (match) return Number(match[1]);
  }

  const roman = compact.match(/(?:diamond|emerald|platinum|gold|silver|bronze|iron)(i{1,3}|iv)$/i);
  if (roman) {
    const value = roman[1].toLowerCase();
    if (value === "i") return 1;
    if (value === "ii") return 2;
    if (value === "iii") return 3;
    if (value === "iv") return 4;
  }

  return null;
}

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

function matchesTier(compact: string, aliases: string[]) {
  return aliases.some((alias) => compact === alias || compact.startsWith(alias));
}

export function getTeamBalanceTierScoreDetail(raw: string): TeamBalanceTierScoreDetail | null {
  const value = raw.trim();
  const compact = normalizeTierText(value);
  if (!compact) return null;

  const division = extractTeamBalanceTierDivision(value);
  const floor = extractFloor(value);

  if (matchesTier(compact, ["challenger", "챌린저", "챌", "ch", "c"])) {
    return { label: value, score: 118 + getLpBonus(value, 200, 7), source: "tier" };
  }

  if (matchesTier(compact, ["grandmaster", "그랜드마스터", "그마", "gm"])) {
    return { label: value, score: 112 + getLpBonus(value, 200, 4), source: "tier" };
  }

  if (matchesTier(compact, ["master", "마스터", "마", "m"])) {
    const parsedFloor =
      floor ??
      (() => {
        const lp = extractLp(value);
        if (lp === null) return 1;
        return Math.max(1, Math.min(10, Math.floor(lp / 100) + 1));
      })();
    const safeFloor = Math.max(1, Math.min(10, parsedFloor));
    return { label: value, score: 82 + (safeFloor - 1) * 3, source: "tier" };
  }

  if (matchesTier(compact, ["diamond", "다이아몬드", "다이아", "다", "d"])) {
    return { label: value, score: 70 + getDivisionBonus(division), source: "tier" };
  }

  if (matchesTier(compact, ["emerald", "에메랄드", "에메", "에", "e"])) {
    return { label: value, score: 60 + getDivisionBonus(division), source: "tier" };
  }

  if (matchesTier(compact, ["platinum", "플래티넘", "플레티넘", "플레", "플", "p"])) {
    return { label: value, score: 50 + getDivisionBonus(division), source: "tier" };
  }

  if (matchesTier(compact, ["gold", "골드", "골", "g"])) {
    return { label: value, score: 40 + getDivisionBonus(division), source: "tier" };
  }

  if (matchesTier(compact, ["silver", "실버", "실", "s"])) {
    return { label: value, score: 30 + getDivisionBonus(division), source: "tier" };
  }

  if (matchesTier(compact, ["bronze", "브론즈", "브", "b"])) {
    return { label: value, score: 20 + getDivisionBonus(division), source: "tier" };
  }

  if (matchesTier(compact, ["iron", "아이언", "아", "i"])) {
    return { label: value, score: 10 + getDivisionBonus(division), source: "tier" };
  }

  return null;
}

export function getResolvedTeamBalanceTierScore(currentTier: string, peakTier: string) {
  const current = getTeamBalanceTierScoreDetail(currentTier || "");
  const peak = getTeamBalanceTierScoreDetail(peakTier || "");

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
      currentTierScore: round(peak.score * 0.8),
      peakTierScore: peak.score,
      currentTierNote: "현재티어 없음: 최고티어 점수의 80%를 현재티어 대체값으로 반영",
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

export function getTeamBalanceInhouseScore(stat?: TeamBalanceSeasonStatLike | null) {
  if (!stat || stat.totalGames <= 0) return DEFAULT_INHOUSE_SCORE;

  const totalGames = Math.max(0, stat.totalGames);
  const wins = Math.max(0, stat.wins);
  const mvpCount = Math.max(0, stat.mvpCount);
  const winRateScore = clamp((wins / Math.max(1, totalGames)) * 100, 0, 100);
  const participationScore = clamp(totalGames * 5, 0, 100);
  const mvpScore = clamp((mvpCount / Math.max(1, totalGames)) * 500, 0, 100);

  return round(winRateScore * 0.5 + participationScore * 0.3 + mvpScore * 0.2);
}

export function getTeamBalanceBaseScore(params: {
  currentTier?: string | null;
  peakTier?: string | null;
  inhouseScore?: number | null;
}) {
  const tier = getResolvedTeamBalanceTierScore(params.currentTier || "", params.peakTier || "");
  const inhouseScore = typeof params.inhouseScore === "number" ? params.inhouseScore : DEFAULT_INHOUSE_SCORE;
  const adjustedScore = round(
    tier.peakTierScore * TEAM_BALANCE_TIER_WEIGHTS.peak +
      tier.currentTierScore * TEAM_BALANCE_TIER_WEIGHTS.current +
      inhouseScore * TEAM_BALANCE_TIER_WEIGHTS.inhouse,
  );

  return {
    ...tier,
    inhouseScore,
    adjustedScore,
    finalBaseScore: adjustedScore,
  };
}

export function getTeamBalanceRoleType(params: {
  position: Position;
  mainPositions?: Position[] | null;
  subPositions?: Position[] | null;
}): TeamBalanceRoleType {
  if (params.mainPositions?.includes(params.position)) return "MAIN";
  if (params.subPositions?.includes(params.position)) return "SUB";
  return "AUTO";
}

export function isTeamBalanceMasterPlus(currentTier?: string | null, peakTier?: string | null) {
  const current = getTeamBalanceTierScoreDetail(currentTier || "")?.score ?? 0;
  const peak = getTeamBalanceTierScoreDetail(peakTier || "")?.score ?? 0;
  return Math.max(current, peak) >= MASTER_TIER_SCORE;
}

export function isTeamBalanceDiamondTwoPlus(currentTier?: string | null, peakTier?: string | null) {
  const current = getTeamBalanceTierScoreDetail(currentTier || "")?.score ?? 0;
  const peak = getTeamBalanceTierScoreDetail(peakTier || "")?.score ?? 0;
  return Math.max(current, peak) >= DIAMOND_TWO_PLUS_SCORE;
}

export function getTeamBalanceRolePenalty(params: {
  roleType: TeamBalanceRoleType;
  currentTier?: string | null;
  peakTier?: string | null;
}) {
  if (params.roleType === "MAIN") return 0;

  if (isTeamBalanceMasterPlus(params.currentTier, params.peakTier)) {
    return params.roleType === "SUB" ? 18 : 35;
  }

  if (isTeamBalanceDiamondTwoPlus(params.currentTier, params.peakTier)) {
    return params.roleType === "SUB" ? 12 : 25;
  }

  return params.roleType === "SUB" ? 5 : 10;
}
