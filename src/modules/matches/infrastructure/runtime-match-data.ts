import "server-only";

import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { getDatabase } from "@/platform/db/client";

import { MatchService } from "../application/match-service";
import { PostgresMatchRepository } from "./postgres-match-repository";
import { getRuntimePrivateAdapters } from "./runtime-private-assets";

/**
 * Match writes intentionally require the database authentication runtime. A
 * fixture cookie must never authorize a transaction against persistent match
 * data. Private adapters are available only behind the exact local flag; a
 * production deployment without configured adapters fails closed on upload.
 */
export function getRuntimeMatchService(): MatchService | null {
  const auth = resolveRuntimeAuthContext();
  if (!auth || auth.mode !== "database") return null;
  try {
    const privateAdapters = getRuntimePrivateAdapters();
    return new MatchService(
      new PostgresMatchRepository(getDatabase()),
      auth.rateLimitPepper,
      privateAdapters?.storage ?? null,
      privateAdapters?.ocr ?? null,
    );
  } catch {
    return null;
  }
}

export type RuntimeMatchData<T> =
  | Readonly<{ state: "ready"; data: T }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;

export async function loadRuntimeMatchData<T>(
  loader: (service: MatchService) => Promise<T>,
): Promise<RuntimeMatchData<T>> {
  const service = getRuntimeMatchService();
  if (!service) return { state: "unavailable" };
  try {
    return { state: "ready", data: await loader(service) };
  } catch {
    return { state: "error" };
  }
}
