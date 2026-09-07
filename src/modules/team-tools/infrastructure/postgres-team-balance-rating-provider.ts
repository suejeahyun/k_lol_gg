import { and, desc, eq, inArray } from "drizzle-orm";

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
import type { TeamBalancePosition, TeamBalanceRatingProviderDto } from "../domain/team-balance";

function score(wins: number, games: number) {
  return games > 0 ? Math.round((wins * 10_000) / games) / 100 : null;
}

function confidence(games: number) {
  return Math.min(1, games / 20);
}

export class PostgresTeamBalanceRatingProvider implements TeamBalanceRatingProvider {
  private async loadStatisticsFallback(
    executor: Parameters<TeamBalanceRatingProvider["load"]>[0],
    playerIds: readonly string[],
  ): Promise<TeamBalanceRatingSnapshot> {
    const projection = (
      await executor
        .select({ seasonId: seasonProjectionStates.seasonId, generation: seasonProjectionStates.generation })
        .from(seasonProjectionStates)
        .innerJoin(seasons, eq(seasons.id, seasonProjectionStates.seasonId))
        .where(eq(seasonProjectionStates.status, "READY"))
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
    if (!state || state.status !== "READY") return this.loadStatisticsFallback(executor, playerIds);

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
    if (missing.length > 0) {
      const fallback = await this.loadStatisticsFallback(executor, missing);
      for (const playerId of missing) ratings.set(playerId, fallback.ratings.get(playerId) ?? null);
    }
    return { generation: state.generation, ratings };
  }
}
