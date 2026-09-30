import "server-only";
import { getDatabaseHandle } from "@/platform/db/client";
import { PostgresUsageRepository } from "./postgres-usage";
export function usageRepository() { return new PostgresUsageRepository(getDatabaseHandle().pool); }
export function excludedUsageUsers(): string[] {
  return (process.env.USAGE_ANALYTICS_EXCLUDED_USER_IDS ?? "").split(",").map((v) => v.trim())
    .filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
}
