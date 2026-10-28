import "server-only";

import { createDatabaseHandle, type DatabaseHandle } from "./database";
import { requireRuntimeDatabaseUrl } from "./runtime-database-url";
import { SERVICE_BRAND } from "@/lib/service-brand";

declare global {
  var __klolV2DatabaseHandle: DatabaseHandle | undefined;
  var __nexusDatabaseHandle: DatabaseHandle | undefined;
  var __ggHubDatabaseHandle: DatabaseHandle | undefined;
}

function readPoolMax(): number {
  const fallback = process.env.VERCEL ? 1 : 5;
  const parsed = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : fallback;
}

export function getDatabaseHandle(): DatabaseHandle {
  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error("The V2 PostgreSQL client requires the Node.js runtime.");
  }

  const connectionString = requireRuntimeDatabaseUrl();
  if (SERVICE_BRAND.id === "hub") {
    globalThis.__ggHubDatabaseHandle ??= createDatabaseHandle(connectionString, { max: readPoolMax() });
    return globalThis.__ggHubDatabaseHandle;
  }
  if (SERVICE_BRAND.id === "nexus") {
    globalThis.__nexusDatabaseHandle ??= createDatabaseHandle(connectionString, { max: readPoolMax() });
    return globalThis.__nexusDatabaseHandle;
  }
  if (!globalThis.__klolV2DatabaseHandle) {
    globalThis.__klolV2DatabaseHandle = createDatabaseHandle(connectionString, {
      max: readPoolMax(),
    });
  }

  return globalThis.__klolV2DatabaseHandle;
}

export function getDatabase() {
  return getDatabaseHandle().database;
}
