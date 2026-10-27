import { Pool } from "pg";
import { nexusBootstrapTarget } from "./empty-database";
import { seedNexusReferenceCatalog } from "./reference-catalog";

const target = nexusBootstrapTarget(process.env);
const pool = new Pool({ connectionString: target.connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  console.log(JSON.stringify(await seedNexusReferenceCatalog(pool, target.databaseName), null, 2));
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("NEXUS") ? error.message : "NEXUS reference initialization failed; existing rows were not overwritten.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
