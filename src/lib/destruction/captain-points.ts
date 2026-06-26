export type DestructionCaptainLane = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type TierKey =
  | "MASTER_1800_PLUS"
  | "MASTER_1700_1799"
  | "MASTER_1600_1699"
  | "MASTER_1500_1599"
  | "MASTER_1400_1499"
  | "MASTER_1300_1399"
  | "MASTER_1200_1299"
  | "MASTER_1100_1199"
  | "MASTER_1000_1099"
  | "MASTER_900_999"
  | "MASTER_800_899"
  | "MASTER_700_799"
  | "MASTER_600_699"
  | "MASTER_500_599"
  | "MASTER_400_499"
  | "MASTER_300_399"
  | "MASTER_200_299"
  | "MASTER_100_199"
  | "MASTER_0_99"
  | "DIAMOND_1"
  | "DIAMOND_2"
  | "DIAMOND_3"
  | "DIAMOND_4"
  | "EMERALD_1"
  | "EMERALD_2"
  | "EMERALD_3"
  | "EMERALD_4"
  | "PLATINUM_1"
  | "PLATINUM_2"
  | "PLATINUM_3"
  | "PLATINUM_4"
  | "GOLD_1"
  | "GOLD_2"
  | "GOLD_3"
  | "GOLD_4"
  | "SILVER_1"
  | "SILVER_2"
  | "SILVER_3_BELOW";

type PointRow = Record<DestructionCaptainLane, number>;

export type DestructionCaptainPointInput = {
  participantId: number;
  currentTier?: string | null;
  peakTier?: string | null;
  lane?: string | null;
};

export type DestructionCaptainPointDetail = DestructionCaptainPointInput & {
  laneKey: DestructionCaptainLane;
  tierKey: TierKey;
  powerValue: number;
  auctionPoint: number;
  tierLabel: string;
};

const BASE_LOWEST_TIER_POINT = 2000;
const MIN_HIGHEST_TIER_POINT = 0;

const POINT_TABLE: Record<TierKey, PointRow> = {
  MASTER_1800_PLUS: { TOP: 60, JGL: 68, MID: 60.9, ADC: 62.7, SUP: 58.2 },
  MASTER_1700_1799: { TOP: 59.6, JGL: 67.3, MID: 60.4, ADC: 62.2, SUP: 57.8 },
  MASTER_1600_1699: { TOP: 59.2, JGL: 66.8, MID: 60.1, ADC: 61.7, SUP: 57.4 },
  MASTER_1500_1599: { TOP: 58.8, JGL: 66.2, MID: 59.7, ADC: 61.2, SUP: 57 },
  MASTER_1400_1499: { TOP: 57.6, JGL: 64.9, MID: 59.3, ADC: 61.4, SUP: 55.7 },
  MASTER_1300_1399: { TOP: 57, JGL: 64.3, MID: 58.5, ADC: 60.7, SUP: 55.1 },
  MASTER_1200_1299: { TOP: 56.4, JGL: 63.8, MID: 57.8, ADC: 60, SUP: 54.5 },
  MASTER_1100_1199: { TOP: 55.7, JGL: 63.2, MID: 56.5, ADC: 59.3, SUP: 53.9 },
  MASTER_1000_1099: { TOP: 55.1, JGL: 57.9, MID: 55.4, ADC: 58.4, SUP: 53.3 },
  MASTER_900_999: { TOP: 54.6, JGL: 57.4, MID: 54.5, ADC: 57.8, SUP: 52.7 },
  MASTER_800_899: { TOP: 49.9, JGL: 54.9, MID: 53.8, ADC: 52.2, SUP: 49.5 },
  MASTER_700_799: { TOP: 49.4, JGL: 54.3, MID: 50.4, ADC: 52.2, SUP: 47.9 },
  MASTER_600_699: { TOP: 47.2, JGL: 52.6, MID: 47.9, ADC: 48.8, SUP: 45.5 },
  MASTER_500_599: { TOP: 45.7, JGL: 50.8, MID: 46.1, ADC: 47.2, SUP: 43.7 },
  MASTER_400_499: { TOP: 44.5, JGL: 48.4, MID: 46.1, ADC: 42.1, SUP: 41.5 },
  MASTER_300_399: { TOP: 42.8, JGL: 44.1, MID: 44.8, ADC: 39.5, SUP: 39.7 },
  MASTER_200_299: { TOP: 40.8, JGL: 42.1, MID: 43, ADC: 37.4, SUP: 38.3 },
  MASTER_100_199: { TOP: 40.1, JGL: 41.7, MID: 40.5, ADC: 35.9, SUP: 37.2 },
  MASTER_0_99: { TOP: 37.7, JGL: 39.7, MID: 40.6, ADC: 34.5, SUP: 36.1 },
  DIAMOND_1: { TOP: 36.2, JGL: 38.2, MID: 39.5, ADC: 33.2, SUP: 35.4 },
  DIAMOND_2: { TOP: 34.7, JGL: 36.1, MID: 37.1, ADC: 31.2, SUP: 34.5 },
  DIAMOND_3: { TOP: 32.1, JGL: 33.7, MID: 35.5, ADC: 28.9, SUP: 32.9 },
  DIAMOND_4: { TOP: 30.4, JGL: 31.8, MID: 33.9, ADC: 26.9, SUP: 31.7 },
  EMERALD_1: { TOP: 29, JGL: 30.4, MID: 29.8, ADC: 25.1, SUP: 30.3 },
  EMERALD_2: { TOP: 27.2, JGL: 28.9, MID: 28.1, ADC: 23.8, SUP: 29 },
  EMERALD_3: { TOP: 25.8, JGL: 27.2, MID: 27.2, ADC: 22.3, SUP: 27.9 },
  EMERALD_4: { TOP: 24.7, JGL: 25.6, MID: 25.6, ADC: 21.1, SUP: 26.7 },
  PLATINUM_1: { TOP: 23.1, JGL: 23.7, MID: 23.9, ADC: 19.8, SUP: 25.6 },
  PLATINUM_2: { TOP: 22.1, JGL: 21.9, MID: 20.8, ADC: 18.3, SUP: 24.5 },
  PLATINUM_3: { TOP: 21.5, JGL: 19.8, MID: 19.3, ADC: 17.2, SUP: 23.4 },
  PLATINUM_4: { TOP: 20.7, JGL: 18.5, MID: 17.9, ADC: 16.1, SUP: 22.3 },
  GOLD_1: { TOP: 19.6, JGL: 17.1, MID: 16.3, ADC: 14.9, SUP: 21.2 },
  GOLD_2: { TOP: 18, JGL: 15, MID: 14.5, ADC: 13.7, SUP: 19.8 },
  GOLD_3: { TOP: 17.2, JGL: 14, MID: 12.7, ADC: 12.5, SUP: 18.9 },
  GOLD_4: { TOP: 16.4, JGL: 12.8, MID: 12.5, ADC: 11.8, SUP: 18 },
  SILVER_1: { TOP: 15.6, JGL: 12, MID: 11.9, ADC: 10.6, SUP: 17 },
  SILVER_2: { TOP: 14.8, JGL: 11, MID: 10.8, ADC: 10, SUP: 16 },
  SILVER_3_BELOW: { TOP: 14, JGL: 10, MID: 10, ADC: 10, SUP: 15 },
};

const TIER_LABELS: Record<TierKey, string> = {
  MASTER_1800_PLUS: "마/고/챌 1800 이상",
  MASTER_1700_1799: "마/고/챌 1700~1799",
  MASTER_1600_1699: "마/고/챌 1600~1699",
  MASTER_1500_1599: "마/고/챌 1500~1599",
  MASTER_1400_1499: "마/고/챌 1400~1499",
  MASTER_1300_1399: "마/고/챌 1300~1399",
  MASTER_1200_1299: "마/고/챌 1200~1299",
  MASTER_1100_1199: "마/고/챌 1100~1199",
  MASTER_1000_1099: "마/고/챌 1000~1099",
  MASTER_900_999: "마/고/챌 900~999",
  MASTER_800_899: "마/고/챌 800~899",
  MASTER_700_799: "마/고/챌 700~799",
  MASTER_600_699: "마/고/챌 600~699",
  MASTER_500_599: "마/고/챌 500~599",
  MASTER_400_499: "마/고/챌 400~499",
  MASTER_300_399: "마/고/챌 300~399",
  MASTER_200_299: "마/고/챌 200~299",
  MASTER_100_199: "마/고/챌 100~199",
  MASTER_0_99: "마/고/챌 0~99",
  DIAMOND_1: "다이아1",
  DIAMOND_2: "다이아2",
  DIAMOND_3: "다이아3",
  DIAMOND_4: "다이아4",
  EMERALD_1: "에메랄드1",
  EMERALD_2: "에메랄드2",
  EMERALD_3: "에메랄드3",
  EMERALD_4: "에메랄드4",
  PLATINUM_1: "플래티넘1",
  PLATINUM_2: "플래티넘2",
  PLATINUM_3: "플래티넘3",
  PLATINUM_4: "플래티넘4",
  GOLD_1: "골드1",
  GOLD_2: "골드2",
  GOLD_3: "골드3",
  GOLD_4: "골드4",
  SILVER_1: "실버1",
  SILVER_2: "실버2",
  SILVER_3_BELOW: "실버3 이하",
};

function compact(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function extractDivision(
  value: string,
  fallback: 1 | 2 | 3 | 4,
): 1 | 2 | 3 | 4 {
  if (/[1ⅠI]$/.test(value)) return 1;
  if (/[2Ⅱ]$/.test(value) || /II$/.test(value)) return 2;
  if (/[3Ⅲ]$/.test(value) || /III$/.test(value)) return 3;
  if (/[4Ⅳ]$/.test(value) || /IV$/.test(value)) return 4;

  const match = value.match(/[1-4]/);
  const division = Number(match?.[0]);
  return division === 1 || division === 2 || division === 3 || division === 4
    ? division
    : fallback;
}

function includesAny(value: string, aliases: string[]) {
  return aliases.some((alias) => value.includes(alias));
}

function resolveMasterTierKey(value: string): TierKey {
  const lpMatches = Array.from(value.matchAll(/\d{1,4}/g));
  const lp =
    lpMatches.length > 0 ? Number(lpMatches[lpMatches.length - 1][0]) : 0;

  if (lp >= 1800) return "MASTER_1800_PLUS";
  if (lp >= 1700) return "MASTER_1700_1799";
  if (lp >= 1600) return "MASTER_1600_1699";
  if (lp >= 1500) return "MASTER_1500_1599";
  if (lp >= 1400) return "MASTER_1400_1499";
  if (lp >= 1300) return "MASTER_1300_1399";
  if (lp >= 1200) return "MASTER_1200_1299";
  if (lp >= 1100) return "MASTER_1100_1199";
  if (lp >= 1000) return "MASTER_1000_1099";
  if (lp >= 900) return "MASTER_900_999";
  if (lp >= 800) return "MASTER_800_899";
  if (lp >= 700) return "MASTER_700_799";
  if (lp >= 600) return "MASTER_600_699";
  if (lp >= 500) return "MASTER_500_599";
  if (lp >= 400) return "MASTER_400_499";
  if (lp >= 300) return "MASTER_300_399";
  if (lp >= 200) return "MASTER_200_299";
  if (lp >= 100) return "MASTER_100_199";
  return "MASTER_0_99";
}

export function resolveDestructionCaptainLane(
  lane?: string | null,
): DestructionCaptainLane {
  const value = compact(lane);
  if (
    value === "JUNGLE" ||
    value === "JG" ||
    value === "JGL" ||
    value === "정글"
  )
    return "JGL";
  if (value === "SUPPORT" || value === "SUP" || value === "서포터")
    return "SUP";
  if (value === "BOTTOM" || value === "BOT" || value === "원딜") return "ADC";
  if (value === "MID" || value === "MIDDLE" || value === "미드") return "MID";
  if (value === "TOP" || value === "탑") return "TOP";
  return "TOP";
}

export function resolveDestructionCaptainTierKey(
  currentTier?: string | null,
  peakTier?: string | null,
): TierKey {
  const value = compact(currentTier) || compact(peakTier);

  if (!value) return "SILVER_3_BELOW";

  if (
    includesAny(value, [
      "CHALLENGER",
      "GRANDMASTER",
      "MASTER",
      "챌린저",
      "그랜드마스터",
      "마스터",
      "챌",
      "그마",
    ]) ||
    value === "C" ||
    value === "CH" ||
    value === "GM" ||
    value === "M"
  ) {
    return resolveMasterTierKey(value);
  }

  if (
    includesAny(value, ["DIAMOND", "다이아몬드", "다이아"]) ||
    /^D[1-4]?$/.test(value)
  ) {
    return `DIAMOND_${extractDivision(value, 4)}` as TierKey;
  }

  if (
    includesAny(value, ["EMERALD", "에메랄드", "에메"]) ||
    /^E[1-4]?$/.test(value)
  ) {
    return `EMERALD_${extractDivision(value, 4)}` as TierKey;
  }

  if (
    includesAny(value, ["PLATINUM", "플래티넘", "플레티넘", "플레", "플"]) ||
    /^P[1-4]?$/.test(value)
  ) {
    return `PLATINUM_${extractDivision(value, 4)}` as TierKey;
  }

  if (includesAny(value, ["GOLD", "골드"]) || /^G[1-4]?$/.test(value)) {
    return `GOLD_${extractDivision(value, 4)}` as TierKey;
  }

  if (includesAny(value, ["SILVER", "실버"]) || /^S[1-4]?$/.test(value)) {
    const division = extractDivision(value, 3);
    if (division === 1) return "SILVER_1";
    if (division === 2) return "SILVER_2";
    return "SILVER_3_BELOW";
  }

  return "SILVER_3_BELOW";
}

export function getDestructionCaptainPowerValue(
  params: DestructionCaptainPointInput,
) {
  const laneKey = resolveDestructionCaptainLane(params.lane);
  const tierKey = resolveDestructionCaptainTierKey(
    params.currentTier,
    params.peakTier,
  );
  return {
    laneKey,
    tierKey,
    tierLabel: TIER_LABELS[tierKey],
    powerValue: POINT_TABLE[tierKey][laneKey],
  };
}

export function calculateDestructionCaptainPoints(
  inputs: DestructionCaptainPointInput[],
  options?: {
    baseLowestTierPoint?: number;
    minHighestTierPoint?: number;
  },
): DestructionCaptainPointDetail[] {
  const basePoint = options?.baseLowestTierPoint ?? BASE_LOWEST_TIER_POINT;
  const minPoint = options?.minHighestTierPoint ?? MIN_HIGHEST_TIER_POINT;
  const details = inputs.map((input) => ({
    ...input,
    ...getDestructionCaptainPowerValue(input),
    auctionPoint: basePoint,
  }));

  if (details.length === 0) return [];

  const powerValues = details.map((detail) => detail.powerValue);
  const minPower = Math.min(...powerValues);

  if (minPower <= 0) {
    return details.map((detail) => ({ ...detail, auctionPoint: basePoint }));
  }

  return details.map((detail) => {
    const rawPoint = Math.round(basePoint * (minPower / detail.powerValue));
    const auctionPoint = Math.min(basePoint, Math.max(minPoint, rawPoint));

    return {
      ...detail,
      auctionPoint,
    };
  });
}
