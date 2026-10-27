import type { Pool } from "pg";
import { createDatabase } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { requireRuntimeDatabaseUrl, type DatabaseRuntimeEnvironment } from "../../src/platform/db/runtime-database-url";

export type NexusBootstrapEnvironment = DatabaseRuntimeEnvironment & Readonly<{
  NEXUS_DATABASE_NAME?: string;
  NEXUS_BOOTSTRAP_CONFIRM?: string;
}>;

export function nexusBootstrapTarget(environment: NexusBootstrapEnvironment): Readonly<{ connectionString: string; databaseName: string }> {
  if (environment.NEXT_PUBLIC_SERVICE_ID !== "nexus") throw new Error("NEXUS bootstrap requires NEXT_PUBLIC_SERVICE_ID=nexus.");
  if (environment.NEXUS_BOOTSTRAP_CONFIRM !== "CREATE_EMPTY_NEXUS") throw new Error("NEXUS_BOOTSTRAP_CONFIRM must be CREATE_EMPTY_NEXUS.");
  const connectionString = requireRuntimeDatabaseUrl(environment);
  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!environment.NEXUS_DATABASE_NAME || databaseName !== environment.NEXUS_DATABASE_NAME || ["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error("NEXUS_DATABASE_NAME must exactly identify the new, dedicated application database.");
  }
  return { connectionString, databaseName };
}

const baseSettings = new Set(["operations.site_settings", "recruiting.kakao_operation_settings", "usage.collection"]);
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function applicationTables(pool: Pool) {
  return (await pool.query<{ schema: string; name: string }>(`
    select schemaname as schema, tablename as name from pg_tables
    where schemaname not like 'pg_%' and schemaname not in ('information_schema', 'drizzle')
    order by schemaname, tablename
  `)).rows;
}

/** Only the three migration-owned singleton settings may contain rows. */
export async function assertEmptyNexusBusinessData(pool: Pool): Promise<number> {
  const tables = await applicationTables(pool);
  for (const table of tables) {
    const key = `${table.schema}.${table.name}`;
    const qualified = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
    if (baseSettings.has(key)) {
      const count = Number((await pool.query(`select count(*)::int as count from ${qualified}`)).rows[0].count);
      if (count !== 1) throw new Error(`NEXUS bootstrap refused: unexpected initial settings in ${key}.`);
    } else {
      const exists = (await pool.query(`select exists(select 1 from ${qualified} limit 1) as present`)).rows[0].present;
      if (exists) throw new Error(`NEXUS bootstrap refused: ${key} contains existing data. No rows were deleted or imported.`);
    }
  }
  return tables.length - tables.filter((table) => baseSettings.has(`${table.schema}.${table.name}`)).length;
}

export async function bootstrapEmptyNexusDatabase(pool: Pool, expectedDatabaseName: string) {
  const actualName = (await pool.query<{ name: string }>("select current_database() as name")).rows[0].name;
  if (actualName !== expectedDatabaseName) throw new Error("NEXUS bootstrap refused: connected database does not match the confirmed target.");
  // A dedicated max:1 pool keeps this lock on the migration connection.
  await pool.query("select pg_advisory_lock(hashtext('nexus-empty-database-bootstrap'))");
  try {
    const existing = await applicationTables(pool);
    if (existing.length) {
      if (!existing.some((table) => table.schema === "operations" && table.name === "site_settings")) {
        throw new Error("NEXUS bootstrap requires a new empty database; existing unrecognized tables were found.");
      }
      const identity = (await pool.query("select brand_name from operations.site_settings where id = 1")).rows[0]?.brand_name;
      if (identity !== "NEXUS.GG") throw new Error("NEXUS bootstrap refused: this database is not an initialized NEXUS database.");
      await assertEmptyNexusBusinessData(pool);
    }
    await applyMigrations(createDatabase(pool));
    if (!existing.length) {
      await pool.query("update operations.site_settings set brand_name = 'NEXUS.GG' where id = 1");
    }
    const emptyBusinessTables = await assertEmptyNexusBusinessData(pool);
    const migrationCount = Number((await pool.query("select count(*)::int as count from drizzle.__drizzle_migrations")).rows[0].count);
    return { service: "nexus", databaseName: actualName, migrationCount, emptyBusinessTables, businessRows: 0, state: existing.length ? "already-initialized" : "initialized" } as const;
  } finally {
    await pool.query("select pg_advisory_unlock(hashtext('nexus-empty-database-bootstrap'))");
  }
}
