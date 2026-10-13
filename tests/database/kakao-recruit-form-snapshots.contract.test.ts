import assert from "node:assert/strict";
import crypto, { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, relative, resolve } from "node:path";
import test, { mock } from "node:test";

import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";

import { parseRecruitFormReference } from "../../src/modules/recruiting/domain/kakao-recruit-reference";
import { issueKakaoFormSnapshot, issueKakaoRecruitFormSnapshot, loadKakaoFormSnapshot, loadKakaoRecruitFormSnapshot, pruneExpiredKakaoRecruitFormSnapshots } from "../../src/modules/recruiting/infrastructure/kakao-form-snapshots";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations, defaultMigrationsFolder } from "../../src/platform/db/migrate";
import { kakaoFormSnapshots, kakaoRecruitCodes, kakaoRecruitFormSnapshots } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

async function isolated(work: (handle: ReturnType<typeof createDatabaseHandle>) => Promise<void>) {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const name = `klol_v2_test_recruit_codes_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_recruit_codes_[a-f0-9]{16}$/u);
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(connectionString); url.pathname = `/${name}`;
    assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
    const handle = createDatabaseHandle(url.toString(), { max: 6 });
    try { await work(handle); } finally { await handle.pool.end(); }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
}

const binding = () => ({ kind: "PARTY" as const, scopeHash: randomBytes(32), targetId: randomUUID(),
  operatingDate: "2026-10-14", now: new Date("2026-10-14T23:00:00+09:00") });
const original = { revision: 1, members: [{ name: "합성참가자", slotNo: 1 }], startTime: "미정" };

test("stable recruitment references preserve originals, serialize versions and retain identity across days", async (t) => {
  await isolated(async ({ database }) => {
    await applyMigrations(database);
    const first = binding();
    const issue = (state = original, changes: Partial<typeof first> = {}) => database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...first, ...changes, state }));
    const reference = await issue();
    const parsed = parseRecruitFormReference(reference)!;
    assert.equal(parsed.version, 1);
    const load = (code = reference, changes: Partial<Parameters<typeof loadKakaoRecruitFormSnapshot>[1]> = {}) => database.transaction((tx) => loadKakaoRecruitFormSnapshot(tx, { ...first, code, ...changes }));

    await t.test("the same state/day reuses a version without consuming or modifying its original", async () => {
      assert.equal(await issue(), reference);
      assert.deepEqual(await load(), original);
      assert.deepEqual(await load(reference.toLowerCase()), original);
      const changed = await issue({ ...original, revision: 2 });
      assert.equal(parseRecruitFormReference(changed)!.code, parsed.code);
      assert.equal(parseRecruitFormReference(changed)!.version, 2);
      assert.deepEqual(await load(), original);
      assert.equal(await issue(), reference);
    });

    await t.test("scope, real UUID, PARTY kind, operating day and complete reference are required", async () => {
      assert.equal(await load(reference, { scopeHash: randomBytes(32) }), null);
      assert.equal(await load(reference, { targetId: randomUUID() }), null);
      assert.equal(await load(reference, { kind: "INHOUSE" }), null);
      assert.equal(await load(reference, { operatingDate: "2026-10-13" }), null);
      assert.equal(await load(parsed.code), null);
      assert.equal(await load(`${parsed.code}@999`), null);
      const other = await issue(original, { targetId: randomUUID() });
      assert.notEqual(parseRecruitFormReference(other)!.code, parsed.code);
      const otherScope = await issue(original, { scopeHash: randomBytes(32) });
      assert.notEqual(parseRecruitFormReference(otherScope)!.code, parsed.code);
    });

    await t.test("simultaneous first issuance converges and different originals receive distinct versions", async () => {
      const fresh = binding();
      const issueFresh = (revision: number) => database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: { ...original, revision } }));
      const same = await Promise.all(Array.from({ length: 6 }, () => issueFresh(1)));
      assert.equal(new Set(same).size, 1);
      const different = await Promise.all([2, 3, 4, 5, 6, 7].map(issueFresh));
      const references = different.map((value) => parseRecruitFormReference(value)!);
      assert.equal(new Set(references.map(({ code }) => code)).size, 1);
      assert.deepEqual(references.map(({ version }) => version).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7]);
      for (const [index, code] of different.entries()) {
        assert.deepEqual(await database.transaction((tx) => loadKakaoRecruitFormSnapshot(tx, { ...fresh, code })), { ...original, revision: index + 2 });
      }
    });

    await t.test("a generated code collision retries without stealing another recruitment identity", async () => {
      const fresh = binding(), occupied = binding();
      await database.insert(kakaoRecruitCodes).values({ code: "22222-22222", scopeHash: occupied.scopeHash, targetId: occupied.targetId, createdAt: occupied.now });
      let calls = 0;
      const mocked = mock.method(crypto, "randomBytes", ((size: number) => Buffer.alloc(size, calls++ === 0 ? 0 : 1)) as typeof crypto.randomBytes);
      syncBuiltinESMExports();
      try {
        const value = await database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: original }));
        assert.equal(value, "33333-33333@1");
        assert.equal(calls, 2);
      } finally { mocked.mock.restore(); syncBuiltinESMExports(); }
      assert.equal((await database.select().from(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.code, "22222-22222")))[0]!.targetId, occupied.targetId);
    });

    await t.test("rollback removes initial issuance and does not advance an existing watermark", async () => {
      const fresh = binding();
      await assert.rejects(database.transaction(async (tx) => {
        await issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: original });
        throw new Error("synthetic rollback");
      }), /synthetic rollback/u);
      assert.equal((await database.select().from(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.targetId, fresh.targetId))).length, 0);
      const before = (await database.select().from(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.code, parsed.code)))[0]!;
      let rolledBack = "";
      await assert.rejects(database.transaction(async (tx) => {
        rolledBack = await issueKakaoRecruitFormSnapshot(tx, { ...first, state: { ...original, revision: 50 } });
        throw new Error("synthetic rollback");
      }), /synthetic rollback/u);
      assert.equal(await load(rolledBack), null);
      assert.deepEqual((await database.select().from(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.code, parsed.code)))[0], before);
    });

    await t.test("midnight retains originals; 06:00 expires them but preserves the code and increasing version", async () => {
      assert.deepEqual(await load(reference, { now: new Date("2026-10-15T05:59:59.999+09:00") }), original);
      const nextDay = { operatingDate: "2026-10-15", now: new Date("2026-10-15T06:00:00+09:00") };
      assert.equal(await load(reference, { now: nextDay.now }), null);
      assert.equal(await load(reference, nextDay), null);
      await database.transaction((tx) => pruneExpiredKakaoRecruitFormSnapshots(tx, nextDay.now));
      assert.equal((await database.select().from(kakaoRecruitFormSnapshots).where(eq(kakaoRecruitFormSnapshots.code, parsed.code))).length, 0);
      const watermark = (await database.select().from(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.code, parsed.code)))[0]!;
      assert.equal(watermark.lastVersion, 2);
      const latest = await issue(original, nextDay);
      assert.equal(latest, `${parsed.code}@3`);
      assert.equal(await load(reference, nextDay), null);
      assert.deepEqual(await load(latest, nextDay), original);
    });

    await t.test("retention prunes at most 256 expired originals without deleting registries or live originals", async () => {
      const fresh = binding();
      const value = await database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: original }));
      const code = parseRecruitFormReference(value)!.code;
      await database.insert(kakaoRecruitFormSnapshots).values(Array.from({ length: 300 }, (_, index) => ({
        code, version: index + 2, operatingDate: "2026-10-13", stateHash: randomBytes(32), stateJson: { synthetic: index },
        createdAt: new Date("2026-10-13T06:00:00+09:00"), expiresAt: new Date("2026-10-14T06:00:00+09:00"),
      })));
      await database.update(kakaoRecruitCodes).set({ lastVersion: 301 }).where(eq(kakaoRecruitCodes.code, code));
      const count = async () => Number((await database.select({ n: sql<number>`count(*)::int` }).from(kakaoRecruitFormSnapshots).where(and(eq(kakaoRecruitFormSnapshots.code, code), eq(kakaoRecruitFormSnapshots.operatingDate, "2026-10-13"))))[0]!.n);
      await database.transaction((tx) => pruneExpiredKakaoRecruitFormSnapshots(tx, fresh.now));
      assert.equal(await count(), 44);
      await database.transaction((tx) => pruneExpiredKakaoRecruitFormSnapshots(tx, fresh.now));
      assert.equal(await count(), 0);
      assert.deepEqual(await database.transaction((tx) => loadKakaoRecruitFormSnapshot(tx, { ...fresh, code: value })), original);
      assert.equal((await database.select().from(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.code, code)))[0]!.lastVersion, 301);
    });

    await t.test("exhausted counters fail closed while an already-issued original remains readable", async () => {
      const fresh = binding();
      const value = await database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: original }));
      const code = parseRecruitFormReference(value)!.code;
      await database.update(kakaoRecruitCodes).set({ lastVersion: Number.MAX_SAFE_INTEGER }).where(eq(kakaoRecruitCodes.code, code));
      await assert.rejects(database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: { ...original, revision: 2 } })), /KAKAO_FORM_SNAPSHOT_VERSION_EXHAUSTED/u);
      assert.equal(await database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: original })), value);
    });

    await t.test("database constraints reject invalid identities, versions, expiry and originals", async () => {
      const fresh = binding();
      const dbCode = (code: string) => (error: unknown): boolean => !!error && typeof error === "object" &&
        ((error as { code?: string }).code === code || dbCode(code)((error as { cause?: unknown }).cause));
      for (const change of [{ code: "ABCDE-01234" }, { scopeHash: Buffer.alloc(31) }, { lastVersion: -1 }, { lastVersion: 9007199254740992 }]) {
        await assert.rejects(database.insert(kakaoRecruitCodes).values({ code: "ABCDE-23456", ...fresh, createdAt: fresh.now, ...change }), dbCode("23514"));
      }
      const value = await database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...fresh, state: original }));
      const code = parseRecruitFormReference(value)!.code;
      const row = { code, version: 2, operatingDate: fresh.operatingDate, stateHash: randomBytes(32), stateJson: { synthetic: true }, createdAt: fresh.now, expiresAt: new Date("2026-10-15T06:00:00+09:00") };
      for (const change of [{ version: 0 }, { version: 9007199254740992 }, { stateHash: Buffer.alloc(31) }, { stateJson: { value: "가".repeat(23_000) } }, { expiresAt: new Date("2026-10-15T06:00:00.001+09:00") }]) {
        await assert.rejects(database.insert(kakaoRecruitFormSnapshots).values({ ...row, ...change }), dbCode("23514"));
      }
      await assert.rejects(database.insert(kakaoRecruitFormSnapshots).values({ ...row, code: "ZZZZZ-ZZZZZ" }), dbCode("23503"));
      await assert.rejects(database.delete(kakaoRecruitCodes).where(eq(kakaoRecruitCodes.code, code)), dbCode("23001"));
      assert.deepEqual(await database.transaction((tx) => loadKakaoRecruitFormSnapshot(tx, { ...fresh, code: value })), original);
    });
  });
});

test("stable recruitment migration supports fresh install, populated legacy upgrade, replay and previous writers", async () => {
  const temporaryRoot = resolve(".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(join(temporaryRoot, "recruit-code-migration-"));
  const journal = JSON.parse(await readFile(join(defaultMigrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const migrationIndex = journal.entries.findIndex((entry) => entry.tag.startsWith("0049_"));
  assert.ok(migrationIndex > 0);
  try {
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, migrationIndex) }));
    for (const entry of journal.entries.slice(0, migrationIndex)) await copyFile(join(defaultMigrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    for (const upgrade of [false, true]) {
      await isolated(async ({ database, pool }) => {
        const legacy = binding();
        let previous = "";
        if (upgrade) {
          await applyMigrations(database, folder);
          previous = await database.transaction((tx) => issueKakaoFormSnapshot(tx, { ...legacy, state: original }));
        }
        await applyMigrations(database);
        const value = await database.transaction((tx) => issueKakaoRecruitFormSnapshot(tx, { ...legacy, state: original }));
        await applyMigrations(database);
        assert.equal(Number((await pool.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count), journal.entries.length);
        assert.deepEqual(await database.transaction((tx) => loadKakaoRecruitFormSnapshot(tx, { ...legacy, code: value })), original);
        if (upgrade) {
          assert.deepEqual(await database.transaction((tx) => loadKakaoFormSnapshot(tx, { ...legacy, code: previous })), original);
          assert.equal((await database.select().from(kakaoFormSnapshots).where(eq(kakaoFormSnapshots.code, previous))).length, 1);
        }
        const previousWriter = await database.transaction((tx) => issueKakaoFormSnapshot(tx, { ...legacy, state: { ...original, revision: 2 } }));
        assert.deepEqual(await database.transaction((tx) => loadKakaoFormSnapshot(tx, { ...legacy, code: previousWriter })), { ...original, revision: 2 });
      });
    }
  } finally {
    const location = relative(temporaryRoot, resolve(folder));
    assert.ok(location.startsWith("recruit-code-migration-") && !location.includes(".."));
    await rm(folder, { recursive: true, force: true });
  }
});
