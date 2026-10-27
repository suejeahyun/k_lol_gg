import "server-only";
import { configuredRuntimeDatabaseUrl } from "@/platform/db/runtime-database-url";

import { getDatabase } from "@/platform/db/client";

import { PostgresAccountRepository } from "./postgres-account-repository";

export function getRuntimeAccountRepository() {
  if (!configuredRuntimeDatabaseUrl()) return null;
  try {
    return new PostgresAccountRepository(getDatabase());
  } catch {
    return null;
  }
}
