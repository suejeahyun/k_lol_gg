import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index";

export type V2Database = NodePgDatabase<typeof schema>;

export type DatabaseHandle = Readonly<{
  database: V2Database;
  pool: Pool;
}>;

export function createPgPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  if (!connectionString) {
    throw new Error("PostgreSQL connection string is required.");
  }

  return new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    query_timeout: 15_000,
    ...overrides,
  });
}

export function createDatabase(pool: Pool): V2Database {
  return drizzle(pool, { schema });
}

export function createDatabaseHandle(connectionString: string, overrides: PoolConfig = {}): DatabaseHandle {
  const pool = createPgPool(connectionString, overrides);
  return { database: createDatabase(pool), pool };
}
