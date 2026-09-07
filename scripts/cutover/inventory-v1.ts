import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  application_name: "klol-v2-cutover-inventory",
});
const client = await pool.connect();
try {
  await client.query("begin transaction read only isolation level repeatable read");
  const tables = await client.query<{ table_name: string }>(`
    select table_name
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  `);
  const counts: Record<string, number> = {};
  for (const { table_name: tableName } of tables.rows) {
    const quoted = `"${tableName.replaceAll('"', '""')}"`;
    const result = await client.query<{ count: string }>(`select count(*)::text as count from public.${quoted}`);
    const count = Number.parseInt(result.rows[0]?.count ?? "", 10);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid row count for ${tableName}.`);
    if (count > 0) counts[tableName] = count;
  }
  await client.query("rollback");
  process.stdout.write(`${JSON.stringify({ nonEmptyTables: counts })}\n`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
