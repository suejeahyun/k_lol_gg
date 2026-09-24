import type { RiotMatchDto } from "@/modules/riot/domain/riot-player-analytics";
import { aggregatePlayerMatches, playerChampionAggregates, playerPositionAggregates, playerReportMetrics, type PlayerMatchFilters } from "./player-analytics";

export const PLAYER_REPORT_FORMULA_VERSION = "klol-observed-match-v1";
export const PLAYER_REPORT_SNAPSHOT_LIMIT = 10;
export type PlayerReportSnapshot = Readonly<{
  version: 1; formulaVersion: string; id: string; playerId: string; riotId: string;
  createdAt: string; sourceUpdatedAt: string; filters: PlayerMatchFilters; matchIds: readonly string[];
  aggregate: ReturnType<typeof aggregatePlayerMatches>;
  champions: ReturnType<typeof playerChampionAggregates>;
  positions: ReturnType<typeof playerPositionAggregates>;
  metrics: ReturnType<typeof playerReportMetrics>;
}>;
export function playerReportStorageKey(playerId: string, riotId: string) { return `klol:riot-report:v1:${encodeURIComponent(playerId)}:${encodeURIComponent(riotId.normalize("NFKC"))}`; }
export function createPlayerReportSnapshot(input: Readonly<{ id: string; playerId: string; riotId: string; createdAt: string; sourceUpdatedAt: string; filters: PlayerMatchFilters; matches: readonly RiotMatchDto[] }>): PlayerReportSnapshot {
  return { version: 1, formulaVersion: PLAYER_REPORT_FORMULA_VERSION, id: input.id, playerId: input.playerId, riotId: input.riotId,
    createdAt: input.createdAt, sourceUpdatedAt: input.sourceUpdatedAt, filters: { ...input.filters }, matchIds: input.matches.map((match) => match.matchId),
    aggregate: aggregatePlayerMatches(input.matches), champions: playerChampionAggregates(input.matches), positions: playerPositionAggregates(input.matches), metrics: playerReportMetrics(input.matches) };
}
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
/** Browser snapshots are historical summaries, never a source of live Riot facts or participant identities. */
export function parsePlayerReportSnapshots(value: string | null, playerId: string, riotId: string): PlayerReportSnapshot[] {
  if (!value || value.length > 2_000_000) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > PLAYER_REPORT_SNAPSHOT_LIMIT) return [];
    return parsed.filter((raw): raw is PlayerReportSnapshot => {
      const row = object(raw); const filters = object(row?.filters); const aggregate = object(row?.aggregate);
      const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
      const number = (value: unknown) => typeof value === "number" && Number.isFinite(value);
      return !!row && row.version === 1 && row.formulaVersion === PLAYER_REPORT_FORMULA_VERSION && row.playerId === playerId && row.riotId === riotId
        && text(row.id, 100) && text(row.createdAt, 40) && Number.isFinite(Date.parse(String(row.createdAt))) && text(row.sourceUpdatedAt, 40)
        && !!filters && ["year", "queue", "patch", "position", "champion", "result", "from", "to", "sort"].every((key) => text(filters[key], 80))
        && !!aggregate && ["games", "wins", "losses", "winRate", "kills", "deaths", "assists", "kda"].every((key) => number(aggregate[key]))
        && Array.isArray(row.matchIds) && row.matchIds.length <= 10_000 && row.matchIds.every((id) => text(id, 80))
        && Array.isArray(row.champions) && row.champions.length <= 500 && row.champions.every((item) => { const champion = object(item); return !!champion && number(champion.championId) && text(champion.championName, 100) && number(champion.games) && number(champion.winRate); })
        && Array.isArray(row.positions) && row.positions.length <= 6 && row.positions.every((item) => { const position = object(item); return !!position && text(position.label, 20) && number(position.games) && number(position.share) && number(position.winRate); })
        && Array.isArray(row.metrics) && row.metrics.length === 6 && row.metrics.every((item) => { const metric = object(item); return !!metric && text(metric.id, 30) && text(metric.label, 30) && text(metric.unit, 50) && text(metric.formula, 500) && number(metric.games) && (metric.value === null || number(metric.value)); });
    });
  } catch { return []; }
}
