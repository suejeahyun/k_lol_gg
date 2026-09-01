import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { V2Database } from "./database";

export const defaultMigrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export function applyMigrations(
  database: V2Database,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  return migrate(database, { migrationsFolder });
}
