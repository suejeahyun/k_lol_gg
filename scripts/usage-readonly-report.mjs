import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";

// Explicit local env file only. Never print its values, URLs or raw account rows.
const [envFile, outputFile] = process.argv.slice(2);
if (!envFile || !outputFile) throw new Error("Usage: node scripts/usage-readonly-report.mjs <local-env-file> <output.json>");
const env = parseEnv(await readFile(envFile, "utf8"));
if (!env.DATABASE_URL || env.DATABASE_URL.includes("SENSITIVE")) throw new Error("Readable DATABASE_URL is required in the local env file.");
const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 7000, statement_timeout: 10000 });
try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const clock = await client.query(`SELECT now() AS checked_at, date_trunc('month',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' AS month_start`);
  const accounts = await client.query(`SELECT role,status,count(*)::int AS accounts,
    count(*) FILTER (WHERE legacy_id IS NOT NULL)::int AS legacy_linked
    FROM auth.user_accounts WHERE deleted_at IS NULL GROUP BY role,status ORDER BY role,status`);
  const legacyAccounts = await client.query(`SELECT role,status,count(*)::int AS accounts FROM public."UserAccount" WHERE "deletedAt" IS NULL GROUP BY role,status ORDER BY role,status`);
  const sessions = await client.query(`SELECT count(*)::int AS retained_sessions,
    count(DISTINCT s.user_account_id)::int AS unique_accounts,
    min(s.issued_at) AS earliest_issued_at,max(s.issued_at) AS latest_issued_at,
    count(*) FILTER (WHERE s.issued_at >= $1)::int AS month_session_issuances,
    count(DISTINCT s.user_account_id) FILTER (WHERE s.issued_at >= $1)::int AS month_accounts_with_issuance
    FROM auth.sessions s JOIN auth.user_accounts a ON a.id=s.user_account_id
    WHERE s.kind='USER' AND s.purpose='ACCOUNT' AND a.role='USER' AND a.deleted_at IS NULL`, [clock.rows[0].month_start]);
  const tables = await client.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
    AND (table_schema='usage' OR table_name ~* 'visit|page.?view|click|analytic') ORDER BY 1,2`);
  const audit = await client.query(`SELECT count(*)::int AS retained_events,
    min(created_at) AS earliest_at,max(created_at) AS latest_at FROM audit.events`);
  await client.query("ROLLBACK");
  const result={...clock.rows[0],sourceEnvFile:envFile,productionBinding:"Not verified against the masked Vercel production DATABASE_URL",accounts:accounts.rows,legacyAccounts:legacyAccounts.rows,sessions:sessions.rows[0],candidateUsageTables:tables.rows,audit:audit.rows[0],limitations:["Session issuance is not a visit; retained sessions may be pruned.","No raw member names, IDs, tokens or database credentials are included.","V1 and V2 account counts overlap and must not be added."]};
  await writeFile(outputFile,JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result));
} catch(error) {
  console.error(JSON.stringify({error:typeof error?.code === "string"?error.code:"READ_ONLY_REPORT_FAILED"}));
  process.exitCode=1;
} finally { await client.end(); }
