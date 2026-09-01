import { and, asc, count, eq, like, or, sql } from "drizzle-orm";

import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { PlayerRepository } from "../application/ports/player-repository";
import type { PlayerCatalogQuery, PlayerProfile, PlayerSummary } from "../domain/player";

const maximumSearchResults = 50;
const maximumPageSize = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function buildSearchPredicate(normalized: string) {
  const activePlayer = eq(players.status, "ACTIVE");
  if (!normalized) return activePlayer;

  const prefix = escapeLikePrefix(normalized);
  const normalizedRiotId = sql<string>`${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`;

  return and(
    activePlayer,
    or(
      eq(players.nicknameNormalized, normalized),
      like(players.nicknameNormalized, prefix),
      like(normalizedRiotId, prefix),
    ),
  );
}

export class PostgresPlayerRepository implements PlayerRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async search(query: string): Promise<readonly PlayerSummary[]> {
    const normalized = normalizeIdentity(query);
    const predicate = buildSearchPredicate(normalized);

    const rows = await this.database
      .select()
      .from(players)
      .where(predicate)
      .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized))
      .limit(maximumSearchResults);

    return rows.map(toSummary);
  }

  async getCatalog(query: PlayerCatalogQuery) {
    const normalized = normalizeIdentity(query.query);
    const predicate = buildSearchPredicate(normalized);
    const pageSize = Math.max(1, Math.min(maximumPageSize, Math.trunc(query.pageSize)));
    const requestedPage = Math.max(1, Math.trunc(query.page));

    const totalRows = await this.database
      .select({ value: count() })
      .from(players)
      .where(predicate);
    const totalCount = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);

    const rows = await this.database
      .select()
      .from(players)
      .where(predicate)
      .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized))
      .limit(pageSize)
      .offset((currentPage - 1) * pageSize);

    return {
      items: rows.map(toSummary),
      totalCount,
      currentPage,
      totalPages,
      pageSize,
    };
  }

  async findById(id: string): Promise<PlayerProfile | null> {
    if (!uuidPattern.test(id)) return null;

    const rows = await this.database
      .select()
      .from(players)
      .where(and(eq(players.id, id), eq(players.status, "ACTIVE")))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      displayName: row.nickname,
      riotId: `${row.nickname}#${row.tagLine}`,
      currentTier: row.currentTier,
      peakTier: row.peakTier,
      joinedAt: row.createdAt,
      seasonStats: null,
      positionStats: [],
      championStats: [],
      recentMatches: [],
    };
  }
}
