import { and, count, desc, eq, gte, inArray } from "drizzle-orm";

import {
  MMR_POSITIONS,
  toTeamBalanceMmrProviderDto,
  type MmrPlayerProfile,
} from "@/modules/mmr";
import {
  mmrPlayerPositionProfiles,
  mmrPlayerProfiles,
  mmrProjectionStates,
} from "@/platform/db/schema/mmr";
import { matchGames, matchParticipants, matchSeries } from "@/platform/db/schema/matches";
import { players } from "@/platform/db/schema/registry";
import { riotAccountLinks, riotSummaries } from "@/platform/db/schema/riot";
import { teamBalancePlayerOverrides } from "@/platform/db/schema/team-tools";
import { PUBLIC_RIOT_SNAPSHOT_STALE_AFTER_MS } from "@/modules/riot/application/riot-query";
import { parseRecentSoloSummary } from "@/modules/riot/domain/recent-solo-summary";
import { seasons } from "@/platform/db/schema/seasons";
import {
  playerPositionStats,
  playerSeasonStats,
  seasonProjectionStates,
} from "@/platform/db/schema/statistics";

import type {
  TeamBalanceRatingProvider,
  TeamBalanceRatingSnapshot,
} from "../application/ports/team-balance-rating-provider";
import { TEAM_BALANCE_POSITIONS, type TeamBalancePosition, type TeamBalanceRatingProviderDto } from "../domain/team-balance";

function score(wins: number, games: number) {
  return games > 0 ? Math.round((wins * 10_000) / games) / 100 : null;
}

function confidence(games: number) {
  return Math.min(1, games / 20);
}

export class PostgresTeamBalanceRatingProvider implements TeamBalanceRatingProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}
  private async attachV1Inputs(
    executor: Parameters<TeamBalanceRatingProvider["load"]>[0],
    playerIds: readonly string[],
    snapshot: TeamBalanceRatingSnapshot,
    v1MmrRatings: ReadonlyMap<string, TeamBalanceRatingProviderDto>,
  ): Promise<TeamBalanceRatingSnapshot> {
    const projection = (
      await executor
        .select({ seasonId: seasonProjectionStates.seasonId, generation: seasonProjectionStates.generation })
        .from(seasonProjectionStates)
        .innerJoin(seasons, eq(seasons.id, seasonProjectionStates.seasonId))
        .where(and(eq(seasonProjectionStates.status, "READY"), eq(seasons.status, "ACTIVE")))
        .orderBy(desc(seasonProjectionStates.calculatedAt), desc(seasons.createdAt))
        .limit(1)
    )[0];
    const [registryRows, seasonRows, positionRows, recentRows, overrideRows] = await Promise.all([
      executor
        .select({ id: players.id, legacyId: players.legacyId, currentTier: players.currentTier, peakTier: players.peakTier })
        .from(players)
        .where(inArray(players.id, [...playerIds])),
      projection
        ? executor
            .select()
            .from(playerSeasonStats)
            .where(and(
              eq(playerSeasonStats.seasonId, projection.seasonId),
              eq(playerSeasonStats.generation, projection.generation),
              inArray(playerSeasonStats.playerId, [...playerIds]),
            ))
        : Promise.resolve([]),
      executor
        .select({ playerId: matchParticipants.playerId, position: matchParticipants.position, games: count() })
        .from(matchParticipants)
        .innerJoin(matchGames, eq(matchGames.id, matchParticipants.gameId))
        .innerJoin(matchSeries, eq(matchSeries.id, matchGames.seriesId))
        .where(and(inArray(matchParticipants.playerId, [...playerIds]), eq(matchSeries.status, "PUBLISHED")))
        .groupBy(matchParticipants.playerId, matchParticipants.position),
      executor.select({ playerId: riotSummaries.playerId, summary: riotSummaries.recentSoloJson, syncedAt: riotSummaries.recentSoloSyncedAt })
        .from(riotSummaries).innerJoin(riotAccountLinks, and(
          eq(riotAccountLinks.id, riotSummaries.linkId), eq(riotAccountLinks.playerId, riotSummaries.playerId),
          eq(riotAccountLinks.status, "CONNECTED"), eq(riotAccountLinks.gameName, riotSummaries.gameName), eq(riotAccountLinks.tagLine, riotSummaries.tagLine),
          gte(riotSummaries.recentSoloSyncedAt, riotAccountLinks.linkedAt),
        )).where(inArray(riotSummaries.playerId, [...playerIds])),
      executor.select({ playerId: teamBalancePlayerOverrides.playerId, score: teamBalancePlayerOverrides.score })
        .from(teamBalancePlayerOverrides).where(inArray(teamBalancePlayerOverrides.playerId, [...playerIds])),
    ]);
    const registryById = new Map(registryRows.map((row) => [row.id, row]));
    const seasonById = new Map(seasonRows.map((row) => [row.playerId, row]));
    const recentById = new Map(recentRows.map((row) => [row.playerId, row]));
    const overrideById = new Map(overrideRows.map((row) => [row.playerId, row]));
    const now = this.now().getTime();
    const internalPositionsById = new Map<string, Partial<Record<TeamBalancePosition, number>>>();
    const internalGamesById = new Map<string, number>();
    for (const row of positionRows) {
      const positions = internalPositionsById.get(row.playerId) ?? {};
      positions[row.position] = row.games;
      internalPositionsById.set(row.playerId, positions);
      internalGamesById.set(row.playerId, (internalGamesById.get(row.playerId) ?? 0) + row.games);
    }
    const ratings = new Map<string, TeamBalanceRatingProviderDto | null>();
    for (const playerId of playerIds) {
      const base = snapshot.ratings.get(playerId);
      const registry = registryById.get(playerId);
      const season = seasonById.get(playerId);
      const v1Mmr = v1MmrRatings.get(playerId);
      const recent = recentById.get(playerId);
      const age = recent?.syncedAt ? now - recent.syncedAt.getTime() : Infinity;
      const recentSolo = age >= 0 && age <= PUBLIC_RIOT_SNAPSHOT_STALE_AFTER_MS ? parseRecentSoloSummary(recent?.summary) : null;
      const override = overrideById.get(playerId);
      ratings.set(playerId, {
        overall: base?.overall ?? null,
        confidence: base?.confidence ?? null,
        sampleSize: base?.sampleSize ?? null,
        positions: base?.positions ?? null,
        v1: {
          legacyPlayerId: registry?.legacyId ?? null,
          currentTier: registry?.currentTier ?? null,
          peakTier: registry?.peakTier ?? null,
          season: season ? { totalGames: season.totalGames, wins: season.wins, mvpCount: season.mvpCount } : null,
          internalGames: internalGamesById.get(playerId) ?? 0,
          internalPositionGames: internalPositionsById.get(playerId) ?? {},
          recentSolo,
          balanceOverrideScore: override?.score ?? 0,
          mmr: {
            overall: v1Mmr?.overall ?? 50,
            confidence: v1Mmr?.confidence ?? 0,
            positions: Object.fromEntries(TEAM_BALANCE_POSITIONS.map((position) => [
              position,
              v1Mmr?.positions?.[position]?.score ?? v1Mmr?.overall ?? 50,
            ])),
          },
          missingSources: [...(recentSolo ? [] : ["RECENT_SOLO" as const]), ...(override ? [] : ["BALANCE_OVERRIDE" as const])],
        },
      });
    }
    return { generation: snapshot.generation, ratings };
  }

  private async loadStatisticsFallback(
    executor: Parameters<TeamBalanceRatingProvider["load"]>[0],
    playerIds: readonly string[],
  ): Promise<TeamBalanceRatingSnapshot> {
    const projection = (
      await executor
        .select({ seasonId: seasonProjectionStates.seasonId, generation: seasonProjectionStates.generation })
        .from(seasonProjectionStates)
        .innerJoin(seasons, eq(seasons.id, seasonProjectionStates.seasonId))
        .where(and(eq(seasonProjectionStates.status, "READY"), eq(seasons.status, "ACTIVE")))
        .orderBy(desc(seasonProjectionStates.calculatedAt), desc(seasons.createdAt))
        .limit(1)
    )[0];
    if (!projection) return { generation: null, ratings: new Map() };

    const [overallRows, positionRows] = await Promise.all([
      executor
        .select()
        .from(playerSeasonStats)
        .where(
          and(
            eq(playerSeasonStats.seasonId, projection.seasonId),
            eq(playerSeasonStats.generation, projection.generation),
            inArray(playerSeasonStats.playerId, [...playerIds]),
          ),
        ),
      executor
        .select()
        .from(playerPositionStats)
        .where(
          and(
            eq(playerPositionStats.seasonId, projection.seasonId),
            eq(playerPositionStats.generation, projection.generation),
            inArray(playerPositionStats.playerId, [...playerIds]),
          ),
        ),
    ]);

    const positionsByPlayer = new Map<string, Partial<Record<TeamBalancePosition, {
      score: number | null;
      confidence: number | null;
      sampleSize: number | null;
    }>>>();
    for (const row of positionRows) {
      const positions = positionsByPlayer.get(row.playerId) ?? {};
      positions[row.position] = {
        score: score(row.wins, row.games),
        confidence: confidence(row.games),
        sampleSize: row.games,
      };
      positionsByPlayer.set(row.playerId, positions);
    }

    const overallByPlayer = new Map(overallRows.map((row) => [row.playerId, row]));
    const ratings = new Map<string, TeamBalanceRatingProviderDto | null>();
    for (const playerId of playerIds) {
      const overall = overallByPlayer.get(playerId);
      const positions = positionsByPlayer.get(playerId);
      ratings.set(
        playerId,
        overall || positions
          ? {
              overall: overall ? score(overall.wins, overall.totalGames) : null,
              confidence: overall ? confidence(overall.totalGames) : null,
              sampleSize: overall?.totalGames ?? null,
              positions: positions ?? null,
            }
          : null,
      );
    }
    return { generation: projection.generation, ratings };
  }

  async load(executor: Parameters<TeamBalanceRatingProvider["load"]>[0], playerIds: readonly string[]): Promise<TeamBalanceRatingSnapshot> {
    if (playerIds.length === 0) return { generation: null, ratings: new Map() };
    const state = (
      await executor
        .select({ generation: mmrProjectionStates.generation, status: mmrProjectionStates.status })
        .from(mmrProjectionStates)
        .where(eq(mmrProjectionStates.key, "GLOBAL"))
        .limit(1)
    )[0];
    if (!state || state.status !== "READY") {
      return this.attachV1Inputs(executor, playerIds, await this.loadStatisticsFallback(executor, playerIds), new Map());
    }

    const [profileRows, positionRows] = await Promise.all([
      executor.select().from(mmrPlayerProfiles).where(and(
        eq(mmrPlayerProfiles.generation, state.generation),
        inArray(mmrPlayerProfiles.playerId, [...playerIds]),
      )),
      executor.select().from(mmrPlayerPositionProfiles).where(and(
        eq(mmrPlayerPositionProfiles.generation, state.generation),
        inArray(mmrPlayerPositionProfiles.playerId, [...playerIds]),
      )),
    ]);
    const positionByPlayer = new Map<string, MmrPlayerProfile["positions"]>();
    for (const row of profileRows) {
      positionByPlayer.set(row.playerId, Object.fromEntries(MMR_POSITIONS.map((position) => [position, {
        scoreBp: row.overallScoreBp,
        sampleSize: 0,
      }])) as MmrPlayerProfile["positions"]);
    }
    for (const row of positionRows) {
      const positions = positionByPlayer.get(row.playerId);
      if (positions) (positions as Record<string, { scoreBp: number; sampleSize: number }>)[row.position] = {
        scoreBp: row.scoreBp,
        sampleSize: row.sampleSize,
      };
    }
    const ratings = new Map<string, TeamBalanceRatingProviderDto | null>();
    for (const row of profileRows) {
      ratings.set(row.playerId, toTeamBalanceMmrProviderDto({
        playerId: row.playerId,
        generation: row.generation,
        overallScoreBp: row.overallScoreBp,
        confidenceBp: row.confidenceBp,
        sampleSize: row.sampleSize,
        positions: positionByPlayer.get(row.playerId)!,
      }));
    }
    const missing = playerIds.filter((playerId) => !ratings.has(playerId));
    const v1MmrRatings = new Map<string, TeamBalanceRatingProviderDto>();
    for (const [playerId, rating] of ratings) if (rating) v1MmrRatings.set(playerId, rating);
    if (missing.length > 0) {
      const fallback = await this.loadStatisticsFallback(executor, missing);
      for (const playerId of missing) ratings.set(playerId, fallback.ratings.get(playerId) ?? null);
    }
    return this.attachV1Inputs(executor, playerIds, { generation: state.generation, ratings }, v1MmrRatings);
  }
}
