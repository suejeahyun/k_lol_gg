import type { PlayerTierFilter } from "@/modules/players/domain/player-tier";

import type { TeamBalancePlayerScoreBreakdown } from "../domain/team-balance";
import { TeamBalanceServiceError } from "../domain/team-balance-draft";
import { teamBalanceOverridePlayerId } from "../domain/team-balance-override";

export type TeamScoreQuery = Readonly<{ playerId: string | null; query: string; page: number; pageSize: number }>;
export type TeamScorePage<T> = Readonly<{ items: readonly T[]; total: number; page: number; pageSize: number }>;
export type TeamScorePlayer = Readonly<{
  playerId: string;
  displayName: string;
  riotId: string;
  currentTier: string | null;
  peakTier: string | null;
}>;
export type TeamScoreOverride = Readonly<{
  playerId: string;
  score: number;
  reason: string;
  revision: number;
  configured: boolean;
  updatedAt: string | null;
}>;
export type TeamScoreHistoryItem = Readonly<{
  id: number;
  actorLabel: string;
  beforeScore: number | null;
  afterScore: number;
  reason: string;
  revision: number;
  createdAt: string;
}>;
export type TeamScorePlayerDetail = Readonly<{
  kind: "player";
  player: TeamScorePlayer;
  override: TeamScoreOverride;
  breakdown: TeamBalancePlayerScoreBreakdown;
  previewPreference: "MAIN";
  history: TeamScorePage<TeamScoreHistoryItem>;
  ratingGeneration: number | null;
  formulaVersion: string;
}>;
export type TeamScoreConfiguredPlayer = TeamScorePlayer & Readonly<{
  score: number;
  reason: string;
  revision: number;
  updatedAt: string;
  baseScore: number;
}>;
export type TeamScoreTier = Readonly<{
  tier: PlayerTierFilter | "UNRANKED" | "UNKNOWN";
  tierLabel: string;
  playerCount: number;
  averageBaseScore: number | null;
  medianBaseScore: number | null;
}>;
export type TeamScoreOverview = Readonly<{
  kind: "overview";
  configured: TeamScorePage<TeamScoreConfiguredPlayer>;
  tiers: readonly TeamScoreTier[];
  activePlayerCount: number;
  scoreBasis: "ACTIVE_REGISTERED_PLAYERS_BASE_SCORE";
  ratingGeneration: number | null;
  formulaVersion: string;
}>;
export type TeamScoreResponse = TeamScorePlayerDetail | TeamScoreOverview;

export function parseTeamScoreQuery(url: string): TeamScoreQuery {
  const params = new URL(url).searchParams;
  const allowed = new Set(["playerId", "q", "page", "pageSize"]);
  const invalid = () => new TeamBalanceServiceError("INVALID_INPUT", "점수 조회 조건을 확인해 주세요.");
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw invalid();
  }
  const integer = (key: string, fallback: number, maximum: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^[1-9][0-9]*$/u.test(value) || Number(value) > maximum) throw invalid();
    return Number(value);
  };
  const playerId = params.has("playerId") ? teamBalanceOverridePlayerId(params.get("playerId")) : null;
  const rawQuery = params.get("q") ?? "";
  const query = rawQuery.normalize("NFKC").trim();
  if (query.length > 100 || rawQuery.length > 200 || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(rawQuery) || (playerId && params.has("q"))) throw invalid();
  return { playerId, query, page: integer("page", 1, 100_000), pageSize: integer("pageSize", 20, 50) };
}
