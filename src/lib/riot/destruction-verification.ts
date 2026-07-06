export type RiotDestructionVerificationStatus =
  | "VERIFIED"
  | "CHECK_REQUIRED"
  | "SYNC_REQUIRED"
  | "NO_RANK"
  | "NOT_LINKED"
  | "UNKNOWN_TIER";

export type RiotDestructionVerificationSeverity = "ok" | "warn" | "danger" | "muted";

export type RiotDestructionVerificationInput = {
  currentTier?: string | null;
  riotAccount?: {
    gameName?: string | null;
    tagLine?: string | null;
    isVerified?: boolean | null;
    syncStatus?: string | null;
    lastSyncedAt?: Date | string | null;
    updatedAt?: Date | string | null;
    unlinkedAt?: Date | string | null;
  } | null;
  soloRankSnapshot?: {
    tier?: string | null;
    rank?: string | null;
    leaguePoints?: number | null;
    wins?: number | null;
    losses?: number | null;
    winRate?: number | null;
    updatedAt?: Date | string | null;
  } | null;
  now?: Date;
  staleDays?: number;
  tierDiffThreshold?: number;
};

export type RiotDestructionVerification = {
  status: RiotDestructionVerificationStatus;
  severity: RiotDestructionVerificationSeverity;
  label: string;
  shortLabel: string;
  message: string;
  siteTierLabel: string;
  riotTierLabel: string;
  riotIdLabel: string;
  diffDivisions: number | null;
  lastSyncedAtLabel: string;
  rankWinRateLabel: string;
  needsAdminReview: boolean;
};

const STALE_DAYS = 7;
const TIER_DIFF_THRESHOLD = 2;

const TIER_ORDER: Record<string, number> = {
  IRON: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
  EMERALD: 5,
  DIAMOND: 6,
  MASTER: 7,
  GRANDMASTER: 8,
  CHALLENGER: 9,
};

const RANK_ORDER: Record<string, number> = {
  IV: 0,
  III: 1,
  II: 2,
  I: 3,
};

const KOREAN_TIER_LABELS: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

const KOREAN_SHORT_TIER_LABELS: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아",
  MASTER: "마스터",
  GRANDMASTER: "그마",
  CHALLENGER: "챌린저",
};

function normalizeCompact(value?: string | null) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll(" ", "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll(".", "");
}

function normalizeTierName(value?: string | null) {
  const compact = normalizeCompact(value)
    .replaceAll("아이언", "IRON")
    .replaceAll("브론즈", "BRONZE")
    .replaceAll("실버", "SILVER")
    .replaceAll("골드", "GOLD")
    .replaceAll("플래티넘", "PLATINUM")
    .replaceAll("플레티넘", "PLATINUM")
    .replaceAll("플래", "PLATINUM")
    .replaceAll("플레", "PLATINUM")
    .replaceAll("에메랄드", "EMERALD")
    .replaceAll("에메", "EMERALD")
    .replaceAll("다이아몬드", "DIAMOND")
    .replaceAll("다이아", "DIAMOND")
    .replaceAll("다이야", "DIAMOND")
    .replaceAll("다야", "DIAMOND")
    .replaceAll("그랜드마스터", "GRANDMASTER")
    .replaceAll("그마", "GRANDMASTER")
    .replaceAll("마스터", "MASTER")
    .replaceAll("챌린저", "CHALLENGER")
    .replaceAll("챌", "CHALLENGER");

  if (!compact) return null;

  if (compact.startsWith("아")) return "IRON";
  if (compact.startsWith("브")) return "BRONZE";
  if (compact.startsWith("실")) return "SILVER";
  if (compact.startsWith("골")) return "GOLD";
  if (compact.startsWith("플")) return "PLATINUM";
  if (compact.startsWith("에")) return "EMERALD";
  if (compact.startsWith("다")) return "DIAMOND";
  if (compact.startsWith("마")) return "MASTER";

  if (compact.includes("CHALLENGER")) return "CHALLENGER";
  if (compact.includes("GRANDMASTER")) return "GRANDMASTER";
  if (compact.includes("MASTER")) return "MASTER";
  if (compact.includes("DIAMOND")) return "DIAMOND";
  if (compact.includes("EMERALD")) return "EMERALD";
  if (compact.includes("PLATINUM")) return "PLATINUM";
  if (compact.includes("GOLD")) return "GOLD";
  if (compact.includes("SILVER")) return "SILVER";
  if (compact.includes("BRONZE")) return "BRONZE";
  if (compact.includes("IRON")) return "IRON";

  return null;
}

function normalizeRank(value?: string | null) {
  const compact = normalizeCompact(value);
  if (!compact) return null;

  if (compact.includes("IV") || compact.includes("4") || compact.includes("４")) return "IV";
  if (compact.includes("III") || compact.includes("3") || compact.includes("３")) return "III";
  if (compact.includes("II") || compact.includes("2") || compact.includes("２")) return "II";
  if (compact.includes("I") || compact.includes("1") || compact.includes("１")) return "I";

  return null;
}

function parseTier(value?: string | null, explicitRank?: string | null) {
  const tier = normalizeTierName(value);
  if (!tier) return null;

  const rank = tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER"
    ? null
    : normalizeRank(explicitRank) ?? normalizeRank(value) ?? "IV";

  const tierOrder = TIER_ORDER[tier];
  const rankOrder = rank ? RANK_ORDER[rank] : 0;
  const divisionScore = tierOrder * 4 + rankOrder;

  return {
    tier,
    rank,
    divisionScore,
  };
}

function formatTierLabel(tier?: string | null, rank?: string | null, leaguePoints?: number | null) {
  const parsed = parseTier(tier, rank);
  if (!parsed) return "-";

  const base = KOREAN_TIER_LABELS[parsed.tier] ?? parsed.tier;
  const division = parsed.rank ? ` ${parsed.rank}` : "";
  const lp = typeof leaguePoints === "number" && Number.isFinite(leaguePoints) ? ` ${leaguePoints}LP` : "";
  return `${base}${division}${lp}`.trim();
}

function formatShortTierLabel(tier?: string | null, rank?: string | null) {
  const parsed = parseTier(tier, rank);
  if (!parsed) return "-";

  const base = KOREAN_SHORT_TIER_LABELS[parsed.tier] ?? parsed.tier;
  const division = parsed.rank ? ` ${parsed.rank}` : "";
  return `${base}${division}`.trim();
}

function parseDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatKoreanDateTime(value?: Date | string | null) {
  const date = parseDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatWinRate(snapshot: RiotDestructionVerificationInput["soloRankSnapshot"]) {
  if (!snapshot) return "-";

  const wins = snapshot.wins ?? 0;
  const losses = snapshot.losses ?? 0;
  const total = wins + losses;
  const winRate = typeof snapshot.winRate === "number" && Number.isFinite(snapshot.winRate)
    ? snapshot.winRate
    : total > 0
      ? Number(((wins / total) * 100).toFixed(1))
      : 0;

  if (total <= 0) return "랭크 기록 없음";
  return `${wins}승 ${losses}패 · ${winRate.toFixed(1)}%`;
}

export function getRiotDestructionVerification({
  currentTier,
  riotAccount,
  soloRankSnapshot,
  now = new Date(),
  staleDays = STALE_DAYS,
  tierDiffThreshold = TIER_DIFF_THRESHOLD,
}: RiotDestructionVerificationInput): RiotDestructionVerification {
  const riotIdLabel = riotAccount?.gameName && riotAccount?.tagLine
    ? `${riotAccount.gameName}#${riotAccount.tagLine}`
    : "-";
  const siteTierLabel = currentTier?.trim() || "-";
  const lastSyncedAt = parseDate(soloRankSnapshot?.updatedAt) ?? parseDate(riotAccount?.lastSyncedAt) ?? parseDate(riotAccount?.updatedAt);
  const lastSyncedAtLabel = formatKoreanDateTime(lastSyncedAt);
  const riotTierLabel = formatTierLabel(soloRankSnapshot?.tier, soloRankSnapshot?.rank, soloRankSnapshot?.leaguePoints);
  const rankWinRateLabel = formatWinRate(soloRankSnapshot);

  if (!riotAccount || riotAccount.unlinkedAt) {
    return {
      status: "NOT_LINKED",
      severity: "muted",
      label: "미연동",
      shortLabel: "미연동",
      message: "Riot 계정이 연결되지 않았습니다.",
      siteTierLabel,
      riotTierLabel: "-",
      riotIdLabel: "-",
      diffDivisions: null,
      lastSyncedAtLabel: "-",
      rankWinRateLabel: "-",
      needsAdminReview: true,
    };
  }

  if (!soloRankSnapshot?.tier) {
    return {
      status: "NO_RANK",
      severity: "warn",
      label: "랭크 없음",
      shortLabel: "랭크 없음",
      message: "연동 계정은 있으나 저장된 솔랭 티어가 없습니다.",
      siteTierLabel,
      riotTierLabel: "-",
      riotIdLabel,
      diffDivisions: null,
      lastSyncedAtLabel,
      rankWinRateLabel,
      needsAdminReview: true,
    };
  }

  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  if (!lastSyncedAt || now.getTime() - lastSyncedAt.getTime() > staleMs) {
    return {
      status: "SYNC_REQUIRED",
      severity: "warn",
      label: "갱신 필요",
      shortLabel: "갱신 필요",
      message: `${staleDays}일 이상 갱신되지 않은 Riot 데이터입니다.`,
      siteTierLabel,
      riotTierLabel,
      riotIdLabel,
      diffDivisions: null,
      lastSyncedAtLabel,
      rankWinRateLabel,
      needsAdminReview: true,
    };
  }

  const siteTier = parseTier(currentTier);
  const riotTier = parseTier(soloRankSnapshot.tier, soloRankSnapshot.rank);

  if (!siteTier || !riotTier) {
    return {
      status: "UNKNOWN_TIER",
      severity: "warn",
      label: "수동 확인",
      shortLabel: "수동 확인",
      message: "사이트 티어 또는 Riot 티어를 자동 비교할 수 없습니다.",
      siteTierLabel,
      riotTierLabel,
      riotIdLabel,
      diffDivisions: null,
      lastSyncedAtLabel,
      rankWinRateLabel,
      needsAdminReview: true,
    };
  }

  const diffDivisions = Math.abs(siteTier.divisionScore - riotTier.divisionScore);
  if (diffDivisions >= tierDiffThreshold) {
    return {
      status: "CHECK_REQUIRED",
      severity: "danger",
      label: "확인 필요",
      shortLabel: "확인 필요",
      message: `사이트 현재티어와 Riot 솔랭 티어가 ${diffDivisions}단계 차이입니다.`,
      siteTierLabel,
      riotTierLabel,
      riotIdLabel,
      diffDivisions,
      lastSyncedAtLabel,
      rankWinRateLabel,
      needsAdminReview: true,
    };
  }

  return {
    status: "VERIFIED",
    severity: "ok",
    label: "정상",
    shortLabel: "정상",
    message: "사이트 현재티어와 Riot 솔랭 티어 차이가 허용 범위입니다.",
    siteTierLabel,
    riotTierLabel,
    riotIdLabel,
    diffDivisions,
    lastSyncedAtLabel,
    rankWinRateLabel,
    needsAdminReview: false,
  };
}

export function summarizeRiotDestructionVerifications(items: RiotDestructionVerification[]) {
  return {
    total: items.length,
    verified: items.filter((item) => item.status === "VERIFIED").length,
    checkRequired: items.filter((item) => item.status === "CHECK_REQUIRED" || item.status === "UNKNOWN_TIER").length,
    syncRequired: items.filter((item) => item.status === "SYNC_REQUIRED" || item.status === "NO_RANK").length,
    notLinked: items.filter((item) => item.status === "NOT_LINKED").length,
    needsAdminReview: items.filter((item) => item.needsAdminReview).length,
  };
}

export function formatRiotRankShort(tier?: string | null, rank?: string | null) {
  return formatShortTierLabel(tier, rank);
}
