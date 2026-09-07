import "server-only";

import { getDatabase } from "@/platform/db/client";

import { MmrService } from "../application/mmr-service";
import { PostgresMmrRepository } from "./postgres-mmr-repository";

export function getRuntimeMmrService() {
  try {
    return new MmrService(new PostgresMmrRepository(getDatabase()));
  } catch {
    return null;
  }
}

export async function loadRuntimeMmr<T>(loader: (service: MmrService) => Promise<T>) {
  const service = getRuntimeMmrService();
  if (!service) return { state: "unavailable" as const };
  try {
    return { state: "ready" as const, data: await loader(service) };
  } catch {
    return { state: "error" as const };
  }
}
