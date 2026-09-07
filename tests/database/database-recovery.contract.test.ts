import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Pool } from "pg";

import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const execFile = promisify(execFileCallback);
const workspaceRoot = resolve(import.meta.dirname, "../..");
const recoveryRoot = resolve(workspaceRoot, ".tmp/postgres-recovery");

function postgresExecutable(name: "pg_dump" | "pg_restore"): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return process.env.PG_BIN_DIR
    ? join(resolve(process.env.PG_BIN_DIR), `${name}${suffix}`)
    : name;
}

function safeToolEnvironment(password: string): NodeJS.ProcessEnv {
  const allowed = new Set([
    "comspec", "home", "lang", "lc_all", "localappdata", "path", "pathext",
    "systemdrive", "systemroot", "temp", "tmp", "userprofile", "windir",
  ]);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) => value !== undefined && allowed.has(name.toLocaleLowerCase("en-US")),
    ),
  );
  return { ...environment, NODE_ENV: "test", PGPASSWORD: password } as NodeJS.ProcessEnv;
}

function assertDisposablePath(candidate: string): string {
  const resolvedCandidate = resolve(candidate);
  const parentRelative = relative(recoveryRoot, resolvedCandidate);
  if (
    !parentRelative ||
    parentRelative.startsWith("..") ||
    isAbsolute(parentRelative) ||
    !basename(resolvedCandidate).startsWith("klol-v2-recovery-")
  ) {
    throw new Error(`Refusing unsafe recovery drill path: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function createTargetDatabase(source: URL): Promise<Readonly<{
  connectionString: string;
  databaseName: string;
  dispose: () => Promise<void>;
}>> {
  const databaseName = `klol_v2_test_recovery_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({
    host: source.hostname,
    port: Number.parseInt(source.port || "5432", 10),
    user: decodeURIComponent(source.username),
    password: decodeURIComponent(source.password),
    database: "postgres",
    max: 1,
  });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    created = true;
  } catch (error) {
    await admin.end();
    throw error;
  }

  const target = new URL(source);
  target.pathname = `/${databaseName}`;
  assertSafeTestDatabase({
    connectionString: target.toString(),
    nodeEnv: "test",
    testMode: "true",
  });

  return {
    connectionString: target.toString(),
    databaseName,
    async dispose() {
      try {
        if (created) {
          await admin.query(
            "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
            [databaseName],
          );
          await admin.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
          created = false;
        }
      } finally {
        await admin.end();
      }
    },
  };
}

async function schemaFingerprint(pool: Pool): Promise<Readonly<{ count: number; sha256: string }>> {
  const definitions = await pool.query<{ definition: string }>(`
    with definitions as (
      select format('column|%I.%I|%s|%I|%s|%s|%s|%s',
                    table_schema, table_name, ordinal_position, column_name,
                    data_type, udt_name, is_nullable, coalesce(column_default, '')) as definition
        from information_schema.columns
       where table_schema not in ('pg_catalog', 'information_schema')
      union all
      select format('constraint|%I.%I|%I|%s|%s',
                    n.nspname, t.relname, c.conname, c.contype, pg_get_constraintdef(c.oid, true))
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname not in ('pg_catalog', 'information_schema')
      union all
      select format('index|%I.%I|%I|%s', schemaname, tablename, indexname, indexdef)
        from pg_indexes
       where schemaname not in ('pg_catalog', 'information_schema')
      union all
      select format('enum|%I.%I|%s|%s', n.nspname, t.typname, e.enumsortorder, e.enumlabel)
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace n on n.oid = t.typnamespace
       where n.nspname not in ('pg_catalog', 'information_schema')
    )
    select definition from definitions order by definition
  `);
  // pg_dump may deparse an equivalent varchar[] CHECK with per-element text casts.
  // Strip only these display casts before hashing the catalog structure.
  const normalized = definitions.rows.map((row) => row.definition
    .replaceAll("::character varying", "")
    .replaceAll("::text[]", "")
    .replaceAll("::text", ""));
  return {
    count: definitions.rowCount ?? 0,
    sha256: createHash("sha256")
      .update(normalized.join("\n"))
      .digest("hex"),
  };
}

async function tableCounts(pool: Pool): Promise<Readonly<Record<string, number>>> {
  const tables = await pool.query<{ schema_name: string; table_name: string }>(`
    select table_schema as schema_name, table_name
      from information_schema.tables
     where table_type = 'BASE TABLE'
       and table_schema not in ('pg_catalog', 'information_schema')
     order by table_schema, table_name
  `);
  const entries: Array<readonly [string, number]> = [];
  for (const table of tables.rows) {
    const name = `${table.schema_name}.${table.table_name}`;
    const result = await pool.query<{ count: number }>(
      `select count(*)::int as count from ${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.table_name)}`,
    );
    entries.push([name, result.rows[0]?.count ?? -1]);
  }
  return Object.fromEntries(entries);
}

async function fixtureProjection(pool: Pool, accountId: string, playerId: string): Promise<unknown> {
  const result = await pool.query<{ projection: unknown }>(`
    select jsonb_build_object(
      'account', jsonb_build_object(
        'id', a.id, 'loginId', a.login_id, 'role', a.role, 'status', a.status,
        'legacyId', a.legacy_id, 'revision', a.revision
      ),
      'player', jsonb_build_object(
        'id', p.id, 'accountId', p.user_account_id, 'nickname', p.nickname,
        'tagLine', p.tag_line, 'status', p.status, 'legacyId', p.legacy_id,
        'revision', p.revision
      ),
      'auditCount', (select count(*) from audit.events e where e.actor_user_account_id = a.id)
    ) as projection
      from auth.user_accounts a
      join registry.players p on p.user_account_id = a.id
     where a.id = $1 and p.id = $2
  `, [accountId, playerId]);
  assert.equal(result.rowCount, 1);
  return result.rows[0]?.projection;
}

test("PostgreSQL custom archive restores the complete schema, data and migration head", { timeout: 120_000 }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  const sourceUrl = assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });
  const { database: sourceDatabase, pool: sourcePool } = createDatabaseHandle(connectionString, { max: 2 });
  await applyMigrations(sourceDatabase);

  const suffix = randomBytes(6).toString("hex");
  const accountId = randomUUID();
  const playerId = randomUUID();
  await sourcePool.query(
    `insert into auth.user_accounts
       (id, legacy_id, login_id, login_id_normalized, role, status)
     values ($1, $2, $3, $3, 'USER', 'APPROVED')`,
    [accountId, 900_000_000 + Number.parseInt(suffix.slice(0, 5), 16), `recovery-${suffix}`],
  );
  await sourcePool.query(
    `insert into registry.players
       (id, legacy_id, user_account_id, member_name, member_name_normalized,
        nickname, nickname_normalized, tag_line, tag_line_normalized)
     values ($1, $2, $3, $4, $4, $5, $6, 'V2', 'v2')`,
    [playerId, 910_000_000 + Number.parseInt(suffix.slice(1, 6), 16), accountId, `복구검증-${suffix}`, `Recovery${suffix}`, `recovery${suffix}`],
  );
  await sourcePool.query(
    `insert into audit.events (request_id, actor_user_account_id, action, target_type, target_id, metadata_json)
     values ($1, $2, 'RECOVERY_DRILL_FIXTURE_CREATED', 'PLAYER', $3, '{"synthetic":true}'::jsonb)`,
    [randomUUID(), accountId, playerId],
  );

  const sourceFingerprint = await schemaFingerprint(sourcePool);
  const sourceCounts = await tableCounts(sourcePool);
  const sourceFixture = await fixtureProjection(sourcePool, accountId, playerId);
  const migrationCount = await sourcePool.query<{ count: number }>(
    "select count(*)::int as count from drizzle.__drizzle_migrations",
  );
  const journal = JSON.parse(
    await readFile(resolve(workspaceRoot, "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries?: Array<{ tag?: string }> };
  assert.equal(migrationCount.rows[0]?.count, journal.entries?.length);

  await mkdir(recoveryRoot, { recursive: true });
  const runDirectory = assertDisposablePath(await mkdtemp(join(recoveryRoot, "/klol-v2-recovery-")));
  const archivePath = resolve(runDirectory, "database.dump");
  const target = await createTargetDatabase(sourceUrl);
  const toolEnvironment = safeToolEnvironment(decodeURIComponent(sourceUrl.password));
  const commonArgs = [
    "--host", sourceUrl.hostname,
    "--port", sourceUrl.port || "5432",
    "--username", decodeURIComponent(sourceUrl.username),
  ];

  let targetPool: Pool | undefined;
  try {
    const dumpVersion = await execFile(postgresExecutable("pg_dump"), ["--version"], { env: toolEnvironment, windowsHide: true });
    const restoreVersion = await execFile(postgresExecutable("pg_restore"), ["--version"], { env: toolEnvironment, windowsHide: true });
    assert.match(dumpVersion.stdout, /\b18(?:\.\d+)?\b/);
    assert.match(restoreVersion.stdout, /\b18(?:\.\d+)?\b/);

    await execFile(postgresExecutable("pg_dump"), [
      ...commonArgs,
      "--dbname", decodeURIComponent(sourceUrl.pathname.slice(1)),
      "--file", archivePath,
      "--format", "custom",
      "--no-owner",
      "--no-privileges",
    ], { env: toolEnvironment, windowsHide: true });
    const archive = await stat(archivePath);
    assert.ok(archive.size > 0);
    const archiveSha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");

    const archiveList = await execFile(postgresExecutable("pg_restore"), ["--list", archivePath], {
      env: toolEnvironment,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.match(archiveList.stdout, /SCHEMA .* auth/);
    assert.match(archiveList.stdout, /TABLE DATA .* players/);

    await execFile(postgresExecutable("pg_restore"), [
      ...commonArgs,
      "--dbname", target.databaseName,
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-privileges",
      archivePath,
    ], { env: toolEnvironment, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });

    const targetHandle = createDatabaseHandle(target.connectionString, { max: 2 });
    targetPool = targetHandle.pool;
    assert.deepEqual(await schemaFingerprint(targetPool), sourceFingerprint);
    assert.deepEqual(await tableCounts(targetPool), sourceCounts);
    assert.deepEqual(await fixtureProjection(targetPool, accountId, playerId), sourceFixture);

    const invalidForeignKeys = await targetPool.query<{ count: number }>(`
      select count(*)::int as count
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
       where c.contype = 'f'
         and n.nspname not in ('pg_catalog', 'information_schema')
         and not c.convalidated
    `);
    assert.equal(invalidForeignKeys.rows[0]?.count, 0);

    await applyMigrations(targetHandle.database);
    await applyMigrations(targetHandle.database);
    const restoredMigrationCount = await targetPool.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations",
    );
    assert.equal(restoredMigrationCount.rows[0]?.count, migrationCount.rows[0]?.count);
    assert.deepEqual(await schemaFingerprint(targetPool), sourceFingerprint);

    const transaction = await targetPool.connect();
    try {
      await transaction.query("begin");
      await transaction.query("alter table registry.players add column recovery_drill_probe text");
      await transaction.query("update registry.players set recovery_drill_probe = 'changed' where id = $1", [playerId]);
      await assert.rejects(
        transaction.query(
          `insert into registry.players
             (id, member_name, member_name_normalized, nickname, nickname_normalized, tag_line, tag_line_normalized)
           values ($1, 'duplicate', 'duplicate', 'duplicate', $2, 'V2', 'v2')`,
          [randomUUID(), `recovery${suffix}`],
        ),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );
    } finally {
      await transaction.query("rollback");
      transaction.release();
    }
    const probeColumn = await targetPool.query<{ count: number }>(`
      select count(*)::int as count from information_schema.columns
       where table_schema = 'registry' and table_name = 'players'
         and column_name = 'recovery_drill_probe'
    `);
    assert.equal(probeColumn.rows[0]?.count, 0);
    assert.deepEqual(await fixtureProjection(targetPool, accountId, playerId), sourceFixture);

    process.stdout.write(`${JSON.stringify({
      kind: "isolated-postgresql-recovery",
      archiveBytes: archive.size,
      archiveSha256,
      migrationCount: migrationCount.rows[0]?.count,
      migrationHead: journal.entries?.at(-1)?.tag,
      tableCount: Object.keys(sourceCounts).length,
      schemaDefinitionCount: sourceFingerprint.count,
      exactTableCountsMatched: true,
      fixtureRelationMatched: true,
      foreignKeysValidated: true,
      migrationReplayNoop: true,
      failedMigrationRolledBack: true,
    })}\n`);
  } finally {
    await targetPool?.end();
    await target.dispose();
    await sourcePool.end();
    await rm(runDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
