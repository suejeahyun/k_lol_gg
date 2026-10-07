import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { normalizePlayerIdentity, parsePlayerWriteInput } from "../../src/modules/players/domain/admin-player";
import { createDatabase } from "../../src/platform/db/database";
import { playerSeasonStats, players, seasonProjectionStates, seasons } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

/** Disposable display projections only; no match result or season lifecycle is changed. */
export async function prepareRankingCaptureFixture(pool: Pool, connectionString: string): Promise<string> {
  assert.ok(process.env.V2_SEASON_BROWSER_QA_HOLD === "true" || process.env.V2_ACCOUNT_BROWSER_QA_HOLD === "true", "Ranking capture seed requires the disposable browser hold");
  assertSafeTestDatabase({ connectionString, nodeEnv: "test", testMode: "true" });
  const seasonId = randomUUID();
  const now = new Date();
  const title = `QA 긴 이름 랭킹 ${seasonId.slice(0, 8)}`;
  const nicknames = ["WWWWWWWWWWWWWWWW", "가나다라마바사아자차카타파하가나", "WW가나WW다라WW마바WW사아"];
  const entries = nicknames.map((nickname) => {
    assert.equal(nickname.length, 16);
    const parsed = parsePlayerWriteInput({
      memberName: `QA 합성 프로필 ${"가".repeat(90)}`,
      nickname,
      tagLine: randomUUID().replaceAll("-", "").slice(-5).toUpperCase(),
    });
    assert.ok(parsed.ok, "Capture player must satisfy the actual administrator input contract");
    return { id: randomUUID(), ...parsed.value };
  });
  await createDatabase(pool).transaction(async (transaction) => {
    const [activeSeason] = await transaction.select({
      id: seasons.id, generation: seasonProjectionStates.generation, projectionStatus: seasonProjectionStates.status,
    }).from(seasons)
      .leftJoin(seasonProjectionStates, eq(seasonProjectionStates.seasonId, seasons.id))
      .where(eq(seasons.status, "ACTIVE")).limit(1);
    assert.ok(activeSeason, "Home ranking capture requires the browser fixture's ACTIVE season");
    assert.ok(activeSeason.projectionStatus === null || (activeSeason.projectionStatus === "READY" && activeSeason.generation !== null),
      "Home ranking capture cannot replace an existing non-READY projection");
    const activeGeneration = activeSeason.generation ?? 1;
    // The hold may create a fresh ACTIVE season after contracts end their own
    // seasons. Give only that missing display projection a publication pointer.
    if (activeSeason.projectionStatus === null) {
      await transaction.insert(seasonProjectionStates).values({
        seasonId: activeSeason.id, generation: activeGeneration, status: "READY",
        sourceMatchCount: 0, sourceGameCount: 0, sourceParticipantCount: 0,
        sourceChecksum: createHash("sha256").update(`synthetic-home-ranking-display:${activeSeason.id}`).digest(), calculatedAt: now,
      });
    }
    const [currentMaximum] = await transaction.select({
      participation: sql<number>`coalesce(max(${playerSeasonStats.participationCount}), 0)`.mapWith(Number),
      mvp: sql<number>`coalesce(max(${playerSeasonStats.mvpCount}), 0)`.mapWith(Number),
    }).from(playerSeasonStats).where(and(
      eq(playerSeasonStats.seasonId, activeSeason.id),
      eq(playerSeasonStats.generation, activeGeneration),
    ));
    const homeMaximum = Math.max(currentMaximum?.participation ?? 0, currentMaximum?.mvp ?? 0, 10) + 3;
    await transaction.insert(seasons).values({
      id: seasonId, name: title, nameNormalized: normalizePlayerIdentity(title), status: "ENDED",
      activatedAt: new Date(now.getTime() - 86_400_000), endedAt: now,
    });
    await transaction.insert(players).values(entries.map((entry) => ({
      ...entry, memberNameNormalized: normalizePlayerIdentity(entry.memberName),
      nicknameNormalized: normalizePlayerIdentity(entry.nickname), tagLineNormalized: normalizePlayerIdentity(entry.tagLine),
    })));
    await transaction.insert(seasonProjectionStates).values({
      seasonId, generation: 1, status: "READY", sourceMatchCount: 10, sourceGameCount: 10,
      sourceParticipantCount: 20, sourceChecksum: createHash("sha256").update(`synthetic-ranking-display:${seasonId}`).digest(), calculatedAt: now,
    });
    // Keep the established two-player ENDED-season capture unchanged.
    await transaction.insert(playerSeasonStats).values(entries.slice(0, 2).map((entry, index) => ({
      seasonId, playerId: entry.id, generation: 1, totalGames: 10, participationCount: 10,
      wins: 7 - index, losses: 3 + index, mvpCount: 5 - index, calculatedAt: now,
    })));
    // Reuse those synthetic identities in the home-selected ACTIVE season and
    // add a third long name, without replacing any existing projection row.
    await transaction.insert(playerSeasonStats).values(entries.map((entry, index) => ({
      seasonId: activeSeason.id, playerId: entry.id, generation: activeGeneration,
      totalGames: homeMaximum - index, participationCount: homeMaximum - index,
      wins: homeMaximum - index, losses: 0, mvpCount: homeMaximum - index, calculatedAt: now,
    })));
  });
  return seasonId;
}
