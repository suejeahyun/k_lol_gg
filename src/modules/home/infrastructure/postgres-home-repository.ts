import { count, eq } from "drizzle-orm";

import { matchSeries } from "@/platform/db/schema/matches";
import { players } from "@/platform/db/schema/registry";
import { seasons } from "@/platform/db/schema/seasons";
import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { HomeRepository } from "../application/ports/home-repository";
import type { HomeSnapshot } from "../domain/home-snapshot";

export class PostgresHomeRepository implements HomeRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async load(): Promise<HomeSnapshot> {
    const [playerRows, seasonRows, matchRows] = await Promise.all([
      this.database.select({ value: count() }).from(players).where(eq(players.status, "ACTIVE")),
      this.database.select({ value: count() }).from(seasons).where(eq(seasons.status, "ACTIVE")),
      this.database.select({ value: count() }).from(matchSeries).where(eq(matchSeries.status, "PUBLISHED")),
    ]);

    return {
      activePlayerCount: playerRows[0]?.value ?? 0,
      activeSeasonCount: seasonRows[0]?.value ?? 0,
      publishedMatchCount: matchRows[0]?.value ?? 0,
      feeds: {
        playerRegistry: "ready",
        season: "ready",
        recentMatches: "ready",
        recruits: "not-implemented",
        competitions: "not-implemented",
        gallery: "not-implemented",
      },
    };
  }
}
