import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { normalizePlayerIdentity, parsePlayerWriteInput } from "../../src/modules/players/domain/admin-player";
import { createDatabase } from "../../src/platform/db/database";
import { playerSeasonStats, players, seasonProjectionStates, seasons } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

/** Synthetic display rows only; no match result or operational season is changed. */
export async function prepareRankingCaptureFixture(pool: Pool, connectionString: string): Promise<string> {
  assert.ok(process.env.V2_SEASON_BROWSER_QA_HOLD === "true" || process.env.V2_ACCOUNT_BROWSER_QA_HOLD === "true", "Ranking capture seed requires the disposable browser hold");
  assertSafeTestDatabase({ connectionString, nodeEnv: "test", testMode: "true" });
  const seasonId = randomUUID();
  const now = new Date();
  const title = `QA 긴 이름 랭킹 ${seasonId.slice(0, 8)}`;
  const nicknames = ["WWWWWWWWWWWWWWWW", "가나다라마바사아자차카타파하가나"];
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
    await transaction.insert(playerSeasonStats).values(entries.map((entry, index) => ({
      seasonId, playerId: entry.id, generation: 1, totalGames: 10, participationCount: 10,
      wins: 7 - index, losses: 3 + index, mvpCount: 5 - index, calculatedAt: now,
    })));
  });
  return seasonId;
}
