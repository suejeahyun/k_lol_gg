import "server-only";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { configuredRuntimeDatabaseUrl } from "@/platform/db/runtime-database-url";

import { getDatabase } from "@/platform/db/client";

import { PostgresAccountRepository } from "./postgres-account-repository";

export function getRuntimeAccountRepository() {
  if (!configuredRuntimeDatabaseUrl()) return null;
  try {
    return new PostgresAccountRepository(getDatabase(), SERVICE_BRAND.id !== "hub");
  } catch {
    return null;
  }
}
