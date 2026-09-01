import "server-only";

import { createDatabaseHandle, type DatabaseHandle } from "./database";

declare global {
  var __klolV2DatabaseHandle: DatabaseHandle | undefined;
}

function readPoolMax(): number {
  const fallback = process.env.VERCEL ? 1 : 5;
  const parsed = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : fallback;
}

function readDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is not configured for this server runtime.");
  }

  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }

  return value;
}

export function getDatabaseHandle(): DatabaseHandle {
  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error("The V2 PostgreSQL client requires the Node.js runtime.");
  }

  if (!globalThis.__klolV2DatabaseHandle) {
    globalThis.__klolV2DatabaseHandle = createDatabaseHandle(readDatabaseUrl(), {
      max: readPoolMax(),
    });
  }

  return globalThis.__klolV2DatabaseHandle;
}

export function getDatabase() {
  return getDatabaseHandle().database;
}
