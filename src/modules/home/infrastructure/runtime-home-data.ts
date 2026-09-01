import "server-only";

import { getDatabase } from "@/platform/db/client";

import { createLoadHomeSnapshot } from "../application/load-home-snapshot";
import type { HomeSnapshotResult } from "../domain/home-snapshot";
import { PostgresHomeRepository } from "./postgres-home-repository";

function postgresModeEnabled(): boolean {
  return process.env.V2_PUBLIC_DATA_SOURCE === "postgres" && Boolean(process.env.DATABASE_URL);
}
export async function loadRuntimeHomeSnapshot(): Promise<HomeSnapshotResult> {
  if (!postgresModeEnabled()) return { state: "unavailable" };

  try {
    const repository = new PostgresHomeRepository(getDatabase());
    const snapshot = await createLoadHomeSnapshot(repository)();
    return { state: "ready", snapshot };
  } catch {
    return { state: "error" };
  }
}
