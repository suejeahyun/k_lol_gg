import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, sql } from "drizzle-orm";

import { issueKakaoFormSnapshot, loadKakaoFormSnapshot, pruneExpiredKakaoFormSnapshots } from "../../src/modules/recruiting/infrastructure/kakao-form-snapshots";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { kakaoFormSnapshots } from "../../src/platform/db/schema/kakao-form-snapshots";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("Kakao short form originals are durable, scoped, reusable and expire at 06:00 KST", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const scopeHash = randomBytes(32);
  const binding = { kind: "PARTY" as const, scopeHash, targetId: randomUUID(), operatingDate: "2026-09-20", now: new Date("2026-09-20T23:00:00+09:00") };
  const original = { revision: 1, members: [{ name: "합성참가자", slotNo: 1 }], startTime: "미정" };
  try {
    await applyMigrations(database);
    const code = await database.transaction((transaction) => issueKakaoFormSnapshot(transaction, { ...binding, state: original }));
    assert.match(code, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    const load = (changes: Partial<Parameters<typeof loadKakaoFormSnapshot>[1]> = {}) => database.transaction((transaction) => loadKakaoFormSnapshot(transaction, { ...binding, code, ...changes }));
    assert.deepEqual(await load(), original);
    assert.deepEqual(await load({ code: code.toLowerCase() }), original);
    assert.equal(await database.transaction((transaction) => issueKakaoFormSnapshot(transaction, { ...binding, state: { startTime: "미정", members: [{ slotNo: 1, name: "합성참가자" }], revision: 1 } })), code);

    await t.test("scope, kind, target and operating-day binding are mandatory", async () => {
      assert.equal(await load({ scopeHash: randomBytes(32) }), null);
      assert.equal(await load({ kind: "INHOUSE" }), null);
      assert.equal(await load({ targetId: randomUUID() }), null);
      assert.equal(await load({ operatingDate: "2026-09-19" }), null);
      const changed = await database.transaction((transaction) => issueKakaoFormSnapshot(transaction, { ...binding, state: { ...original, revision: 2 } }));
      assert.notEqual(changed, code);
    });

    await t.test("concurrent readers reuse a single durable original", async () => {
      const next = { ...original, revision: 3 };
      const codes = await Promise.all(Array.from({ length: 4 }, () => database.transaction((transaction) => issueKakaoFormSnapshot(transaction, { ...binding, state: next }))));
      assert.equal(new Set(codes).size, 1);
    });

    await t.test("transaction rollback does not leave an issued code behind", async () => {
      let rolledBackCode = "";
      await assert.rejects(database.transaction(async (transaction) => {
        rolledBackCode = await issueKakaoFormSnapshot(transaction, { ...binding, state: { ...original, revision: 4 } });
        throw new Error("synthetic rollback");
      }), /synthetic rollback/);
      assert.equal(await load({ code: rolledBackCode }), null);
    });

    await t.test("database constraints fail closed even when application validation is bypassed", async () => {
      const row = {
        code: "ABCDE-23456", kind: "PARTY" as const, scopeHash, targetId: randomUUID(), operatingDate: binding.operatingDate,
        stateHash: randomBytes(32), stateJson: { synthetic: true }, createdAt: binding.now, expiresAt: new Date("2026-09-21T06:00:00+09:00"),
      };
      const constraintError = (error: unknown): boolean => {
        if (!error || typeof error !== "object") return false;
        return (error as { code?: unknown }).code === "23514" || constraintError((error as { cause?: unknown }).cause);
      };
      for (const change of [
        { code: "ABCDE-01234" }, { scopeHash: Buffer.alloc(31) }, { stateHash: Buffer.alloc(31) }, { targetId: " " },
        { stateJson: { value: "가".repeat(23_000) } }, { expiresAt: new Date("2026-09-21T06:00:00.001+09:00") },
      ]) {
        await assert.rejects(database.insert(kakaoFormSnapshots).values({ ...row, ...change }), constraintError);
      }
    });

    await t.test("midnight preserves the code but the exact 06:00 boundary rejects it", async () => {
      assert.deepEqual(await load({ now: new Date("2026-09-21T05:59:59.999+09:00") }), original);
      assert.equal(await load({ now: new Date("2026-09-21T06:00:00+09:00") }), null);
      await database.transaction((transaction) => pruneExpiredKakaoFormSnapshots(transaction, new Date("2026-09-21T06:00:00+09:00")));
      assert.equal((await database.select().from(kakaoFormSnapshots).where(eq(kakaoFormSnapshots.scopeHash, scopeHash))).length, 0);
    });

    await t.test("bounded retention cleanup never removes a live original", async () => {
      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      const codeFor = (index: number) => `ZZZZZ-ZZ${alphabet[(index >> 10) & 31]}${alphabet[(index >> 5) & 31]}${alphabet[index & 31]}`;
      await database.insert(kakaoFormSnapshots).values(Array.from({ length: 300 }, (_, index) => ({
        code: codeFor(index), kind: "PARTY" as const, scopeHash, targetId: `${binding.targetId}-${index}`, operatingDate: "2026-09-19",
        stateHash: randomBytes(32), stateJson: { synthetic: true }, createdAt: new Date("2026-09-19T06:00:00+09:00"), expiresAt: new Date("2026-09-20T06:00:00+09:00"),
      })));
      const live = await database.transaction((transaction) => issueKakaoFormSnapshot(transaction, { ...binding, state: original }));
      const expiredCount = async () => (await database.select({ count: sql<number>`count(*)::int` }).from(kakaoFormSnapshots).where(and(eq(kakaoFormSnapshots.scopeHash, scopeHash), eq(kakaoFormSnapshots.operatingDate, "2026-09-19"))))[0]?.count;
      assert.equal(await expiredCount(), 44);
      await database.transaction((transaction) => pruneExpiredKakaoFormSnapshots(transaction, binding.now));
      assert.equal(await expiredCount(), 0);
      assert.deepEqual(await load({ code: live }), original);
    });
  } finally {
    await database.delete(kakaoFormSnapshots).where(eq(kakaoFormSnapshots.scopeHash, scopeHash));
    await pool.end();
  }
});
