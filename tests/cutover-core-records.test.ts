import assert from "node:assert/strict";
import test from "node:test";

import {
  importV1CoreRecords,
  V1_CORE_RECORD_IMPORT_STEPS,
} from "../scripts/cutover/import-v1-core-records";
import type { CutoverClient } from "../scripts/cutover/types";

function fakeClient(sourceCounts: Readonly<Record<string, number>>, failingIntegrity?: string) {
  const targetCounts = new Map<string, number>();
  const queries: string[] = [];
  const client = {
    async query(statement: unknown) {
      const sql = String(statement);
      queries.push(sql);

      const integrity = sql.match(/\/\* integrity:([^*]+) \*\//)?.[1];
      if (integrity) {
        return { rows: [{ count: integrity === failingIntegrity ? "1" : "0" }], rowCount: 1 };
      }

      const count = sql.match(/\/\* count:([^:]+):(source|target) \*\//);
      if (count) {
        const [, name, side] = count;
        const value = side === "source" ? sourceCounts[name!] ?? 0 : targetCounts.get(name!) ?? 0;
        return { rows: [{ count: String(value) }], rowCount: 1 };
      }

      const imported = sql.match(/\/\* import:([^*]+) \*\//)?.[1];
      if (imported) {
        targetCounts.set(imported, sourceCounts[imported] ?? 0);
        return { rows: [], rowCount: sourceCounts[imported] ?? 0 };
      }

      throw new Error(`Unexpected SQL in fake cutover client: ${sql.slice(0, 80)}`);
    },
  } as unknown as CutoverClient;

  return { client, queries };
}

test("core record import is externally transactional and idempotent", async () => {
  const counts = Object.fromEntries(V1_CORE_RECORD_IMPORT_STEPS.map((step, index) => [step.name, index + 1]));
  const { client, queries } = fakeClient(counts);

  const first = await importV1CoreRecords(client);
  const second = await importV1CoreRecords(client);

  assert.deepEqual(first.map((step) => step.insertedCount), V1_CORE_RECORD_IMPORT_STEPS.map((_, index) => index + 1));
  assert.deepEqual(second.map((step) => step.insertedCount), V1_CORE_RECORD_IMPORT_STEPS.map(() => 0));
  assert.equal(queries.some((sql) => /\b(begin|commit|rollback)\b/iu.test(sql)), false);
  assert.equal(queries.filter((sql) => sql.includes("on conflict")).length, V1_CORE_RECORD_IMPORT_STEPS.length * 2);
});

test("core record import uses qualified V1 sources and the shared legacy UUID mapping", () => {
  const sql = V1_CORE_RECORD_IMPORT_STEPS.map((step) => step.importSql).join("\n");
  for (const table of [
    "Champion", "Season", "MatchSeries", "MatchGame", "MatchParticipant",
    "PlayerSeasonStat", "PlayerChampionStat", "PlayerPositionStat",
  ]) {
    assert.match(sql, new RegExp(`public\\.\"${table}\"`));
  }
  for (const kind of [
    "registry.players",
    "competition.seasons",
    "competition.match_series",
    "competition.match_games",
    "competition.match_participants",
  ]) {
    assert.ok(sql.includes(`pg_temp.klol_legacy_uuid('${kind}'`), kind);
  }
  assert.match(sql, /V1_COMPAT_1/);
  assert.match(sql, /WINNER_SCORE_KDA_PLAYER_ID_V1/);
});

test("integrity failure stops before the first write", async () => {
  const { client, queries } = fakeClient({}, "registry player mapping");
  await assert.rejects(() => importV1CoreRecords(client), /registry player mapping/);
  assert.equal(queries.some((sql) => sql.includes("/* import:")), false);
});
