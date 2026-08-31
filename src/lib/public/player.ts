export const PUBLIC_PLAYER_UNAVAILABLE_NAME = "비공개 플레이어";

export type PublicRiotIdDto = {
  gameName: string;
  tagLine: string | null;
};

export type PublicPlayerSummaryDto = {
  id: number;
  displayName: string;
  riotId: PublicRiotIdDto | null;
  currentTier: string | null;
  peakTier: string | null;
};

export type PublicPlayerDetailDto = PublicPlayerSummaryDto & {
  joinedAt: string;
};

export type PublicPlayerIdentitySource = {
  publicDisplayName?: string | null;
  nickname?: string | null;
  tag?: string | null;
};

type PublicPlayerSummarySource = PublicPlayerIdentitySource & {
  id: number;
  currentTier?: string | null;
  peakTier?: string | null;
};

type PublicPlayerDetailSource = PublicPlayerSummarySource & {
  createdAt: Date | string;
};

function clean(value: string | null | undefined) {
  const normalized = value?.normalize("NFC").trim();
  return normalized || null;
}

export function toPublicRiotId(source: PublicPlayerIdentitySource): PublicRiotIdDto | null {
  const gameName = clean(source.nickname);
  const tagLine = clean(source.tag);
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

export function resolvePublicPlayerDisplayName(source: PublicPlayerIdentitySource) {
  const publicDisplayName = clean(source.publicDisplayName);
  if (publicDisplayName) return publicDisplayName;

  const riotId = toPublicRiotId(source);
  return riotId
    ? `${riotId.gameName}#${riotId.tagLine}`
    : PUBLIC_PLAYER_UNAVAILABLE_NAME;
}

export function toPublicPlayerSummaryDto(
  source: PublicPlayerSummarySource,
): PublicPlayerSummaryDto {
  return {
    id: source.id,
    displayName: resolvePublicPlayerDisplayName(source),
    riotId: toPublicRiotId(source),
    currentTier: clean(source.currentTier),
    peakTier: clean(source.peakTier),
  };
}

export function toPublicPlayerDto(source: PublicPlayerSummarySource) {
  return toPublicPlayerSummaryDto(source);
}

export function toPublicPlayerDetailDto(
  source: PublicPlayerDetailSource,
): PublicPlayerDetailDto {
  return {
    ...toPublicPlayerSummaryDto(source),
    joinedAt: new Date(source.createdAt).toISOString(),
  };
}
