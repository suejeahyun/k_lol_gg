import { and, desc, eq } from "drizzle-orm";

import { riotAccountLinks, riotSummaries, riotSyncJobs } from "@/platform/db/schema/riot";
import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import { resolvePublicRiotProfileState } from "../application/riot-query";
import type {
  PublicRiotProfileQueryRepository,
  PublicRiotProfileState,
} from "../application/riot-query";

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
      ))
      .leftJoin(riotSummaries, and(
        eq(riotSummaries.playerId, players.id),
        eq(riotSummaries.linkId, riotAccountLinks.id),
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
      }
      : null;
    return resolvePublicRiotProfileState({ playerFound: true, linked: Boolean(row.linkId), summary, latestSync, now: new Date() });
  }
}
