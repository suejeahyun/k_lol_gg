import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import type { PrivateImageStorage } from "../../src/modules/matches/application/ports/private-image-storage";
import { createStorageProbeJob } from "../../src/modules/operations/infrastructure/storage-probe-runner";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { jobNonceBindings, maintenanceRuns } from "../../src/platform/db/schema/operations";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("storage probe atomically limits concurrent jobs, rejects replay, and records synthetic storage success and failure", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  let now = new Date("2098-11-29T12:00:00+09:00");
  const objects = new Map<string, Uint8Array>([["real/content", new Uint8Array([1])]]);
  const calls: string[] = [];
  let failure: "none" | "upload" | "delete" = "none";
  const storage: PrivateImageStorage = { storageProvider: "FAKE_LOCAL",
    async stageAt(input) { calls.push(input.storageKey); objects.set(input.storageKey, input.bytes); if (failure === "upload") throw new Error("private-provider-error"); },
    async read(key) { return objects.get(key) ?? null; },
    async requestDelete(key) { if (failure === "delete") throw new Error("private-cleanup-error"); objects.delete(key); },
  };
  const input = () => ({ nonce: `synthetic_${randomUUID().replaceAll("-", "")}`, requestHashHex: createHash("sha256").update("{}").digest("hex"), requestId: randomUUID() });
  const run = createStorageProbeJob({ database, storage, now: () => now });
  const inputs = [input(), input()];
  try {
    await applyMigrations(database);
    const responses = await Promise.all(inputs.map(run));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 429]);
    assert.equal(calls.length, 1, "only the transaction winner may touch storage");
    const winningIndex = responses.findIndex((response) => response.status === 200);
    const winner = inputs[winningIndex]!;
    const success = responses[winningIndex]!;
    assert.equal(success.body.storageProvider, "FAKE_LOCAL", "synthetic success cannot be recorded as real Blob evidence");
    assert.equal((await run({ ...winner, requestId: randomUUID() })).status, 409);
    assert.equal(calls.length, 1);
    const records = await database.select().from(maintenanceRuns).where(and(eq(maintenanceRuns.jobName, "storage-probe"), inArray(maintenanceRuns.requestId, inputs.map((item) => item.requestId))));
    assert.equal(records.length, 1);
    assert.equal(records[0]!.status, "SUCCEEDED");
    assert.ok(records[0]!.completedAt);
    assert.deepEqual(records[0]!.countsJson, { uploaded: 1, verified: 1, deleted: 1, deletionVerified: 1, realStorage: 0 });
    const nonceHash = createHash("sha256").update(`storage-probe\0${winner.nonce}`).digest();
    const binding = (await database.select().from(jobNonceBindings).where(and(eq(jobNonceBindings.jobName, "storage-probe"), eq(jobNonceBindings.nonceHash, nonceHash))))[0]!;
    assert.equal(binding.requestHash.toString("hex"), winner.requestHashHex);
    assert.equal(binding.expiresAt.getTime() - binding.createdAt.getTime(), 24 * 60 * 60_000);
    assert.deepEqual([...objects.keys()], ["real/content"]);
    assert.doesNotMatch(JSON.stringify(records), new RegExp(winner.nonce, "u"));
    for (const kind of ["upload", "delete"] as const) {
      now = new Date(now.getTime() + 5 * 60_000 + 1);
      failure = kind;
      const attempt = input();
      const result = await run(attempt);
      assert.equal(result.status, 503);
      assert.equal(result.body.failureCode, kind === "upload" ? "STORAGE_ROUNDTRIP_FAILED" : "STORAGE_CLEANUP_FAILED");
      const record = (await database.select().from(maintenanceRuns).where(eq(maintenanceRuns.requestId, attempt.requestId)))[0]!;
      assert.equal(record.status, "FAILED");
      assert.ok(record.completedAt);
      assert.equal(record.failureCode, result.body.failureCode);
      assert.equal(record.countsJson.realStorage, 0);
      assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(record), /private-provider|private-cleanup/u);
      if (kind === "upload") assert.equal(objects.has(`readiness/storage/${attempt.requestId}`), false);
      else assert.equal(objects.has(`readiness/storage/${attempt.requestId}`), true, "cleanup failure must remain visible");
    }
    const unavailable = createStorageProbeJob({ database, storage: null, now: () => now });
    const noStorage = input();
    assert.equal((await unavailable(noStorage)).status, 503);
    assert.equal((await database.select().from(maintenanceRuns).where(eq(maintenanceRuns.requestId, noStorage.requestId))).length, 0);
  } finally { await pool.end(); }
});
