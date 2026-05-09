export type NormalizedTier =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER"
  | "UNRANKED";

export type ApplyPositionValue = "TOP" | "JGL" | "MID" | "ADC" | "SUP" | "ALL";

export type ParsedParticipationRow = {
  rowId: string;
  order: number;
  rawLine: string;
  name: string;
  normalizedName: string;
  currentTier: NormalizedTier | null;
  peakTier: NormalizedTier | null;
  mainPosition: ApplyPositionValue | null;
  subPositions: ApplyPositionValue[];
  warnings: string[];
};

const tierMap: Record<string, NormalizedTier> = {
  i: "IRON",
  iron: "IRON",
  아이언: "IRON",

  b: "BRONZE",
  bronze: "BRONZE",
  브론즈: "BRONZE",

  s: "SILVER",
  silver: "SILVER",
  실버: "SILVER",

  g: "GOLD",
  gold: "GOLD",
  골드: "GOLD",

  p: "PLATINUM",
  plat: "PLATINUM",
  platinum: "PLATINUM",
  플래: "PLATINUM",
  플래티넘: "PLATINUM",

  e: "EMERALD",
  emerald: "EMERALD",
  에메: "EMERALD",
  에메랄드: "EMERALD",

  d: "DIAMOND",
  dia: "DIAMOND",
  diamond: "DIAMOND",
  다이아: "DIAMOND",

  m: "MASTER",
  master: "MASTER",
  마스터: "MASTER",

  gm: "GRANDMASTER",
  grandmaster: "GRANDMASTER",
  그마: "GRANDMASTER",

  c: "CHALLENGER",
  challenger: "CHALLENGER",
  챌: "CHALLENGER",
  챌린저: "CHALLENGER",

  u: "UNRANKED",
  unranked: "UNRANKED",
  언랭: "UNRANKED",
  언랭크: "UNRANKED",
};

const positionMap: Record<string, ApplyPositionValue> = {
  top: "TOP",
  tp: "TOP",
  탑: "TOP",

  jg: "JGL",
  jgl: "JGL",
  jungle: "JGL",
  jung: "JGL",
  정글: "JGL",

  mid: "MID",
  md: "MID",
  middle: "MID",
  미드: "MID",

  ad: "ADC",
  adc: "ADC",
  bot: "ADC",
  bottom: "ADC",
  원딜: "ADC",

  sup: "SUP",
  sp: "SUP",
  spt: "SUP",
  support: "SUP",
  서폿: "SUP",
  서포터: "SUP",

  a: "ALL",
  all: "ALL",
  any: "ALL",
  fill: "ALL",
  올: "ALL",
  올라인: "ALL",
  아무거나: "ALL",
};

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[，、]/g, ",").replace(/\s+/g, " ");
}

export function normalizeParticipantName(value: string) {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^\s*\d+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTier(value: string): NormalizedTier | null {
  const key = normalizeToken(value).replace(/\s/g, "");
  return tierMap[key] ?? null;
}

export function normalizePositions(value: string): {
  mainPosition: ApplyPositionValue | null;
  subPositions: ApplyPositionValue[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const tokens = value
    .replace(/[，、/]/g, " ")
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const normalized: ApplyPositionValue[] = [];

  for (const token of tokens) {
    const mapped = positionMap[token];
    if (!mapped) {
      warnings.push(`라인 '${token}'을 인식하지 못했습니다.`);
      continue;
    }
    if (!normalized.includes(mapped)) normalized.push(mapped);
  }

  const mainPosition = normalized[0] ?? null;
  const subPositions = normalized.slice(1);

  if (!mainPosition) warnings.push("주라인을 인식하지 못했습니다.");
  if (mainPosition === "ALL") warnings.push("주라인이 ALL입니다. 관리자 확인이 필요합니다.");
  if (subPositions.includes("ALL")) warnings.push("부라인에 ALL이 포함되어 있습니다.");

  return { mainPosition, subPositions, warnings };
}

export function parseParticipationText(input: string): ParsedParticipationRow[] {
  const lines = input.split(/\r?\n/);
  const result: ParsedParticipationRow[] = [];
  const regex = /^\s*(\d+)\s*[.)]\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*(.+?)\s*$/;

  for (const rawLine of lines) {
    const match = rawLine.match(regex);
    if (!match) continue;

    const [, orderText, nameText, currentTierText, peakTierText, positionText] = match;
    const warnings: string[] = [];
    const order = Number(orderText);
    const rawName = nameText.trim();
    const normalizedName = normalizeParticipantName(rawName);

    const currentTier = normalizeTier(currentTierText);
    const peakTier = normalizeTier(peakTierText);

    if (!normalizedName) warnings.push("이름을 인식하지 못했습니다.");
    if (/^\d/.test(rawName)) warnings.push("이름 앞에 숫자가 붙어 있습니다. 실제 이름 확인이 필요합니다.");
    if (!currentTier) warnings.push(`현티어 '${currentTierText.trim()}'를 인식하지 못했습니다.`);
    if (!peakTier) warnings.push(`최고티어 '${peakTierText.trim()}'를 인식하지 못했습니다.`);

    const positionResult = normalizePositions(positionText);

    result.push({
      rowId: `${order}-${normalizedName || rawName}-${result.length}`,
      order,
      rawLine,
      name: normalizedName || rawName,
      normalizedName,
      currentTier,
      peakTier,
      mainPosition: positionResult.mainPosition,
      subPositions: positionResult.subPositions,
      warnings: [...warnings, ...positionResult.warnings],
    });
  }

  return result.sort((a, b) => a.order - b.order);
}
