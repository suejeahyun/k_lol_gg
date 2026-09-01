import { and, asc, eq, like, or, sql } from "drizzle-orm";

import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { PlayerRepository } from "../application/ports/player-repository";
import type { PlayerSummary } from "../domain/player";

const maximumSearchResults = 50;

function normalizeIdentity(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function escapeLikePrefix(value: string): string {
  return `${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function toSummary(row: typeof players.$inferSelect): PlayerSummary {
  return {
    id: row.id,
    displayName: row.nickname,
    riotId: `${row.nickname}#${row.tagLine}`,
    mainPosition: null,
    tier: row.currentTier,
    recentMatches: null,
    winRate: null,
  };
}

export class PostgresPlayerRepository implements PlayerRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async search(query: string): Promise<readonly PlayerSummary[]> {
    const normalized = normalizeIdentity(query);
    const activePlayer = eq(players.status, "ACTIVE");
    const prefix = escapeLikePrefix(normalized);
    const normalizedRiotId = sql<string>`${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`;

    const predicate = normalized
      ? and(
          activePlayer,
          or(
            eq(players.nicknameNormalized, normalized),
            eq(players.memberNameNormalized, normalized),
            like(players.nicknameNormalized, prefix),
            like(players.memberNameNormalized, prefix),
            like(normalizedRiotId, prefix),
          ),
        )
      : activePlayer;

    const rows = await this.database
      .select()
      .from(players)
      .where(predicate)
      .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized))
      .limit(maximumSearchResults);

    return rows.map(toSummary);
  }
}
