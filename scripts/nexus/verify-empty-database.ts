import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { bootstrapEmptyNexusDatabase } from "./empty-database";
import { seedNexusReferenceCatalog } from "./reference-catalog";

// This verifier creates its own uniquely named disposable database on a local
// PostgreSQL cluster. It never migrates or clears the configured application DB.
const configured = new URL(process.env.NEXUS_DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)) throw new Error("NEXUS database verification requires a loopback PostgreSQL cluster.");
const databaseName = `nexus_test_${randomBytes(8).toString("hex")}`;
const adminUrl = new URL(configured); adminUrl.pathname = "/postgres";
const testUrl = new URL(configured); testUrl.pathname = `/${databaseName}`;
const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
let created = false;
let pool: Pool | undefined;
try {
  await admin.query(`create database "${databaseName}"`);
  created = true;
  pool = new Pool({ connectionString: testUrl.toString(), max: 1 });
  const fresh = await bootstrapEmptyNexusDatabase(pool, databaseName);
  assert.equal(fresh.state, "initialized");
  assert.equal(fresh.businessRows, 0);
  assert.ok(fresh.migrationCount >= 50);
  assert.ok(fresh.emptyBusinessTables > 100);
  const replay = await bootstrapEmptyNexusDatabase(pool, databaseName);
  assert.equal(replay.state, "already-initialized");
  assert.equal(replay.migrationCount, fresh.migrationCount);
  const reference = await seedNexusReferenceCatalog(pool, databaseName);
  assert.equal(reference.inserted, 173);
  assert.equal(reference.communityRowsCreated, 0);
  await pool.query("update catalog.champions set display_name = 'Synthetic preserved title', status = 'INACTIVE', revision = 1 where key = 'annie'");
  const referenceReplay = await seedNexusReferenceCatalog(pool, databaseName);
  assert.equal(referenceReplay.inserted, 0);
  assert.equal(referenceReplay.existingPreserved, 173);
  assert.deepEqual((await pool.query("select display_name, status, revision::int from catalog.champions where key = 'annie'")).rows, [{ display_name: "Synthetic preserved title", status: "INACTIVE", revision: 1 }]);
  await assert.rejects(() => bootstrapEmptyNexusDatabase(pool!, "different_database"), /confirmed target/);
  const sentinelId = randomUUID();
  await pool.query("insert into auth.user_accounts (id, login_id, login_id_normalized) values ($1, 'nexus_synthetic_sentinel', 'nexus_synthetic_sentinel')", [sentinelId]);
  await assert.rejects(() => bootstrapEmptyNexusDatabase(pool!, databaseName), /contains existing data/);
  const preserved = await pool.query("select id from auth.user_accounts");
  assert.deepEqual(preserved.rows, [{ id: sentinelId }]);
  console.log(JSON.stringify({ checks: ["fresh-migrations", "empty-business-data", "idempotent-empty-replay", "wrong-target-refused", "nonempty-refused", "sentinel-preserved", "pinned-reference-only", "reference-idempotence", "administrator-reference-edits-preserved"], migrationCount: fresh.migrationCount, emptyBusinessTables: fresh.emptyBusinessTables, referenceVersion: reference.version, referenceCount: reference.inserted, passed: 9 }, null, 2));
} finally {
  await pool?.end();
  if (created) await admin.query(`drop database "${databaseName}"`);
  await admin.end();
}
