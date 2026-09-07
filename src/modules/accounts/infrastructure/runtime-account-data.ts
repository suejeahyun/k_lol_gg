import "server-only";

import { getDatabase } from "@/platform/db/client";

import { PostgresAccountRepository } from "./postgres-account-repository";

export function getRuntimeAccountRepository() {
  if (!process.env.DATABASE_URL) return null;
  try {
    return new PostgresAccountRepository(getDatabase());
  } catch {
    return null;
  }
}
