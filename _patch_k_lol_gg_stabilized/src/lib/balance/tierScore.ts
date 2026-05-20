const TIER_SCORE: Record<string, number> = {
  IRON: 10,
  BRONZE: 20,
  SILVER: 30,
  GOLD: 40,
  PLATINUM: 50,
  EMERALD: 60,
  DIAMOND: 70,
  MASTER: 85,
  GRANDMASTER: 95,
  CHALLENGER: 105,

  I: 4,
  II: 3,
  III: 2,
  IV: 1,
};

function normalizeTier(value?: string | null) {
  if (!value) return null;

  return value
    .toUpperCase()
    .replaceAll(" ", "")
    .replace("아이언", "IRON")
    .replace("브론즈", "BRONZE")
    .replace("실버", "SILVER")
    .replace("골드", "GOLD")
    .replace("플래티넘", "PLATINUM")
    .replace("에메랄드", "EMERALD")
    .replace("다이아", "DIAMOND")
    .replace("다이아몬드", "DIAMOND")
    .replace("마스터", "MASTER")
    .replace("그마", "GRANDMASTER")
    .replace("그랜드마스터", "GRANDMASTER")
    .replace("챌린저", "CHALLENGER");
}

export function getTierScore(tier?: string | null) {
  const normalized = normalizeTier(tier);

  if (!normalized) return 0;

  const baseTier = Object.keys(TIER_SCORE).find((key) =>
    normalized.includes(key)
  );

  if (!baseTier) return 0;

  let score = TIER_SCORE[baseTier];

  if (normalized.includes("I") && !normalized.includes("II")) score += 4;
  else if (normalized.includes("II") && !normalized.includes("III")) score += 3;
  else if (normalized.includes("III")) score += 2;
  else if (normalized.includes("IV")) score += 1;

  const lpMatch = normalized.match(/(\d+)LP/);
  if (lpMatch) {
    score += Math.min(Number(lpMatch[1]) / 100, 1);
  }

  return Number(score.toFixed(2));
}

export function calculateBalanceScore({
  currentTier,
  peakTier,
}: {
  currentTier?: string | null;
  peakTier?: string | null;
}) {
  const currentScore = getTierScore(currentTier);
  const peakScore = getTierScore(peakTier);

  if (currentScore === 0 && peakScore === 0) return 0;

  return Number((currentScore * 0.7 + peakScore * 0.3).toFixed(2));
}