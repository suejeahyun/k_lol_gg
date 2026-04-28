export function getTierKey(tier?: string | null): string | null {
  if (!tier) return null;

  if (tier.includes("아이언")) return "iron";
  if (tier.includes("브론즈")) return "bronze";
  if (tier.includes("실버")) return "silver";
  if (tier.includes("골드")) return "gold";
  if (tier.includes("플래티넘")) return "platinum";
  if (tier.includes("에메랄드")) return "emerald";
  if (tier.includes("다이아")) return "diamond";
  if (tier.includes("마스터")) return "master";
  if (tier.includes("그랜드마스터")) return "grandmaster";
  if (tier.includes("챌린저")) return "challenger";

  return null;
}

export function getTierImageSrc(tier?: string | null): string | null {
  const key = getTierKey(tier);
  if (!key) return null;

  return `/images/tiers/${key}.png`;
}