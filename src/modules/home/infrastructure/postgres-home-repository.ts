import { count, eq } from "drizzle-orm";

import { players } from "@/platform/db/schema/registry";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { HomeRepository } from "../application/ports/home-repository";
import type { HomeSnapshot } from "../domain/home-snapshot";

export class PostgresHomeRepository implements HomeRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async load(): Promise<HomeSnapshot> {
    const rows = await this.database
      .select({ value: count() })
      .from(players)
      .where(eq(players.status, "ACTIVE"));

    return {
      activePlayerCount: rows[0]?.value ?? 0,
      feeds: {
        playerRegistry: "ready",
        season: "not-implemented",
        recentMatches: "not-implemented",
        recruits: "not-implemented",
        competitions: "not-implemented",
        gallery: "not-implemented",
      },
    };
  }
}
