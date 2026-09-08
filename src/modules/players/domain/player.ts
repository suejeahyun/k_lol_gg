import type { PlayerTierFilter } from "./player-tier";

export type PlayerSummary = Readonly<{
  id: string;
  displayName: string;
  riotId: string;
  mainPosition: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | null;
  tier: string | null;
  recentMatches: number | null;
  winRate: number | null;
}>;

export type PlayerCatalogPage = Readonly<{
  items: readonly PlayerSummary[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}>;

export type PlayerProfile = Readonly<{
  id: string;
  displayName: string;
  riotId: string;
  currentTier: string | null;
  peakTier: string | null;
  joinedAt: Date;
  seasonStats: null;
  positionStats: readonly [];
  championStats: readonly [];
  recentMatches: readonly [];
}>;

export type PlayerCatalogQuery = Readonly<{
  query: string;
  tier: PlayerTierFilter | null;
  page: number;
  pageSize: number;
}>;

export type PlayerDataResult<T> =
  | Readonly<{ state: "ready"; data: T }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;
