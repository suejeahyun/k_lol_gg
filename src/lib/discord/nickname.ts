export type ParsedDiscordNickname = {
  birthYear: string | null;
  name: string | null;
  nickname: string | null;
  tier: string | null;
  normalized: string;
};

const TIER_PATTERN = /^(?:[UIBSPEDMC]|GM|CH|IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER)(?:\([^)]+\))?$/i;

export function parseDiscordCommunityNickname(value: string | null | undefined): ParsedDiscordNickname {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { birthYear: null, name: null, nickname: null, tier: null, normalized: "" };
  }

  const parts = normalized.split(" ").filter(Boolean);
  const birthYear = parts[0] && /^\d{2,4}$/.test(parts[0]) ? parts[0] : null;
  const nameIndex = birthYear ? 1 : 0;
  const name = parts[nameIndex] ?? null;
  let tier: string | null = null;
  let tierIndex = -1;

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (TIER_PATTERN.test(parts[i])) {
      tier = parts[i];
      tierIndex = i;
      break;
    }
  }

  const nicknameStart = name ? nameIndex + 1 : nameIndex;
  const nicknameEnd = tierIndex >= 0 ? tierIndex : parts.length;
  const nickname = parts.slice(nicknameStart, nicknameEnd).join(" ").trim() || null;

  return { birthYear, name, nickname, tier, normalized };
}

export function buildDiscordAvatarUrl(discordId: string, avatar: string | null | undefined) {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}`;
}

export function scorePlayerDiscordMatch(params: {
  parsedName: string | null;
  parsedNickname: string | null;
  parsedTier: string | null;
  player: { name: string | null; nickname: string; currentTier: string | null; peakTier: string | null };
}) {
  const parsedName = normalize(params.parsedName);
  const parsedNickname = normalize(params.parsedNickname);
  const parsedTier = normalizeTier(params.parsedTier);
  const playerName = normalize(params.player.name);
  const playerNickname = normalize(params.player.nickname);
  const currentTier = normalizeTier(params.player.currentTier);
  const peakTier = normalizeTier(params.player.peakTier);

  let score = 0;
  if (parsedName && playerName && parsedName === playerName) score += 45;
  if (parsedNickname && playerNickname && parsedNickname === playerNickname) score += 45;
  if (parsedTier && (parsedTier === currentTier || parsedTier === peakTier)) score += 10;

  return score;
}

function normalize(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizeTier(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[()]/g, "")
    .toUpperCase();
}
