export const playerTierFilters = [
  { value: "IRON", label: "아이언" },
  { value: "BRONZE", label: "브론즈" },
  { value: "SILVER", label: "실버" },
  { value: "GOLD", label: "골드" },
  { value: "PLATINUM", label: "플래티넘" },
  { value: "EMERALD", label: "에메랄드" },
  { value: "DIAMOND", label: "다이아몬드" },
  { value: "MASTER", label: "마스터" },
  { value: "GRANDMASTER", label: "그랜드마스터" },
  { value: "CHALLENGER", label: "챌린저" },
] as const;

export type PlayerTierFilter = (typeof playerTierFilters)[number]["value"];

const tierAliases: Readonly<Record<PlayerTierFilter, readonly string[]>> = {
  IRON: ["IRON", "아이언"],
  BRONZE: ["BRONZE", "브론즈"],
  SILVER: ["SILVER", "실버"],
  GOLD: ["GOLD", "골드"],
  PLATINUM: ["PLATINUM", "플래티넘", "플레티넘"],
  EMERALD: ["EMERALD", "에메랄드"],
  DIAMOND: ["DIAMOND", "다이아몬드", "다이아"],
  MASTER: ["MASTER", "마스터"],
  GRANDMASTER: ["GRANDMASTER", "그랜드마스터"],
  CHALLENGER: ["CHALLENGER", "챌린저"],
};

export function parsePlayerTierFilter(value: unknown): PlayerTierFilter | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLocaleUpperCase("en-US");
  return playerTierFilters.some((tier) => tier.value === normalized)
    ? normalized as PlayerTierFilter
    : null;
}

export function playerTierAliases(tier: PlayerTierFilter): readonly string[] {
  return tierAliases[tier];
}

export function playerTierLabel(tier: PlayerTierFilter): string {
  return playerTierFilters.find((candidate) => candidate.value === tier)?.label ?? tier;
}

export function playerTierFamily(value: string | null): PlayerTierFilter | null {
  if (!value) return null;
  const normalized = value.normalize("NFKC").trim().toLocaleUpperCase("en-US");
  for (const tier of playerTierFilters) {
    if (tierAliases[tier.value].some((alias) => normalized.startsWith(alias.toLocaleUpperCase("en-US")))) {
      return tier.value;
    }
  }
  return null;
}
