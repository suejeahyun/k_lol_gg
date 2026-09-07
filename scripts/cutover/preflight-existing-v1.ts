import { Pool } from "pg";

import { assertV1SourceDatabase } from "./preflight-v1-database";

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be PostgreSQL.");
  }
  return value;
}

const pool = new Pool({
  connectionString: databaseUrl(),
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  application_name: "klol-v2-cutover-preflight",
});

const client = await pool.connect();
try {
  await client.query("begin transaction read only isolation level repeatable read");
  const inventory = await assertV1SourceDatabase(client);
  const counts = await client.query<{
    accounts: string;
    players: string;
    champions: string;
    seasons: string;
    series: string;
    approved_super_admins: string;
    pg_trgm_ready: boolean;
  }>(`
    select
      (select count(*) from public."UserAccount")::text as accounts,
      (select count(*) from public."Player")::text as players,
      (select count(*) from public."Champion")::text as champions,
      (select count(*) from public."Season")::text as seasons,
      (select count(*) from public."MatchSeries")::text as series,
      (select count(*) from public."UserAccount"
        where "role"::text = 'SUPER_ADMIN' and "status"::text = 'APPROVED')::text
        as approved_super_admins,
      exists(select 1 from pg_extension where extname = 'pg_trgm') as pg_trgm_ready
  `);
  await client.query("rollback");
  process.stdout.write(`${JSON.stringify({
    status: "ready",
    publicTableCount: inventory.sourceCount,
    v2TableCount: inventory.targetCount,
    sourceRows: counts.rows[0],
  })}\n`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
