export type HomeRecentMatch = Readonly<{
  id: string;
  title: string;
  playedOn: string;
  blueWins: number;
  redWins: number;
  occurredAt: string;
}>;

export type HomeRecruit = Readonly<{
  id: string;
  kind: "PARTY" | "SCRIM";
  title: string;
  status: string;
  summary: string;
  occurredAt: string;
}>;

export type HomeCompetition = Readonly<{
  id: string;
  kind: "EVENT" | "DESTRUCTION";
  title: string;
  status: string;
  participantCount: number;
  occurredAt: string;
}>;

export type HomeGallery = Readonly<{
  id: string;
  title: string;
  description: string;
  publishedAt: string;
}>;

export type HomeActiveSeason = Readonly<{
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type HomeSnapshot = Readonly<{
  activePlayerCount: number;
  activeSeasonCount: number;
  publishedMatchCount: number;
  activeSeason: HomeActiveSeason | null;
  feeds: Readonly<{
    recentMatches: readonly HomeRecentMatch[];
    recruits: readonly HomeRecruit[];
    competitions: readonly HomeCompetition[];
    gallery: readonly HomeGallery[];
  }>;
}>;

export function mergeRecentHomeItems<T extends Readonly<{ id: string; occurredAt: string }>>(
  groups: readonly (readonly T[])[],
  limit: number,
): readonly T[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("HOME_FEED_LIMIT_INVALID");
  return groups.flat().slice().sort((left, right) => {
    const byTime = right.occurredAt.localeCompare(left.occurredAt);
    return byTime || left.id.localeCompare(right.id);
  }).slice(0, limit);
}

export type HomeSnapshotResult =
  | Readonly<{ state: "ready"; snapshot: HomeSnapshot }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;
