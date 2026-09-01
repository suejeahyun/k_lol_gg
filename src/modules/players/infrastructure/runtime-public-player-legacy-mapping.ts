import "server-only";

import { getDatabase } from "@/platform/db/client";

import { parseLegacyPlayerId } from "../domain/admin-player";
import { PostgresPublicPlayerLegacyMappingRepository } from "./postgres-public-player-legacy-mapping-repository";

export type RuntimeLegacyMappingResult =
  | Readonly<{ state: "ready"; playerId: string | null }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;

export async function resolveRuntimePublicPlayerLegacyMapping(
  rawLegacyId: string,
): Promise<RuntimeLegacyMappingResult> {
  const legacyId = parseLegacyPlayerId(rawLegacyId);
  if (!legacyId) return { state: "ready", playerId: null };
  if (process.env.V2_PUBLIC_DATA_SOURCE !== "postgres" || !process.env.DATABASE_URL) {
    return { state: "unavailable" };
  }

  try {
    const repository = new PostgresPublicPlayerLegacyMappingRepository(getDatabase());
    return { state: "ready", playerId: await repository.findPublicUuidByLegacyId(legacyId) };
  } catch {
    return { state: "error" };
  }
}
