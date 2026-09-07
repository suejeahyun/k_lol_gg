import assert from "node:assert/strict";
import test from "node:test";

import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("0000 through 0004 install idempotently on a distinct empty PostgreSQL 18 database", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 2 });
  try {
    const version = await pool.query<{ server_version_num: string }>(
      "show server_version_num",
    );
    assert.match(version.rows[0]?.server_version_num ?? "", /^18\d{4}$/);

    const preflight = await pool.query<{ relation_count: number }>(
      `select count(*)::int as relation_count
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_toast%'
          and c.relkind in ('r', 'p')`,
    );
    assert.equal(preflight.rows[0]?.relation_count, 0, "fresh-install database must start empty");

    await applyMigrations(database);
    await applyMigrations(database);

    const migrations = await pool.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations",
    );
    assert.equal(migrations.rows[0]?.count, 5);

    const requiredTables = await pool.query<{ schema_name: string; table_name: string }>(
      `select table_schema as schema_name, table_name
         from information_schema.tables
        where (table_schema, table_name) in (
          ('auth', 'user_accounts'),
          ('auth', 'sessions'),
          ('auth', 'password_reset_requests'),
          ('registry', 'players'),
          ('registry', 'player_account_claims'),
          ('audit', 'events'),
          ('competition', 'seasons')
        )`,
    );
    assert.equal(requiredTables.rowCount, 7);

    const sessionPurpose = await pool.query<{ is_nullable: string }>(
      `select is_nullable
         from information_schema.columns
        where table_schema = 'auth' and table_name = 'sessions' and column_name = 'purpose'`,
    );
    assert.deepEqual(sessionPurpose.rows, [{ is_nullable: "NO" }]);

    const resetConstraint = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'auth'
          and t.relname = 'password_reset_requests'
          and pg_get_constraintdef(c.oid) like '%resolved_at >= requested_at%'`,
    );
    assert.equal(resetConstraint.rowCount, 1);
  } finally {
    await pool.end();
  }
});
