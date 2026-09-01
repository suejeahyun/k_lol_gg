import "server-only";

import { getDatabase } from "@/platform/db/client";

import { SeasonService } from "../application/season-service";
import { PostgresSeasonRepository } from "./postgres-season-repository";

export function getRuntimeSeasonService(): SeasonService | null {
  try {
    return new SeasonService(new PostgresSeasonRepository(getDatabase()));
  } catch {
    return null;
  }
}

export type RuntimeSeasonData<T> =
  | { state: "ready"; data: T }
  | { state: "unavailable" }
  | { state: "error" };

export async function loadRuntimeSeasonData<T>(
  loader: (service: SeasonService) => Promise<T>,
): Promise<RuntimeSeasonData<T>> {
  const service = getRuntimeSeasonService();
  if (!service) return { state: "unavailable" };
  try {
    return { state: "ready", data: await loader(service) };
  } catch {
    return { state: "error" };
  }
}
