import { Pool } from "pg";
import { bootstrapHubDatabase, hubBootstrapAdministrator, hubBootstrapTarget } from "./empty-database";

const target = hubBootstrapTarget(process.env);
const administrator = hubBootstrapAdministrator(process.env);
const pool = new Pool({ connectionString: target.connectionString, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 30_000, lock_timeout: 5_000 });
try {
  console.log(JSON.stringify(await bootstrapHubDatabase(pool, target.databaseName, administrator), null, 2));
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("HUB") ? error.message : "HUB bootstrap failed; inspect the dedicated database before retrying. No child database was accessed.");
  process.exitCode = 1;
} finally {
  delete process.env.HUB_ADMIN_PASSWORD;
  await pool.end();
}
