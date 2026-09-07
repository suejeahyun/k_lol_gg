import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  championCatalog,
  matchGames,
  matchParticipants,
  matchSeries,
  playerChampionStats,
  playerPositionStats,
  playerSeasonStats,
  players,
  seasonProjectionStates,
  seasons,
} from "@/platform/db/schema";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type {
  AdminStatisticsStatus,
  PublicPlayerStatistics,
  PublicSeasonRanking,
  PublicStatisticsSeason,
  StatisticsProjectionSummary,
  StatisticsQueryRepository,
} from "../application/ports/statistics-query-repository";
import {
  buildCanonicalSeasonRanking,
  toPublicRankingRowDto,
  winRatePercent,
  type RankingCandidate,
} from "../domain/season-statistics";

type PublicSeasonRow = typeof seasons.$inferSelect;
type ProjectionStateRow = typeof seasonProjectionStates.$inferSelect;
type EventAggregateRow = Readonly<{
  seasonId: string;
  pendingCount: string | number;
  failedCount: string | number;
  lastFailureCode: string | null;
}>;

function toPublicSeason(row: PublicSeasonRow): PublicStatisticsSeason {
  return { id: row.id, name: row.name, status: row.status as "ACTIVE" | "ENDED" };
}

function toProjectionSummary(row: ProjectionStateRow): StatisticsProjectionSummary {
  return {
    status: row.status,
    generation: row.generation,
    sourceMatchCount: row.sourceMatchCount,
    sourceGameCount: row.sourceGameCount,
    sourceParticipantCount: row.sourceParticipantCount,
    calculatedAt: row.calculatedAt?.toISOString() ?? null,
  };
}

function emptyProjection(): StatisticsProjectionSummary {
  return {
    status: "EMPTY",
    generation: 0,
    sourceMatchCount: 0,
    sourceGameCount: 0,
    sourceParticipantCount: 0,
    calculatedAt: null,
  };
}

async function selectPublicSeason(
  database: DatabaseExecutor,
  seasonId: string | null,
): Promise<PublicSeasonRow | null> {
  const rows = await database
    .select()
    .from(seasons)
    .where(and(
      inArray(seasons.status, ["ACTIVE", "ENDED"]),
      seasonId ? eq(seasons.id, seasonId) : undefined,
    ))
    .orderBy(
      sql`CASE WHEN ${seasons.status} = 'ACTIVE' THEN 0 ELSE 1 END`,
      desc(seasons.createdAt),
      asc(seasons.id),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function selectProjection(
  database: DatabaseExecutor,
  seasonId: string,
): Promise<ProjectionStateRow | null> {
  return (await database
    .select()
    .from(seasonProjectionStates)
    .where(eq(seasonProjectionStates.seasonId, seasonId))
    .limit(1))[0] ?? null;
}

export class PostgresStatisticsQueryRepository implements StatisticsQueryRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async listPublicSeasons(): Promise<readonly PublicStatisticsSeason[]> {
    const rows = await this.database
      .select()
      .from(seasons)
      .where(inArray(seasons.status, ["ACTIVE", "ENDED"]))
      .orderBy(
        sql`CASE WHEN ${seasons.status} = 'ACTIVE' THEN 0 ELSE 1 END`,
        desc(seasons.createdAt),
        asc(seasons.id),
      )
      .limit(100);
    return rows.map(toPublicSeason);
  }

  async findPublicPlayerIdForAccount(userAccountId: string): Promise<string | null> {
    return (await this.database
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.userAccountId, userAccountId), eq(players.status, "ACTIVE")))
      .limit(1))[0]?.id ?? null;
  }

  async getPublicSeasonRanking(
    seasonId: string | null,
    minimumParticipation: number,
  ): Promise<PublicSeasonRanking> {
    const season = await selectPublicSeason(this.database, seasonId);
    if (!season) return { season: null, projection: null, minimumParticipation, rankings: [] };
    const state = await selectProjection(this.database, season.id);
    if (!state || state.status !== "READY") {
      return {
        season: toPublicSeason(season),
        projection: state ? toProjectionSummary(state) : null,
        minimumParticipation,
        rankings: [],
      };
    }

    const rows = await this.database
      .select({
        seasonId: playerSeasonStats.seasonId,
        playerId: playerSeasonStats.playerId,
        generation: playerSeasonStats.generation,
        totalGames: playerSeasonStats.totalGames,
        participationCount: playerSeasonStats.participationCount,
        wins: playerSeasonStats.wins,
        losses: playerSeasonStats.losses,
        mvpCount: playerSeasonStats.mvpCount,
        playerStatus: players.status,
        nickname: players.nickname,
        nicknameNormalized: players.nicknameNormalized,
        tagLine: players.tagLine,
        tagLineNormalized: players.tagLineNormalized,
      })
      .from(playerSeasonStats)
      .innerJoin(players, eq(players.id, playerSeasonStats.playerId))
      .where(and(
        eq(playerSeasonStats.seasonId, season.id),
        eq(playerSeasonStats.generation, state.generation),
      ));
    const candidates: RankingCandidate[] = rows.map((row) => ({ ...row }));
    return {
      season: toPublicSeason(season),
      projection: toProjectionSummary(state),
      minimumParticipation,
      rankings: buildCanonicalSeasonRanking(candidates, minimumParticipation).map(toPublicRankingRowDto),
    };
  }

  async getPublicPlayerStatistics(
    playerId: string,
    seasonId: string | null,
  ): Promise<PublicPlayerStatistics | null> {
    const player = (await this.database
      .select({ id: players.id, nickname: players.nickname, tagLine: players.tagLine })
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.status, "ACTIVE")))
      .limit(1))[0];
    if (!player) return null;

    const season = await selectPublicSeason(this.database, seasonId);
    if (!season) {
      return {
        player: { id: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` },
        season: null,
        projection: null,
        summary: { totalGames: 0, participationCount: 0, wins: 0, losses: 0, winRate: 0, mvpCount: 0 },
        champions: [],
        positions: [],
        recentMatches: [],
      };
    }
    const state = await selectProjection(this.database, season.id);
    const readyGeneration = state?.status === "READY" ? state.generation : null;
    const seasonStatistic = readyGeneration === null
      ? null
      : (await this.database
        .select()
        .from(playerSeasonStats)
        .where(and(
          eq(playerSeasonStats.seasonId, season.id),
          eq(playerSeasonStats.playerId, playerId),
          eq(playerSeasonStats.generation, readyGeneration),
        ))
        .limit(1))[0] ?? null;
    const championRows = readyGeneration === null
      ? []
      : await this.database
        .select({
          championKey: playerChampionStats.championKey,
          championName: championCatalog.displayName,
          games: playerChampionStats.games,
          wins: playerChampionStats.wins,
          losses: playerChampionStats.losses,
          mvpCount: playerChampionStats.mvpCount,
        })
        .from(playerChampionStats)
        .innerJoin(championCatalog, eq(championCatalog.key, playerChampionStats.championKey))
        .where(and(
          eq(playerChampionStats.seasonId, season.id),
          eq(playerChampionStats.playerId, playerId),
          eq(playerChampionStats.generation, readyGeneration),
        ))
        .orderBy(
          desc(playerChampionStats.games),
          desc(playerChampionStats.wins),
          desc(playerChampionStats.mvpCount),
          asc(playerChampionStats.championKey),
        )
        .limit(12);
    const positionRows = readyGeneration === null
      ? []
      : await this.database
        .select({
          position: playerPositionStats.position,
          games: playerPositionStats.games,
          wins: playerPositionStats.wins,
          losses: playerPositionStats.losses,
        })
        .from(playerPositionStats)
        .where(and(
          eq(playerPositionStats.seasonId, season.id),
          eq(playerPositionStats.playerId, playerId),
          eq(playerPositionStats.generation, readyGeneration),
        ))
        .orderBy(desc(playerPositionStats.games), asc(playerPositionStats.position));
    const recentRows = await this.database
      .select({
        matchId: matchSeries.id,
        title: matchSeries.title,
        playedOn: matchSeries.playedOn,
        gameNumber: matchGames.gameNumber,
        winnerTeam: matchGames.winnerTeam,
        mvpPlayerId: matchGames.mvpPlayerId,
        championKey: matchParticipants.championKey,
        championName: championCatalog.displayName,
        team: matchParticipants.team,
        position: matchParticipants.position,
      })
      .from(matchParticipants)
      .innerJoin(matchGames, eq(matchGames.id, matchParticipants.gameId))
      .innerJoin(matchSeries, eq(matchSeries.id, matchGames.seriesId))
      .innerJoin(championCatalog, eq(championCatalog.key, matchParticipants.championKey))
      .where(and(
        eq(matchParticipants.playerId, playerId),
        eq(matchSeries.seasonId, season.id),
        eq(matchSeries.status, "PUBLISHED"),
      ))
      .orderBy(desc(matchSeries.playedOn), desc(matchSeries.startedAt), desc(matchSeries.id), desc(matchGames.gameNumber))
      .limit(10);

    const totalGames = seasonStatistic?.totalGames ?? 0;
    const wins = seasonStatistic?.wins ?? 0;
    return {
      player: { id: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` },
      season: toPublicSeason(season),
      projection: state ? toProjectionSummary(state) : null,
      summary: {
        totalGames,
        participationCount: seasonStatistic?.participationCount ?? 0,
        wins,
        losses: seasonStatistic?.losses ?? 0,
        winRate: winRatePercent(wins, totalGames),
        mvpCount: seasonStatistic?.mvpCount ?? 0,
      },
      champions: championRows.map((row) => ({ ...row, winRate: winRatePercent(row.wins, row.games) })),
      positions: positionRows.map((row) => ({ ...row, winRate: winRatePercent(row.wins, row.games) })),
      recentMatches: recentRows.map((row) => ({
        matchId: row.matchId,
        title: row.title,
        playedOn: row.playedOn,
        gameNumber: row.gameNumber,
        championKey: row.championKey,
        championName: row.championName,
        team: row.team,
        position: row.position,
        won: row.team === row.winnerTeam,
        mvp: row.mvpPlayerId === playerId,
      })),
    };
  }

  async getAdminStatus(seasonId: string | null): Promise<AdminStatisticsStatus> {
    const seasonRows = await this.database
      .select()
      .from(seasons)
      .where(seasonId ? eq(seasons.id, seasonId) : undefined)
      .orderBy(
        sql`CASE WHEN ${seasons.status} = 'ACTIVE' THEN 0 WHEN ${seasons.status} = 'ENDED' THEN 1 ELSE 2 END`,
        desc(seasons.createdAt),
        asc(seasons.id),
      )
      .limit(100);
    const seasonIds = seasonRows.map((row) => row.id);
    const stateRows = seasonIds.length === 0
      ? []
      : await this.database.select().from(seasonProjectionStates).where(inArray(seasonProjectionStates.seasonId, seasonIds));
    const stateBySeason = new Map(stateRows.map((row) => [row.seasonId, row]));
    const eventRows = seasonIds.length === 0
      ? []
      : ((await this.database.execute(sql`
          WITH affected AS (
            SELECT id, old_season_id AS season_id, status, last_error_code, updated_at
              FROM competition.match_recalculation_outbox
             WHERE old_season_id = ANY(${seasonIds}::uuid[])
               AND status IN ('PENDING', 'PROCESSING', 'FAILED')
            UNION
            SELECT id, new_season_id AS season_id, status, last_error_code, updated_at
              FROM competition.match_recalculation_outbox
             WHERE new_season_id = ANY(${seasonIds}::uuid[])
               AND status IN ('PENDING', 'PROCESSING', 'FAILED')
          )
          SELECT season_id AS "seasonId",
                 count(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING'))::int AS "pendingCount",
                 count(*) FILTER (WHERE status = 'FAILED')::int AS "failedCount",
                 (array_agg(last_error_code ORDER BY updated_at DESC, id DESC)
                   FILTER (WHERE status = 'FAILED'))[1] AS "lastFailureCode"
            FROM affected
           GROUP BY season_id
        `)).rows as EventAggregateRow[]);
    const eventBySeason = new Map(eventRows.map((row) => [row.seasonId, row]));
    const globalCounts = ((await this.database.execute(sql`
      SELECT count(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING'))::int AS "pendingCount",
             count(*) FILTER (WHERE status = 'FAILED')::int AS "failedCount"
        FROM competition.match_recalculation_outbox
       WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
    `)).rows[0] ?? { pendingCount: 0, failedCount: 0 }) as Pick<EventAggregateRow, "pendingCount" | "failedCount">;

    return {
      seasons: seasonRows.map((season) => {
        const state = stateBySeason.get(season.id);
        const affected = eventBySeason.get(season.id);
        return {
          season: { id: season.id, name: season.name, status: season.status },
          projection: state ? toProjectionSummary(state) : emptyProjection(),
          pendingEventCount: Number(affected?.pendingCount ?? 0),
          failedEventCount: Number(affected?.failedCount ?? 0),
          lastFailureCode: affected?.lastFailureCode ?? null,
        };
      }),
      pendingEventCount: Number(globalCounts.pendingCount),
      failedEventCount: Number(globalCounts.failedCount),
    };
  }
}
