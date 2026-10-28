import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { PostgresMmrRepository } from "../../src/modules/mmr/infrastructure/postgres-mmr-repository";
import { MMR_FORMULA_VERSION } from "../../src/modules/mmr/domain/mmr-projection";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { mmrPlayerPositionProfiles, mmrPlayerProfiles, mmrProjectionStates, players } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("position rankings sort and paginate by the same fallback score exposed to readers", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "The isolated PostgreSQL harness is required.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const name = `klol_v2_test_mmr_ranking_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_mmr_ranking_[a-f0-9]{16}$/u);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(connectionString); url.pathname = `/${name}`;
    assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
    const { database, pool } = createDatabaseHandle(url.toString(), { max: 2 });
    try {
      await applyMigrations(database);
      const now = new Date("2026-10-28T00:00:00.000Z");
      const rows = [
        { id: randomUUID(), name: "Missing position", overall: 2_000, top: null },
        { id: randomUUID(), name: "Strong position", overall: 5_000, top: 8_000 },
        { id: randomUUID(), name: "Middle position", overall: 9_000, top: 6_000 },
      ];
      await database.insert(players).values(rows.map((row, index) => ({
        id: row.id, memberName: row.name, memberNameNormalized: row.name.toLowerCase(),
        nickname: row.name, nicknameNormalized: row.name.toLowerCase(), tagLine: `R${index}`, tagLineNormalized: `r${index}`,
      })));
      await database.insert(mmrProjectionStates).values({
        key: "GLOBAL", status: "READY", generation: 1, formulaVersion: MMR_FORMULA_VERSION,
        sourceChecksum: Buffer.alloc(32, 1), calculatedAt: now,
      });
      await database.insert(mmrPlayerProfiles).values(rows.map((row) => ({
        generation: 1, playerId: row.id, overallScoreBp: row.overall, confidenceBp: 1_000,
        sampleSize: 3, formulaVersion: MMR_FORMULA_VERSION, calculatedAt: now,
      })));
      await database.insert(mmrPlayerPositionProfiles).values(rows.flatMap((row) => row.top === null ? [] : [{
        generation: 1, playerId: row.id, position: "TOP" as const, scoreBp: row.top, sampleSize: 3, calculatedAt: now,
      }]));

      const repository = new PostgresMmrRepository(database);
      const first = await repository.listPlayers({ query: "", position: "TOP", page: 1, pageSize: 2 });
      const second = await repository.listPlayers({ query: "", position: "TOP", page: 2, pageSize: 2 });
      assert.equal(first.total, 3);
      assert.equal(first.totalPages, 2);
      assert.deepEqual([...first.items, ...second.items].map((row) => row.playerId), [rows[1]!.id, rows[2]!.id, rows[0]!.id]);
      assert.deepEqual([...first.items, ...second.items].map((row) => row.positions.TOP.score), [80, 60, 20]);
      assert.equal(second.items[0]?.positions.TOP.sampleSize, 0, "fallback never invents positional experience");
      const overall = await repository.listPlayers({ query: "", position: null, page: 1, pageSize: 20 });
      assert.deepEqual(overall.items.map((row) => row.playerId), [rows[2]!.id, rows[1]!.id, rows[0]!.id]);
    } finally { await pool.end(); }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
