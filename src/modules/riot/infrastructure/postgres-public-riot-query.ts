import { and, eq } from "drizzle-orm";

import { riotAccountLinks, riotSummaries } from "@/platform/db/schema/riot";
import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

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

    if (!row) return { kind: "PLAYER_NOT_FOUND" };
    if (!row.linkId) return { kind: "UNLINKED" };
    if (!row.summaryPlayerId || !row.gameName || !row.tagLine || !row.lastSyncedAt) {
      return { kind: "PENDING_SYNC" };
    }
    return {
      kind: "READY",
      summary: {
        playerId: row.summaryPlayerId,
        riotId: `${row.gameName}#${row.tagLine}`,
        soloTier: row.soloTier,
        soloRank: row.soloRank,
        leaguePoints: row.leaguePoints,
        wins: row.wins,
        losses: row.losses,
        lastSyncedAt: row.lastSyncedAt.toISOString(),
      },
    };
  }
}
