import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import test from "node:test";
import { Pool } from "pg";

import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations, defaultMigrationsFolder } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("0041 fresh install, populated 0040 upgrade and reapply preserve enrollment history", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const temporaryRoot = resolve(".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(join(temporaryRoot, "inhouse-migration-"));
  const journal = JSON.parse(await readFile(join(defaultMigrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const migrationIndex = journal.entries.findIndex((entry) => entry.tag === "0041_clever_skullbuster");
  assert.ok(migrationIndex > 0);
  try {
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, migrationIndex) }));
    for (const entry of journal.entries.slice(0, migrationIndex)) await copyFile(join(defaultMigrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    for (const upgrade of [false, true]) {
      const databaseName = `klol_v2_test_inhouse_${randomBytes(8).toString("hex")}`;
      assert.match(databaseName, /^klol_v2_test_inhouse_[a-f0-9]{16}$/u);
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const url = new URL(connectionString);
      url.pathname = `/${databaseName}`;
      assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
      const { database, pool } = createDatabaseHandle(url.toString(), { max: 1 });
      const seasonId = randomUUID();
      const pendingId = randomUUID();
      try {
        if (upgrade) {
          await applyMigrations(database, folder);
          await pool.query("insert into competition.seasons (id, name, name_normalized, status, activated_at) values ($1, '합성 이관', '합성 이관', 'ACTIVE', now())", [seasonId]);
          await pool.query(`insert into competition.season_kakao_pending_applications
            (id, season_id, apply_date, recruit_no, slot_no, supplied_name, main_position, reserve, match_state, status, source_reference_hash, source_room_id_hash, source_mode)
            values ($1,$2,'2026-09-21',1,1,'합성 참가자','MID',false,'UNMATCHED','ACTIVE',$3,$4,'RIFT')`, [pendingId, seasonId, randomBytes(32), randomBytes(32)]);
        }
        await applyMigrations(database);
        await applyMigrations(database);
        assert.equal(Number((await pool.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count), journal.entries.length);
        const states = (await pool.query("select enumlabel from pg_enum where enumtypid = 'competition.season_inhouse_round_status'::regtype")).rows.map((row) => row.enumlabel);
        assert.ok(states.includes("CLOSED"));
        if (upgrade) {
          const before = (await pool.query("select * from competition.season_kakao_pending_applications where id=$1", [pendingId])).rows[0];
          assert.equal(before.supplied_name, "합성 참가자");
          assert.equal(before.status, "ACTIVE");
          assert.equal(before.link_reason, null);
          await pool.query("update competition.season_kakao_pending_applications set status='CANCELLED', cancelled_at=now() where id=$1", [pendingId]);
          await pool.query(`insert into competition.season_kakao_pending_applications
            (id, season_id, apply_date, recruit_no, slot_no, supplied_name, main_position, reserve, match_state, status, source_reference_hash, source_room_id_hash, source_mode)
            select $1, season_id, apply_date, recruit_no, slot_no, '합성 새 참가자', main_position, reserve, match_state, 'ACTIVE', source_reference_hash, source_room_id_hash, source_mode
            from competition.season_kakao_pending_applications where id=$2`, [randomUUID(), pendingId]);
          assert.equal(Number((await pool.query("select count(*) from competition.season_kakao_pending_applications")).rows[0].count), 2);
        }
      } finally {
        await pool.end();
        await admin.query(`DROP DATABASE "${databaseName}"`);
      }
    }
  } finally {
    await admin.end();
    const location = relative(temporaryRoot, resolve(folder));
    assert.ok(location.startsWith("inhouse-migration-") && !location.includes(".."));
    await rm(folder, { recursive: true, force: true });
  }
});
