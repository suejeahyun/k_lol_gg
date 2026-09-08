import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";

import { championCatalog } from "@/platform/db/schema/catalog";
import type { V2Database } from "@/platform/db/database";

import type { Champion } from "../domain/champion";
import type { ChampionListPage, ChampionListQuery, ChampionQueryRepository } from "../application/query-service";
import { championImageUrlProjection } from "./champion-image-projection";

const championSelection = {
  key: championCatalog.key,
  displayName: championCatalog.displayName,
  imageUrl: championImageUrlProjection(),
  status: championCatalog.status,
  revision: championCatalog.revision,
  createdAt: championCatalog.createdAt,
  updatedAt: championCatalog.updatedAt,
} as const;

function mapChampion(row: Champion): Champion {
  return Object.freeze({
    key: row.key,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    status: row.status,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PostgresChampionQueryRepository implements ChampionQueryRepository {
  constructor(private readonly database: V2Database) {}

  async list(query: ChampionListQuery): Promise<ChampionListPage<Champion>> {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(championCatalog.status, query.status));
    if (query.query) {
      const escaped = query.query.replace(/[\\%_]/gu, (value) => `\\${value}`);
      conditions.push(or(
        ilike(championCatalog.key, `%${escaped}%`),
        ilike(championCatalog.displayName, `%${escaped}%`),
      )!);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, totalRows] = await Promise.all([
      this.database.select(championSelection).from(championCatalog).where(where)
        .orderBy(asc(championCatalog.displayName), asc(championCatalog.key))
        .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      this.database.select({ value: count() }).from(championCatalog).where(where),
    ]);
    return Object.freeze({
      items: Object.freeze(rows.map(mapChampion)),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totalRows[0]?.value ?? 0),
    });
  }

  async find(key: string): Promise<Champion | null> {
    const row = (await this.database.select(championSelection).from(championCatalog).where(eq(championCatalog.key, key)).limit(1))[0];
    return row ? mapChampion(row) : null;
  }
}
