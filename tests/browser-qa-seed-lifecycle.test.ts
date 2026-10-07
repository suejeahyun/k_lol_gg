import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as orm from "drizzle-orm";
import ts from "typescript";

import { normalizePlayerIdentity, parsePlayerWriteInput } from "../src/modules/players/domain/admin-player";
import * as schema from "../src/platform/db/schema";
import { assertSafeTestDatabase } from "../src/platform/db/test-guard";

const guardedUrl = "postgres://fixture:synthetic@127.0.0.1:5432/klol_v2_test_qa_mock";
function evaluate<T>(source: string, globals: Record<string, unknown>): T {
  const loaded = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: loaded.exports, ...globals });
  return loaded.exports as T;
}

test("browser capture closes its pool and preserves the original error when setup fails before the server exists", async () => {
  const source = ts.createSourceFile("run-data-contracts.ts", readFileSync(new URL("../scripts/test-db/run-data-contracts.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "runSeasonBrowserQaServer");
  assert.ok(declaration);
  for (const stage of ["password", "seed"]) {
    let closed = 0;
    const failure = new Error(`synthetic ${stage} failure`);
    const loaded = evaluate<{ runSeasonBrowserQaServer(url: string): Promise<void> }>(`export ${declaration.getText(source)}`, {
      assertSafeTestDatabase, randomUUID: crypto.randomUUID, randomBytes: crypto.randomBytes,
      Pool: class { async query() { throw failure; } async end() { closed++; } },
      hashPassword: async () => { if (stage === "password") throw failure; return "synthetic-hash"; },
      base32: () => "SYNTHETIC", parseTotpEncryptionKeyring: () => ({}), encryptTotpSecret: () => ({}),
    });
    await assert.rejects(loaded.runSeasonBrowserQaServer(guardedUrl), (error) => error === failure);
    assert.equal(closed, 1, `${stage} failure must release the pool before outer cluster shutdown`);
  }
});

function rankingSeed(projection: { status: string; generation: number } | null) {
  const inserted: Array<{ table: unknown; rows: Record<string, unknown>[] }> = [];
  let selects = 0, transactions = 0;
  const transaction = {
    select() {
      const rows = selects++ === 0
        ? [{ id: "active-synthetic-season", projectionStatus: projection?.status ?? null, generation: projection?.generation ?? null }]
        : [{ participation: 27, mvp: 31 }];
      const query = { from: () => query, leftJoin: () => query, where: () => query, limit: async () => rows, then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve) };
      return query;
    },
    insert(table: unknown) { return { values: async (rows: Record<string, unknown> | Record<string, unknown>[]) => { inserted.push({ table, rows: Array.isArray(rows) ? rows : [rows] }); } }; },
  };
  const dependencies: Record<string, unknown> = {
    "node:assert/strict": assert, "node:crypto": crypto, "drizzle-orm": orm,
    "../../src/modules/players/domain/admin-player": { normalizePlayerIdentity, parsePlayerWriteInput },
    "../../src/platform/db/database": { createDatabase: () => ({ transaction: async (read: (value: object) => Promise<unknown>) => { transactions++; return read(transaction); } }) },
    "../../src/platform/db/schema": schema, "../../src/platform/db/test-guard": { assertSafeTestDatabase },
  };
  const loaded = evaluate<{ prepareRankingCaptureFixture(pool: object, url: string): Promise<string> }>(readFileSync(new URL("../scripts/test-db/prepare-ranking-capture-fixture.ts", import.meta.url), "utf8"), {
    process: { env: { V2_SEASON_BROWSER_QA_HOLD: "true" } },
    require(name: string) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  });
  return { inserted, run: (url = guardedUrl) => loaded.prepareRankingCaptureFixture({}, url), get transactions() { return transactions; } };
}

test("a new browser ACTIVE season receives only a missing display projection and coherent long-name top-three rows", async () => {
  const seed = rankingSeed(null);
  const endedSeasonId = await seed.run();
  const states = seed.inserted.filter((entry) => entry.table === schema.seasonProjectionStates).flatMap((entry) => entry.rows);
  assert.equal(states.filter((row) => row.seasonId === "active-synthetic-season" && row.status === "READY" && row.generation === 1).length, 1);
  const statistics = seed.inserted.filter((entry) => entry.table === schema.playerSeasonStats).flatMap((entry) => entry.rows);
  const ended = statistics.filter((row) => row.seasonId === endedSeasonId);
  assert.equal(ended.length, 2); assert.deepEqual(ended.map((row) => [row.totalGames, row.wins, row.losses, row.mvpCount]), [[10, 7, 3, 5], [10, 6, 4, 4]]);
  const active = statistics.filter((row) => row.seasonId === "active-synthetic-season");
  assert.equal(active.length, 3);
  assert.deepEqual(active.map((row) => row.participationCount), [34, 33, 32]);
  for (const row of active) {
    assert.equal(row.generation, 1); assert.equal(row.totalGames, Number(row.wins) + Number(row.losses));
    assert.ok(Number(row.mvpCount) <= Number(row.totalGames)); assert.ok(Number(row.participationCount) >= 10);
  }
  const players = seed.inserted.find((entry) => entry.table === schema.players)!.rows;
  assert.equal(players.length, 3); assert.ok(players.every((row) => String(row.nickname).length === 16));
});

test("an existing READY generation remains untouched and unsafe databases are refused before capture writes", async () => {
  const seed = rankingSeed({ status: "READY", generation: 9 });
  await seed.run();
  assert.equal(seed.inserted.filter((entry) => entry.table === schema.seasonProjectionStates).flatMap((entry) => entry.rows).some((row) => row.seasonId === "active-synthetic-season"), false);
  assert.ok(seed.inserted.filter((entry) => entry.table === schema.playerSeasonStats).flatMap((entry) => entry.rows).filter((row) => row.seasonId === "active-synthetic-season").every((row) => row.generation === 9));
  const unsafe = rankingSeed(null);
  await assert.rejects(unsafe.run("postgres://fixture:synthetic@example.invalid/klol_v2_test_qa_mock"), /non-loopback/u);
  assert.equal(unsafe.transactions, 0); assert.equal(unsafe.inserted.length, 0);
});
