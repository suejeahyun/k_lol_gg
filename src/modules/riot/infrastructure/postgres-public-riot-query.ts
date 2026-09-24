import { and, count, desc, eq, gte, lt, max, min, or, sql } from "drizzle-orm";

import { riotAccountLinks, riotSummaries, riotSyncJobs, riotMatchArchive, riotRankHistory, riotAnalyticsProgress } from "@/platform/db/schema/riot";
import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import { resolvePublicRiotProfileState } from "../application/riot-query";
import type {
  PublicRiotProfileQueryRepository,
  PublicRiotProfileState,
} from "../application/riot-query";
import { parseRiotAnalyticsCursor, parseStoredRiotMatch, RIOT_MATCH_ID_PATTERN } from "../domain/riot-match-normalizer";
import { RIOT_HISTORY_PAGE_SIZE, RIOT_HISTORY_WINDOW_DAYS, riotHistoryStart, summarizeRiotTimeline, type RiotPlayerAnalyticsDto } from "../domain/riot-player-analytics";

export class PostgresPublicRiotQueryRepository implements PublicRiotProfileQueryRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async getPublicProfileState(playerId: string): Promise<PublicRiotProfileState> {
    const row = (await this.database
      .select({
        playerId: players.id,
        linkId: riotAccountLinks.id,
        summaryPlayerId: riotSummaries.playerId,
        gameName: riotSummaries.gameName,
        tagLine: riotSummaries.tagLine,
        soloTier: riotSummaries.soloTier,
        soloRank: riotSummaries.soloRank,
        leaguePoints: riotSummaries.leaguePoints,
        wins: riotSummaries.wins,
        losses: riotSummaries.losses,
        lastSyncedAt: riotSummaries.lastSyncedAt,
      })
      .from(players)
      .leftJoin(riotAccountLinks, and(
        eq(riotAccountLinks.playerId, players.id),
        eq(riotAccountLinks.status, "CONNECTED"),
        eq(riotAccountLinks.ownerUserAccountId, players.userAccountId),
        sql`${riotAccountLinks.normalizedKey} = ${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`,
      ))
      .leftJoin(riotSummaries, and(
        eq(riotSummaries.playerId, players.id),
        eq(riotSummaries.linkId, riotAccountLinks.id),
        gte(riotSummaries.lastSyncedAt, riotAccountLinks.linkedAt),
      ))
      .where(and(eq(players.id, playerId), eq(players.status, "ACTIVE")))
      .limit(1))[0];

    if (!row) return resolvePublicRiotProfileState({ playerFound: false, linked: false, summary: null, latestSync: null, now: new Date() });
    const latestSync = row.linkId ? (await this.database
      .select({ status: riotSyncJobs.status, failureCode: riotSyncJobs.failureCode, availableAt: riotSyncJobs.availableAt })
      .from(riotSyncJobs)
      .where(eq(riotSyncJobs.linkId, row.linkId))
      .orderBy(desc(riotSyncJobs.requestedAt), desc(riotSyncJobs.id))
      .limit(1))[0] ?? null : null;
    const summary = row.summaryPlayerId && row.gameName && row.tagLine && row.lastSyncedAt
      ? {
        playerId: row.summaryPlayerId,
        riotId: `${row.gameName}#${row.tagLine}`,
        soloTier: row.soloTier,
        soloRank: row.soloRank,
        leaguePoints: row.leaguePoints,
        wins: row.wins,
        losses: row.losses,
        lastSyncedAt: row.lastSyncedAt.toISOString(),
        analytics: await this.getPublicAnalytics(playerId),
      }
      : null;
    return resolvePublicRiotProfileState({ playerFound: true, linked: Boolean(row.linkId), summary, latestSync, now: new Date() });
  }

  async getPublicAnalytics(playerId: string, cursor?: string): Promise<RiotPlayerAnalyticsDto | null> {
    const parsedCursor = parseRiotAnalyticsCursor(cursor);
    if (cursor !== undefined && !parsedCursor) return null;
    const linked = and(eq(riotAccountLinks.playerId, playerId), eq(riotAccountLinks.status, "CONNECTED"),
      eq(players.id, riotAccountLinks.playerId), eq(players.status, "ACTIVE"), eq(players.userAccountId, riotAccountLinks.ownerUserAccountId),
      sql`${riotAccountLinks.normalizedKey} = ${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`);
    const progress = (await this.database.select({ updatedAt: riotAnalyticsProgress.updatedAt, historyComplete: riotAnalyticsProgress.historyComplete })
      .from(riotAnalyticsProgress).innerJoin(riotAccountLinks, and(eq(riotAnalyticsProgress.linkId, riotAccountLinks.id), eq(riotAnalyticsProgress.linkRevision, riotAccountLinks.revision)))
      .innerJoin(players, eq(players.id, riotAccountLinks.playerId)).where(linked).limit(1))[0];
    if (!progress) return null;
    const cutoff = riotHistoryStart(new Date());
    const archiveScope = and(linked, gte(riotMatchArchive.startedAt, cutoff));
    const joins = and(eq(riotMatchArchive.linkId, riotAccountLinks.id), eq(riotMatchArchive.linkRevision, riotAccountLinks.revision));
    const rows = await this.database.select({ matchId: riotMatchArchive.matchId, startedAt: riotMatchArchive.startedAt, value: riotMatchArchive.matchJson })
      .from(riotMatchArchive).innerJoin(riotAccountLinks, joins).innerJoin(players, eq(players.id, riotAccountLinks.playerId))
      .where(and(archiveScope, parsedCursor ? or(lt(riotMatchArchive.startedAt, parsedCursor.startedAt), and(eq(riotMatchArchive.startedAt, parsedCursor.startedAt), lt(riotMatchArchive.matchId, parsedCursor.matchId))) : undefined))
      .orderBy(desc(riotMatchArchive.startedAt), desc(riotMatchArchive.matchId)).limit(RIOT_HISTORY_PAGE_SIZE + 1);
    const aggregate = (await this.database.select({ total: count(), oldest: min(riotMatchArchive.startedAt), newest: max(riotMatchArchive.startedAt), latestCollectedAt: max(riotMatchArchive.collectedAt) })
      .from(riotMatchArchive).innerJoin(riotAccountLinks, joins).innerJoin(players, eq(players.id, riotAccountLinks.playerId)).where(archiveScope))[0];
    const rankHistory = await this.database.select({ date: riotRankHistory.day, tier: riotRankHistory.tier, rank: riotRankHistory.rank,
      leaguePoints: riotRankHistory.leaguePoints, wins: riotRankHistory.wins, losses: riotRankHistory.losses, recordedAt: riotRankHistory.recordedAt })
      .from(riotRankHistory).innerJoin(riotAccountLinks, and(eq(riotRankHistory.linkId, riotAccountLinks.id), eq(riotRankHistory.linkRevision, riotAccountLinks.revision)))
      .innerJoin(players, eq(players.id, riotAccountLinks.playerId)).where(and(linked, gte(riotRankHistory.recordedAt, cutoff)))
      .orderBy(desc(riotRankHistory.day)).limit(RIOT_HISTORY_WINDOW_DAYS + 1);
    const page = rows.slice(0, RIOT_HISTORY_PAGE_SIZE), last = page.at(-1);
    const updatedAt = new Date(Math.max(progress.updatedAt.getTime(), aggregate?.latestCollectedAt ? new Date(aggregate.latestCollectedAt).getTime() : 0));
    if (updatedAt.getTime() === 0) return null;
    return {
      matches: page.flatMap((row) => { const match = parseStoredRiotMatch(row.value); return match ? [{ ...match, timelineSummary: summarizeRiotTimeline(match), timeline: null, ...(match.timeline ? { timelineDeferred: true } : {}) }] : []; }),
      rankHistory: rankHistory.map((rank) => ({ ...rank, recordedAt: rank.recordedAt.toISOString() })).reverse(),
      coverage: { oldestMatchAt: aggregate?.oldest ? new Date(aggregate.oldest).toISOString() : null,
        newestMatchAt: aggregate?.newest ? new Date(aggregate.newest).toISOString() : null, collectedGames: Number(aggregate?.total ?? 0),
        historyComplete: progress.historyComplete, historyWindowDays: RIOT_HISTORY_WINDOW_DAYS },
      updatedAt: updatedAt.toISOString(), nextCursor: rows.length > RIOT_HISTORY_PAGE_SIZE && last ? `${last.startedAt.toISOString()}|${last.matchId}` : null,
    };
  }

  async getPublicMatch(playerId: string, matchId: string) {
    if (!RIOT_MATCH_ID_PATTERN.test(matchId)) return null;
    const row = (await this.database.select({ value: riotMatchArchive.matchJson }).from(riotMatchArchive)
      .innerJoin(riotAccountLinks, and(eq(riotMatchArchive.linkId, riotAccountLinks.id), eq(riotMatchArchive.linkRevision, riotAccountLinks.revision), eq(riotAccountLinks.status, "CONNECTED")))
      .innerJoin(players, and(eq(players.id, riotAccountLinks.playerId), eq(players.status, "ACTIVE"), eq(players.userAccountId, riotAccountLinks.ownerUserAccountId),
        sql`${riotAccountLinks.normalizedKey} = ${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`))
      .where(and(eq(players.id, playerId), eq(riotMatchArchive.matchId, matchId), gte(riotMatchArchive.startedAt, riotHistoryStart(new Date())))).limit(1))[0];
    return row ? parseStoredRiotMatch(row.value) : null;
  }
}
