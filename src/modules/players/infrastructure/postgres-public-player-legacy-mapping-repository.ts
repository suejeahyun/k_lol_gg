import { and, eq } from "drizzle-orm";

import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { PublicPlayerLegacyMappingRepository } from "../application/ports/public-player-legacy-mapping-repository";

export class PostgresPublicPlayerLegacyMappingRepository
  implements PublicPlayerLegacyMappingRepository
{
  constructor(private readonly database: DatabaseExecutor) {}

  async findPublicUuidByLegacyId(legacyId: number): Promise<string | null> {
    const rows = await this.database
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.legacyId, legacyId), eq(players.status, "ACTIVE")))
      .limit(1);

    return rows[0]?.id ?? null;
  }
}
