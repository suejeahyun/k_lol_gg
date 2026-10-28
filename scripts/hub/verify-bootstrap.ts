/** Isolated local PostgreSQL validation. Never uses a production URL. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { bootstrapHubDatabase, hubBootstrapTarget } from "./empty-database";
import { createDatabase } from "../../src/platform/db/database";
import { applyMigrations, defaultMigrationsFolder } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { verifyPasswordHash } from "../../src/modules/auth/infrastructure/node-password";
import { PostgresCommunityNetworkRepository } from "../../src/modules/community-network/infrastructure/postgres-community-network-repository";

const source = assertSafeTestDatabase({ connectionString: process.env.V2_TEST_DATABASE_URL ?? "", nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
const cluster = new URL(source); cluster.pathname = "/postgres";
const admin = new Pool({ connectionString: cluster.toString(), max: 1 });
const created: string[] = [];
const pools: Pool[] = [];
const checks: string[] = [];

async function database() {
  const name = `klol_v2_test_hub_bootstrap_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_hub_bootstrap_[a-f0-9]{16}$/u);
  const url = new URL(source); url.pathname = `/${name}`;
  assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
  await admin.query(`create database "${name}"`); created.push(name);
  const pool = new Pool({ connectionString: url.toString(), max: 1, statement_timeout: 30_000 }); pools.push(pool);
  assert.equal(hubBootstrapTarget({ NEXT_PUBLIC_SERVICE_ID: "hub", HUB_DATABASE_URL: url.toString(), HUB_DATABASE_NAME: name, HUB_BOOTSTRAP_CONFIRM: "CREATE_EMPTY_HUB" }).databaseName, name);
  return { pool, name };
}

try {
  const fresh = await database();
  const password = `Synthetic-${randomBytes(24).toString("base64url")}!1a`;
  const administrator = { loginId: "synthetic-hub-owner", password };
  const initialized = await bootstrapHubDatabase(fresh.pool, fresh.name, administrator);
  assert.equal(initialized.state, "initialized");
  assert.equal(initialized.migrationCount, readMigrationFiles({ migrationsFolder: defaultMigrationsFolder }).length);
  const accounts = (await fresh.pool.query("select role, status, must_change_password, password_hash from auth.user_accounts")).rows;
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].role, "SUPER_ADMIN"); assert.equal(accounts[0].status, "APPROVED"); assert.equal(accounts[0].must_change_password, true);
  assert.equal((await verifyPasswordHash(password, accounts[0].password_hash)).matches, true);
  const snapshot = await new PostgresCommunityNetworkRepository(createDatabase(fresh.pool)).getSnapshot();
  assert.equal(snapshot.communities.length, 2); assert.equal(snapshot.rooms.length, 4);
  assert.equal(snapshot.revision, 1); assert.equal(snapshot.connectionStatus, "UNVERIFIED"); assert.equal(snapshot.routingStatus, "NOT_APPLIED");
  checks.push("fresh migrations, independent forced-change owner, 2 sites and 4 rooms");

  await fresh.pool.query("update community_network.communities set description = 'Synthetic changed description' where slug = 'klol'");
  const replay = await bootstrapHubDatabase(fresh.pool, fresh.name, { ...administrator, password: "Different-Synthetic-Password-123!" });
  assert.equal(replay.state, "already-initialized"); assert.equal(replay.modified, false);
  assert.equal((await fresh.pool.query("select password_hash from auth.user_accounts")).rows[0].password_hash, accounts[0].password_hash);
  assert.equal((await fresh.pool.query("select description from community_network.communities where slug = 'klol'")).rows[0].description, "Synthetic changed description");
  assert.equal(Number((await fresh.pool.query("select count(*)::int as count from audit.events where action = 'HUB_BOOTSTRAP_COMPLETED'")).rows[0].count), 1);
  checks.push("idempotent replay preserves password and later registry edits");
  await assert.rejects(() => bootstrapHubDatabase(fresh.pool, "wrong-database", administrator), /confirmed target/);
  checks.push("connected database identity mismatch refused");

  const occupied = await database();
  await applyMigrations(createDatabase(occupied.pool));
  await occupied.pool.query("insert into auth.user_accounts (id, login_id, login_id_normalized, role, status) values ($1, 'synthetic-existing', 'synthetic-existing', 'USER', 'APPROVED')", [randomUUID()]);
  await assert.rejects(() => bootstrapHubDatabase(occupied.pool, occupied.name, administrator), /contains unexpected existing data/);
  assert.deepEqual((await occupied.pool.query("select role from auth.user_accounts")).rows.map((row) => row.role), ["USER"]);
  assert.equal((await occupied.pool.query("select brand_name from operations.site_settings")).rows[0].brand_name, "K-LOL.GG");
  checks.push("existing accounts are never promoted or overwritten");

  const resumable = await database();
  await applyMigrations(createDatabase(resumable.pool));
  assert.equal((await bootstrapHubDatabase(resumable.pool, resumable.name, administrator)).state, "initialized");
  checks.push("exact migrated empty database resumes after interrupted setup");
  await resumable.pool.query("update operations.site_settings set brand_name = 'NEXUS.GG'");
  await assert.rejects(() => bootstrapHubDatabase(resumable.pool, resumable.name, administrator), /different service/);
  checks.push("foreign service identity refused");
  console.log(JSON.stringify({ passed: checks.length, checks, isolated: true, productionAccess: false }, null, 2));
} finally {
  for (const pool of pools) await pool.end();
  for (const name of created) {
    assert.match(name, /^klol_v2_test_hub_bootstrap_[a-f0-9]{16}$/u);
    await admin.query(`drop database "${name}" with (force)`);
  }
  await admin.end();
}
