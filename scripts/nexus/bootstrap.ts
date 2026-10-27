import { Pool } from "pg";
import { bootstrapEmptyNexusDatabase, nexusBootstrapTarget } from "./empty-database";

const target = nexusBootstrapTarget(process.env);
const pool = new Pool({ connectionString: target.connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  console.log(JSON.stringify(await bootstrapEmptyNexusDatabase(pool, target.databaseName), null, 2));
} catch (error) {
  // The helpers' errors contain table names, never a connection URL or credentials.
  console.error(error instanceof Error && error.message.startsWith("NEXUS") ? error.message : "NEXUS bootstrap failed; inspect the dedicated database before retrying.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
